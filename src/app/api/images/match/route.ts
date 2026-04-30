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

        // 3a. Fast keyword map lookup (O(1), no API call)
        const kwMatch = matchByKeyword(safeQuery);
        if (kwMatch) {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[images/match] keyword hit for "${query}"`);
            }
            return NextResponse.json({ image_url: kwMatch.image_url, description: kwMatch.description, similarity: 1 });
        }

        // 3b. Embed the query using text-embedding-3-small
        const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: safeQuery,
        });
        const queryVector = embeddingRes.data[0].embedding;

        // 4. Vector similarity search via Supabase RPC (pgvector cosine distance)
        //    Threshold 0.45: short food names vs long prose descriptions land at ~0.55-0.65.
        const { data, error } = await (supabaseServer as any).rpc('match_default_image', {
            query_embedding: queryVector,
            match_threshold: 0.45,
            match_count: 1,
        });

        if (error) {
            // RPC may not exist yet (migration not run). Fail silently so the
            // rest of onboarding still works — user just sees the upload box.
            console.error('[images/match] Supabase RPC error:', error.message);
            return NextResponse.json({ image_url: null, description: null, similarity: null });
        }

        if (!data?.length) {
            return NextResponse.json({ image_url: null, description: null, similarity: null });
        }

        const best = data[0];

        // Log for threshold tuning — only in non-prod to avoid leaking
        // restaurant menu names through aggregated logs.
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[images/match] query="${query}" → similarity=${best.similarity?.toFixed(3)}`);
        }

        return NextResponse.json({
            image_url: best.image_url,
            description: best.description,
            similarity: best.similarity,
        });
    } catch (err) {
        // Never crash onboarding — return null and let the UI degrade gracefully.
        console.error('[images/match] Unexpected error:', err);
        return NextResponse.json({ image_url: null, description: null, similarity: null });
    }
}
