// src/app/api/onboarding/extract/route.ts
// Step 1 of split onboarding: extract menu items from photos — no DB writes.
//
// Path:
//   1. Auth + rate-limit (separate `extract` bucket)
//   2. Validate uploaded images (magic-byte sniff, size cap)
//   3. Pass 1+2 in menuExtractor (compact tuples → dedup → descriptions)
//   4. OCR fallback only if direct image extraction returns 0 items
//
// Constraints:
//   • Vercel Hobby caps function duration at 60s — we declare 60 explicitly.
//   • Vercel platform caps request body at ~4.5MB — client MUST compress images
//     before upload. Server enforces a hard upper bound as defence-in-depth.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { imageToMenuText } from '@/lib/sarvamVision';
import { extractMenuItems, extractMenuItemsFromImages } from '@/lib/menuExtractor';
import { validateImageFile } from '@/lib/fileValidation';
import { rateLimit } from '@/lib/rateLimit';

export const maxDuration = 60;
export const runtime = 'nodejs';

const MAX_PHOTOS = 15;          // server hard cap (client allows 10–15)
const EXTRACT_LIMIT_PER_HR = 10; // separate bucket from /complete

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Rate limit — separate bucket so a slow extract retry doesn't block /complete.
    const rl = rateLimit(`extract:${userId}`, { limit: EXTRACT_LIMIT_PER_HR, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many scan attempts. Please try again in a few minutes.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
      );
    }

    // ── Parse & validate photos ──────────────────────────────────────────────
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid request body. Please retry.' }, { status: 400 });
    }

    const shopName = (formData.get('shopName') as string | null)?.trim();
    if (!shopName) {
      return NextResponse.json({ error: 'Shop name is required' }, { status: 400 });
    }
    if (shopName.length > 100) {
      return NextResponse.json({ error: 'Shop name must be 100 characters or fewer' }, { status: 400 });
    }

    const photoEntries = formData.getAll('photos').slice(0, MAX_PHOTOS);
    if (photoEntries.length === 0) {
      return NextResponse.json({ error: 'Please upload at least one menu photo.' }, { status: 400 });
    }

    const rejected: string[] = [];
    const validated: Array<{ file: File; mime: string }> = [];
    for (const entry of photoEntries) {
      if (!(entry instanceof File)) continue;
      const result = await validateImageFile(entry);
      if (!result.ok) {
        console.warn(`[onboarding/extract] rejected upload: ${result.reason}`);
        rejected.push(result.reason);
        continue;
      }
      validated.push({ file: entry, mime: result.mime });
    }

    if (validated.length === 0) {
      return NextResponse.json(
        { error: 'None of your photos could be read. Please upload clear JPG, PNG, or WebP photos under 10 MB each.', rejected },
        { status: 400 }
      );
    }

    // ── Convert to buffers — fail-soft per image ─────────────────────────────
    const buffersResult = await Promise.allSettled(
      validated.map(async ({ file, mime }) => ({
        buffer: Buffer.from(await file.arrayBuffer()),
        mime,
      }))
    );
    const imageBuffers = buffersResult
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<{ buffer: Buffer; mime: string }>).value);

    if (imageBuffers.length === 0) {
      return NextResponse.json({ error: 'Could not read any photos. Please retry.' }, { status: 400 });
    }

    // ── Fast path: all images → single GPT-4o call ───────────────────────────
    let menuItems = await extractMenuItemsFromImages(imageBuffers);
    console.log(`[onboarding/extract] fast-path: ${menuItems.length} items in ${Date.now() - t0}ms`);

    // ── Fallback: OCR each image → aggregate → GPT-4o ────────────────────────
    if (menuItems.length === 0) {
      console.warn('[onboarding/extract] fast-path returned 0 items — running OCR fallback');
      const ocrResults = await Promise.allSettled(
        imageBuffers.map(({ buffer, mime }) => imageToMenuText(buffer, mime))
      );
      const aggregatedOcr = ocrResults
        .map(r => (r.status === 'fulfilled' ? r.value : ''))
        .filter(t => t.trim())
        .join('\n\n---\n\n');
      if (aggregatedOcr) {
        menuItems = await extractMenuItems(aggregatedOcr);
        console.log(`[onboarding/extract] fallback: ${menuItems.length} items in ${Date.now() - t0}ms total`);
      }
    }

    if (menuItems.length === 0) {
      return NextResponse.json(
        {
          error: "We couldn't read any menu items from those photos. Try clearer photos — or skip and add items manually after onboarding.",
          items: [],
          shopName,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      shopName,
      items: menuItems,
      stats: {
        photosUploaded: photoEntries.length,
        photosValid: validated.length,
        itemsExtracted: menuItems.length,
        durationMs: Date.now() - t0,
      },
    });
  } catch (err) {
    console.error('[onboarding/extract] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
