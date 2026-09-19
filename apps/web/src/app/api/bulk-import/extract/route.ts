// src/app/api/bulk-import/extract/route.ts
// Extracts menu items from photos using the same two-pass pipeline as onboarding:
//   Pass 1 — GPT-4o vision, compact tuple output (single/variant/combo with prices)
//   Pass 2 — GPT-4o descriptions (South Indian style, variant size-price format)
// Works with both printed menu photos and food/dish photos.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { validateImageFile } from '@/lib/platform/fileValidation';
import { rateLimit } from '@/lib/platform/rateLimit';
import { extractMenuItemsFromImages, extractMenuItems } from '@/lib/menu/menuExtractor';
import { imageToMenuText } from '@/lib/menu/sarvamVision';
import { boundBody } from '@/lib/platform/boundedBody';
import { admitUpload } from '@/lib/platform/uploadAdmission';
import { aiSpendAllowed } from '@/lib/menu/aiSpendGuard';

import { logger } from '@/lib/platform/logger';
export const maxDuration = 60;
export const runtime = 'nodejs';

const MAX_PHOTOS = 5;
const EXTRACT_LIMIT_PER_HR = 20;

/**
 * Hard ceiling on the whole multipart body, checked before `request.formData()`
 * buffers it into memory.
 *
 * The per-file 10MB check inside validateImageFile runs only after every part is
 * already allocated, and there is no platform body cap on DigitalOcean (the old
 * comment here cited Vercel's ~4.5MB, which no longer applies). See the same
 * note in api/onboarding/extract and 2026-09 assessment Finding 7.
 */
const MAX_BODY_BYTES = MAX_PHOTOS * 2 * 1024 * 1024;

export async function POST(incoming: NextRequest) {
  const t0 = Date.now();
  let releaseAdmission: (() => void) | null = null;
  try {
    // Auth
    const auth = incoming.headers.get('Authorization');
    if (!auth?.startsWith('Bearer '))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = await verifyFirebaseToken(auth.replace('Bearer ', ''));
    if (!userId)
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    // Same daily AI budget as onboarding: one ceiling for all extraction spend.
    if (!aiSpendAllowed())
      return NextResponse.json({ error: 'Menu scanning is paused for today. You can add items by hand.', code: 'AI_PAUSED' }, { status: 503 });

    // Rate limit
    const rl = rateLimit(`bulk-extract:${userId}`, { limit: EXTRACT_LIMIT_PER_HR, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a few minutes.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
      );
    }

    // Size gate BEFORE the body is buffered — see MAX_BODY_BYTES above.
    const tooLarge = NextResponse.json(
      { error: 'Those photos are too large. Please retry — the app will compress them.', code: 'PAYLOAD_TOO_LARGE' },
      { status: 413 },
    );
    const declaredLength = Number(incoming.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_BODY_BYTES) return tooLarge;

    // Shares the onboarding memory budget: same process, same 512MB. Admitted
    // before the body is read, so a refused request costs nothing.
    const admission = await admitUpload({
      userId, bytes: declaredLength > 0 ? declaredLength : MAX_BODY_BYTES, maxWaitMs: 10_000,
    });
    if (!admission.ok) {
      return NextResponse.json(
        { error: 'The scanner is busy. Please try again in a moment.', code: admission.reason === 'user-busy' ? 'SCAN_IN_PROGRESS' : 'BUSY' },
        { status: admission.reason === 'user-busy' ? 409 : 503, headers: { 'Retry-After': String(admission.retryAfterSec) } },
      );
    }
    releaseAdmission = admission.ticket.release;

    // Parse form, bounded while it streams (a chunked body declares no length).
    const bounded = boundBody(incoming, MAX_BODY_BYTES);
    const request = bounded.request;
    let formData: FormData;
    try { formData = await request.formData(); }
    catch {
      if (bounded.exceeded()) return tooLarge;
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    // Chunked uploads declare no Content-Length; re-check what actually arrived
    // before spending anything on it.
    const totalBytes = formData.getAll('photos')
      .reduce((sum, e) => sum + (e instanceof File ? e.size : 0), 0);
    if (totalBytes > MAX_BODY_BYTES) return tooLarge;

    const photoEntries = formData.getAll('photos').slice(0, MAX_PHOTOS);
    if (photoEntries.length === 0)
      return NextResponse.json({ error: 'Please upload at least one photo.' }, { status: 400 });

    logger.debug(`[bulk-import/extract] received ${photoEntries.length} photo(s)`);

    // Validate images (magic-byte sniff — reject non-images)
    const validated: Array<{ file: File; mime: string }> = [];
    for (const entry of photoEntries) {
      if (!(entry instanceof File)) continue;
      logger.debug(`[bulk-import/extract] file: ${entry.name} ${entry.size}B type=${entry.type}`);
      const result = await validateImageFile(entry);
      if (result.ok) {
        validated.push({ file: entry, mime: result.mime });
      } else {
        console.warn(`[bulk-import/extract] rejected ${entry.name}: ${result.reason}`);
      }
    }
    if (validated.length === 0)
      return NextResponse.json({ error: 'None of your photos could be read. Upload clear JPG, PNG, or WebP photos under 10 MB each.' }, { status: 400 });

    // Read buffers
    const buffersResult = await Promise.allSettled(
      validated.map(async ({ file, mime }) => ({ buffer: Buffer.from(await file.arrayBuffer()), mime }))
    );
    const imageBuffers = buffersResult
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<{ buffer: Buffer; mime: string }>).value);

    if (imageBuffers.length === 0)
      return NextResponse.json({ error: 'Could not read any photos. Please retry.' }, { status: 400 });

    // Run the same two-pass pipeline as onboarding:
    //   Pass 1: compact tuple extraction (3 imgs/batch, parallel, detail:'high')
    //   Pass 2: gpt-4o-mini descriptions in parallel batches
    let items = await extractMenuItemsFromImages(imageBuffers);
    logger.debug(`[bulk-import/extract] fast-path: ${items.length} items in ${Date.now() - t0}ms`);

    // OCR fallback — same as onboarding, if direct extraction returns 0 items
    if (items.length === 0) {
      console.warn('[bulk-import/extract] fast-path returned 0 items — running OCR fallback');
      const ocrResults = await Promise.allSettled(
        imageBuffers.map(({ buffer, mime }) => imageToMenuText(buffer, mime))
      );
      const aggregatedOcr = ocrResults
        .map(r => (r.status === 'fulfilled' ? r.value : ''))
        .filter(t => t.trim())
        .join('\n\n---\n\n');
      if (aggregatedOcr) {
        items = await extractMenuItems(aggregatedOcr);
        logger.debug(`[bulk-import/extract] fallback: ${items.length} items in ${Date.now() - t0}ms total`);
      }
    }

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'We couldn\'t identify any menu items from those photos. Upload a clear photo of your printed menu or food dishes.' },
        { status: 422 }
      );
    }

    return NextResponse.json({ success: true, items, photosProcessed: imageBuffers.length });
  } catch (err) {
    console.error('[bulk-import/extract] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    releaseAdmission?.();
  }
}
