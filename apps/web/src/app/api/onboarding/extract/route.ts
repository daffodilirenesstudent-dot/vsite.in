// src/app/api/onboarding/extract/route.ts
// Step 1 of split onboarding: extract menu items from photos — no DB writes.
//
// Path, cheapest refusal first — nothing below a line runs unless every line
// above it passed:
//   1. Auth
//   2. Daily AI spend guard, global then per user → 503 AI_PAUSED / 429 DAILY_SCAN_LIMIT
//   3. Declared Content-Length                   → 413 PAYLOAD_TOO_LARGE
//   4. Store eligibility (same rule as /complete) → 403 PLAN_LIMIT / TRIAL_LIMIT
//   5. Token-aware admission: if OpenAI budget is so backed up that this scan
//      would time out waiting for it, keep the owner in the queue instead
//                                                → 503 BUSY
//   6. Memory admission, BEFORE the body is read → 503 BUSY / 409 SCAN_IN_PROGRESS
//   7. Rate limit (per user, per hour)           → 429 RATE_LIMITED
//   8. Bounded body parse                        → 413 PAYLOAD_TOO_LARGE
//   9. Magic-byte validation per photo
//  10. One extraction call per photo, through the token scheduler, with the
//      per-page fallback ladder (menuExtractor.ts). Pages that still fail are
//      returned as `failedPhotos`; the rest of the menu is kept.
//
// Why admission exists: measured on this path, a request holds ~7× its upload
// in RAM. The instance is one 512MB basic-xxs, so without admission eight
// typical scans — or two maximum-size bodies — at the same moment exhausted it,
// and the crash took every customer's QR menu down too.
//
// The body is bounded while it streams (`boundBody`), so a chunked upload with
// no Content-Length is cut off at the limit instead of buffered whole.
// `maxDuration` below is a Vercel setting; on DigitalOcean the working bound is
// the extraction deadline passed to the extractor.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { extractMenuPages, extractionQueueWaitMs, claimExtractionCapacity } from '@/lib/menu/menuExtractor';
import { validateImageFile } from '@/lib/platform/fileValidation';
import { rateLimit } from '@/lib/platform/rateLimit';
import { boundBody } from '@/lib/platform/boundedBody';
import { admitUpload } from '@/lib/platform/uploadAdmission';
import { checkStoreEligibility } from '@/lib/platform/storeEligibility';
import { aiSpendAllowed } from '@/lib/menu/aiSpendGuard';

import { logger } from '@/lib/platform/logger';
export const maxDuration = 60;
export const runtime = 'nodejs';

const MAX_PHOTOS = 15;          // server hard cap (client allows 10–15)
const EXTRACT_LIMIT_PER_HR = 10; // separate bucket from /complete

/**
 * Hard ceiling on the whole multipart body.
 *
 * The client compresses before upload (`@/lib/menu/imageCompress`) and skips
 * re-encoding only JPEGs already under 800KB, so a real 15-photo submission is
 * at most 15 × 800KB. Was 30MB, which at the measured 7× amplification is
 * ~200MB of RAM for one request.
 */
const MAX_BODY_BYTES = MAX_PHOTOS * 800 * 1024;

/** How long a request may wait for memory before being told to come back. */
function admissionWaitMs(): number {
  const n = Number(process.env.EXTRACT_ADMISSION_WAIT_MS);
  return Number.isFinite(n) && n >= 0 ? n : 10_000;
}

/** Budget for the extraction itself; keeps wait + work inside the client's 80s. */
function extractionDeadlineMs(): number {
  const n = Number(process.env.EXTRACT_DEADLINE_MS);
  return Number.isFinite(n) && n > 0 ? n : 50_000;
}

interface Failure {
  code: string;
  error: string;
  [extra: string]: unknown;
}

/** Every refusal carries a stable `code`; the onboarding screen words it in Tamil and English. */
function fail(status: number, body: Failure, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers });
}

