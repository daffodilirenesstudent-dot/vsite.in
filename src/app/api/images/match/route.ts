import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseServer } from '@/lib/supabase-server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { matchByKeyword } from '@/lib/defaultImages';
import { rateLimit } from '@/lib/rateLimit';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// One embedding round-trip + one Postgres RPC. Usually <2s but allow head-room.
export const maxDuration = 30;
export const runtime = 'nodejs';

// POST /api/images/match
// Body: { query: string }
// Returns: { image_url: string | null, description: string | null, similarity: number | null }
//
// Requires a valid Firebase session cookie (sb-access-token).
// The OpenAI call happens server-side so the API key is never exposed to the client.
export async function POST(req: NextRequest) {
    try {
        // 1. Authenticate — require a valid Firebase session cookie
        const token = req.cookies.get('sb-access-token')?.value;
        const uid = token ? await verifyFirebaseToken(token) : null;

        if (!uid) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Rate limit per UID — each call is a paid OpenAI embedding hit.
        // 30 / minute / user covers normal onboarding edits without enabling
        // a malicious user to script up runaway costs.
        const rl = rateLimit(`images-match:${uid}`, { limit: 30, windowMs: 60_000 });
        if (!rl.allowed) {
            return NextResponse.json(
                { error: 'Too many requests' },
                { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } },
            );
        }

        // 2. Parse and validate body
        const body = await req.json();
        const query: string = (body?.query ?? '').trim();

        if (!query) {
            return NextResponse.json({ image_url: null, description: null, similarity: null });
        }

        // Limit query length to prevent excessively large embedding inputs
        const safeQuery = query.slice(0, 500).toLowerCase();

        // 3a. Specificity-first keyword match (no API call).
        //     Tier 1 (exact=1.0), Tier 2 (filename=0.98), Tier 3 (fuzzy=0.80-0.95)
        //     return immediately — these are confident, specific matches.
        //     Tier 4 (generic=0.30-0.50) is kept as fallback but we still try
        //     the vector path to see if there's a better match in the DB.
        const kwMatch = matchByKeyword(safeQuery);
        if (kwMatch && (kwMatch.confidence ?? 1) >= 0.75) {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[images/match] specific match for "${query}" (confidence=${kwMatch.confidence})`);
            }
            return NextResponse.json({ image_url: kwMatch.image_url, description: kwMatch.description, similarity: kwMatch.confidence ?? 1 });
        }

        // 3b. Embed the query using text-embedding-3-small
        const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: safeQuery,
        });
        const queryVector = embeddingRes.data[0].embedding;

        // 4. Vector similarity search — retrieve top-5 instead of top-1 so we
        //    have candidates for the LLM rerank pass below.
        const { data, error } = await (supabaseServer as any).rpc('match_default_image', {
            query_embedding: queryVector,
            match_threshold: 0.35, // wider net; rerank will pick the right one
            match_count: 5,
        });

        if (error) {
            console.error('[images/match] Supabase RPC error:', error.message);
            // Vector failed but we may have a low-confidence fuzzy hit — surface it.
            if (kwMatch) {
                return NextResponse.json({ image_url: kwMatch.image_url, description: kwMatch.description, similarity: kwMatch.confidence ?? null });
            }
            return NextResponse.json({ image_url: null, description: null, similarity: null });
        }

        if (!data?.length) {
            // No vector hit — fall back to whatever fuzzy keyword we had (even low confidence)
            if (kwMatch) {
                return NextResponse.json({ image_url: kwMatch.image_url, description: kwMatch.description, similarity: kwMatch.confidence ?? null });
            }
            return NextResponse.json({ image_url: null, description: null, similarity: null });
        }

        // 5. LLM rerank — only when top-1 confidence is ambiguous (<0.65) AND
        //    multiple candidates are close. This catches cases where the top
        //    vector hit is wrong but the right answer is in the top-5.
        const top = data[0];
        const runnerUp = data[1];
        const ambiguous = top.similarity < 0.65 && runnerUp && (top.similarity - runnerUp.similarity) < 0.10;

        let chosen = top;
        if (ambiguous) {
            try {
                const rerankPrompt = `User typed: "${query}"\n\nWhich of these dishes is the best match?\n` +
                    data.map((d: { description: string }, i: number) => `${i}: ${d.description.split('\n')[0]}`).join('\n') +
                    `\n\nReply with just the index number (0-${data.length - 1}). If none match well, reply "none".`;
                const rerankRes = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: rerankPrompt }],
                    temperature: 0,
                    max_tokens: 5,
                });
                const reply = rerankRes.choices[0]?.message?.content?.trim() ?? '';
                const idx = parseInt(reply, 10);
                if (Number.isFinite(idx) && idx >= 0 && idx < data.length) {
                    chosen = data[idx];
                    if (process.env.NODE_ENV !== 'production') {
                        console.log(`[images/match] rerank chose index ${idx} for "${query}"`);
                    }
                } else if (reply.toLowerCase().startsWith('none')) {
                    // LLM says no good match — fall back to keyword/fuzzy, else null
                    if (kwMatch) {
                        return NextResponse.json({ image_url: kwMatch.image_url, description: kwMatch.description, similarity: kwMatch.confidence ?? null });
                    }
                    return NextResponse.json({ image_url: null, description: null, similarity: null });
                }
            } catch (err) {
                console.warn('[images/match] rerank failed, using top-1:', err);
            }
        }

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[images/match] query="${query}" → similarity=${chosen.similarity?.toFixed(3)}${ambiguous ? ' (reranked)' : ''}`);
        }

        return NextResponse.json({
            image_url: chosen.image_url,
            description: chosen.description,
            similarity: chosen.similarity,
        });
    } catch (err) {
        // Never crash onboarding — return null and let the UI degrade gracefully.
        console.error('[images/match] Unexpected error:', err);
        return NextResponse.json({ image_url: null, description: null, similarity: null });
    }
}
