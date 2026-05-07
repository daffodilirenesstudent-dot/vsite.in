// src/app/api/bulk-import/extract/route.ts
// Extracts menu items from photos using the same two-pass pipeline as onboarding:
//   Pass 1 — GPT-4o vision, compact tuple output (single/variant/combo with prices)
//   Pass 2 — GPT-4o descriptions (South Indian style, variant size-price format)
// Works with both printed menu photos and food/dish photos.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { validateImageFile } from '@/lib/fileValidation';
import { rateLimit } from '@/lib/rateLimit';
import { extractMenuItemsFromImages } from '@/lib/menuExtractor';

export const maxDuration = 60;
export const runtime = 'nodejs';

const MAX_PHOTOS = 3;
const EXTRACT_LIMIT_PER_HR = 20;

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    // Auth
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer '))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = await verifyFirebaseToken(auth.replace('Bearer ', ''));
    if (!userId)
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    // Rate limit
    const rl = rateLimit(`bulk-extract:${userId}`, { limit: EXTRACT_LIMIT_PER_HR, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a few minutes.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
      );
    }

    // Parse form
    let formData: FormData;
    try { formData = await request.formData(); }
    catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

    const photoEntries = formData.getAll('photos').slice(0, MAX_PHOTOS);
    if (photoEntries.length === 0)
      return NextResponse.json({ error: 'Please upload at least one photo.' }, { status: 400 });

    console.log(`[bulk-import/extract] received ${photoEntries.length} photo(s)`);

    // Validate images (magic-byte sniff — reject non-images)
    const validated: Array<{ file: File; mime: string }> = [];
    for (const entry of photoEntries) {
      if (!(entry instanceof File)) continue;
      console.log(`[bulk-import/extract] file: ${entry.name} ${entry.size}B type=${entry.type}`);
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
    //   Pass 1: compact tuple extraction (singles, variants with sizes+prices, combos)
    //   Pass 2: South Indian style descriptions in parallel batches
    const items = await extractMenuItemsFromImages(imageBuffers);
    console.log(`[bulk-import/extract] extracted ${items.length} items in ${Date.now() - t0}ms`);

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
  }
}