export async function POST(incoming: NextRequest) {
  const t0 = Date.now();
  let releaseAdmission: (() => void) | null = null;
  let releaseClaim: (() => void) | null = null;
  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = incoming.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return fail(401, { code: 'UNAUTHORIZED', error: 'Unauthorized' });
    }
    const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
    if (!userId) {
      return fail(401, { code: 'INVALID_TOKEN', error: 'Invalid token' });
    }

    // ── 2. Daily spend guard ─────────────────────────────────────────────────
    if (!aiSpendAllowed()) {
      return fail(503, { code: 'AI_PAUSED', error: 'Menu scanning is paused for today. You can add your items by hand.' });
    }
    if (!aiSpendAllowed(userId)) {
      return fail(429, { code: 'DAILY_SCAN_LIMIT', error: "You've reached today's scanning limit. Add your items by hand, or scan again tomorrow." });
    }

    // ── 3. Size gate, BEFORE the body is buffered ─────────────────────────────
    // request.formData() materialises every part in memory. Anything rejected
    // after that point has already cost the allocation, so the only check that
    // helps is one that happens first. A chunked upload declares no length;
    // step 7 bounds that one while it streams.
    const declaredLength = Number(incoming.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return fail(413, { code: 'PAYLOAD_TOO_LARGE', error: 'Those photos are too large. Please use fewer photos or retake them.' });
    }

    // ── 4. Eligibility, before any money is spent ────────────────────────────
    const eligibility = await checkStoreEligibility(userId);
    if (!eligibility.ok) {
      return fail(eligibility.status, { code: eligibility.code, error: eligibility.error });
    }

    // ── 5. Token-aware admission ─────────────────────────────────────────────
    // Memory is not the only thing a burst runs out of. When the OpenAI
    // per-minute budget is backed up, an admitted scan would sit in the
    // scheduler until its deadline and come back with pages missing. Better to
    // leave it in the client-side queue, holding no memory. The photo count is
    // the client's hint (the body is unread); lying about it only affects the
    // liar's own queue position.
    const photoHint = Math.min(MAX_PHOTOS, Math.max(1, Number(incoming.headers.get('x-photo-count')) || 10));
    const tokenWaitMs = extractionQueueWaitMs(photoHint);
    if (tokenWaitMs > extractionDeadlineMs() * 0.6) {
      return fail(503, { code: 'BUSY', error: 'Many restaurants are joining right now. You are in the queue.' },
        { 'Retry-After': String(Math.min(60, Math.ceil(tokenWaitMs / 1000))) });
    }
    // Claimed synchronously after the check — no await in between — so the
    // next request's check already sees this scan's tokens.
    const claim = claimExtractionCapacity(photoHint);
    releaseClaim = claim.release;

    // ── 6. Memory admission ──────────────────────────────────────────────────
    const admission = await admitUpload({
      userId,
      bytes: declaredLength > 0 ? declaredLength : MAX_BODY_BYTES,
      maxWaitMs: admissionWaitMs(),
    });
    if (!admission.ok) {
      const retryAfter = { 'Retry-After': String(admission.retryAfterSec) };
      return admission.reason === 'user-busy'
        ? fail(409, { code: 'SCAN_IN_PROGRESS', error: 'Your menu is already being scanned.' }, retryAfter)
        : fail(503, { code: 'BUSY', error: 'Many restaurants are joining right now. You are in the queue.' }, retryAfter);
    }
    releaseAdmission = admission.ticket.release;

    // ── 7. Rate limit — counts only admitted attempts ────────────────────────
    const rl = rateLimit(`extract:${userId}`, { limit: EXTRACT_LIMIT_PER_HR, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return fail(429, { code: 'RATE_LIMITED', error: 'Too many scan attempts. Please try again later.' }, { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() });
    }

    // ── 8. Parse, bounded while it streams ───────────────────────────────────
    const bounded = boundBody(incoming, MAX_BODY_BYTES);
    const request = bounded.request;
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      if (bounded.exceeded()) {
        return fail(413, { code: 'PAYLOAD_TOO_LARGE', error: 'Those photos are too large. Please use fewer photos or retake them.' });
      }
      return fail(400, { code: 'BAD_REQUEST', error: 'Invalid request body. Please retry.' });
    }

    const shopName = (formData.get('shopName') as string | null)?.trim();
    if (!shopName) {
      return fail(400, { code: 'NO_SHOP_NAME', error: 'Shop name is required' });
    }
    if (shopName.length > 100) {
      return fail(400, { code: 'SHOP_NAME_TOO_LONG', error: 'Shop name must be 100 characters or fewer' });
    }

    const photoEntries = formData.getAll('photos').slice(0, MAX_PHOTOS);
    if (photoEntries.length === 0) {
      return fail(400, { code: 'NO_PHOTOS', error: 'Please upload at least one menu photo.' });
    }

    // ── 9. Validate; remember each photo's position for the owner ────────────
    const rejected: string[] = [];
    const rejectedPhotos: number[] = [];
    const validated: Array<{ file: File; mime: string; photo: number }> = [];
    for (let i = 0; i < photoEntries.length; i++) {
      const entry = photoEntries[i];
      if (!(entry instanceof File)) { rejectedPhotos.push(i + 1); continue; }
      const result = await validateImageFile(entry);
      if (!result.ok) {
        logger.warn(`[onboarding/extract] rejected upload: ${result.reason}`);
        rejected.push(result.reason);
        rejectedPhotos.push(i + 1);
        continue;
      }
      validated.push({ file: entry, mime: result.mime, photo: i + 1 });
    }

    if (validated.length === 0) {
      return fail(400, { code: 'UNREADABLE_PHOTOS', error: 'None of your photos could be read. Please upload clear JPG, PNG, or WebP photos.', rejected });
    }

    const images = await Promise.all(validated.map(async ({ file, mime }) => ({
      buffer: Buffer.from(await file.arrayBuffer()),
      mime,
    })));

    // ── 10. Extract ───────────────────────────────────────────────────────────
    const report = await extractMenuPages(images, {
      signal: incoming.signal,
      deadline: t0 + extractionDeadlineMs(),
      spendKey: userId,
      claim,
    });
    const failedPhotos = [...rejectedPhotos, ...report.failedPages.map(i => validated[i].photo)].sort((a, b) => a - b);
    logger.debug(`[onboarding/extract] ${report.items.length} items, ${failedPhotos.length} photos failed, ${Date.now() - t0}ms`);

    if (report.items.length === 0) {
      return fail(422, { code: 'NO_ITEMS_FOUND', error: "We couldn't read any menu items from those photos. Try clearer photos — or skip and add items by hand.", items: [], shopName, failedPhotos });
    }

    return NextResponse.json({
      success: true,
      shopName,
      items: report.items,
      partial: failedPhotos.length > 0,
      failedPhotos,
      rejected,
      stats: {
        photosUploaded: photoEntries.length,
        photosValid: validated.length,
        itemsExtracted: report.items.length,
        durationMs: Date.now() - t0,
      },
    });
  } catch (err) {
    console.error('[onboarding/extract] unexpected error:', err);
    return fail(500, { code: 'INTERNAL', error: 'Something went wrong on our side. Please try again.' });
  } finally {
    releaseClaim?.();
    releaseAdmission?.();
  }
}
