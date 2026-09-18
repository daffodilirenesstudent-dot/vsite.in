import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { getImageLibrary } from '@/lib/menu/imageLibrary';
import { matchImage } from '@/lib/menu/conceptMatcher';
import { rateLimit } from '@/lib/platform/rateLimit';
import { logger } from '@/lib/platform/logger';

// Matching is pure in-process computation now — no embedding round trip, no
// pgvector RPC, no LLM rerank. The only I/O is the cached library read.
export const maxDuration = 10;
export const runtime = 'nodejs';

// POST /api/images/match
// Body: { query: string }
// Returns: { image_url: string | null, description: string | null, similarity: number | null }
//
// Requires a valid Firebase session cookie (sb-access-token).
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('sb-access-token')?.value;
    const uid = token ? await verifyFirebaseToken(token) : null;
    if (!uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Matching is free now, but the endpoint still touches the database on a
    // cold cache, so keep a ceiling on per-user request volume.
    const rl = rateLimit(`images-match:${uid}`, { limit: 60, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } },
      );
    }

    const body = await req.json();
    const query: string = (body?.query ?? '').trim();
    if (!query) {
      return NextResponse.json({ image_url: null, description: null, similarity: null });
    }

    const { index, byName } = await getImageLibrary();
    const result = matchImage(query.slice(0, 500), index);

    // Abstain is a real answer: the UI shows the upload box rather than a
    // wrong photograph. This is the behaviour that fixes "dal fry" -> fish fry.
    if (result.decision === 'abstain' || !result.image) {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug(`[images/match] abstain for "${query}" (${result.reason ?? 'no match'})`);
      }
      return NextResponse.json({ image_url: null, description: null, similarity: null });
    }

    const row = byName.get(result.image);
    if (!row) {
      return NextResponse.json({ image_url: null, description: null, similarity: null });
    }

    if (process.env.NODE_ENV !== 'production') {
      logger.debug(
        `[images/match] "${query}" -> ${result.image} `
        + `(${result.decision}, ${result.score?.toFixed(3)}, concepts=${result.concepts.join(',')})`,
      );
    }

    return NextResponse.json({
      image_url: row.imageUrl,
      description: row.description,
      similarity: result.score,
    });
  } catch (err) {
    // Never crash onboarding — return null and let the UI degrade gracefully.
    logger.error('[images/match] Unexpected error:', err);
    return NextResponse.json({ image_url: null, description: null, similarity: null });
  }
}
