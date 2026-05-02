// src/app/api/onboarding/extract/route.ts
// Step 1 of split onboarding: extract menu items from photos — no DB writes.
//
// Fast path: all images → single GPT-4o call (1 round trip, ~15-25s for 10 photos)
// Fallback:  parallel OCR per image → aggregated text → GPT-4o extraction
//            (used only if the direct image call fails)

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { imageToMenuText } from '@/lib/sarvamVision';
import { extractMenuItems, extractMenuItemsFromImages } from '@/lib/menuExtractor';
import { validateImageFile, MAX_IMAGE_BYTES } from '@/lib/fileValidation';
import { rateLimit } from '@/lib/rateLimit';

// GPT-4o with 10 high-detail images takes ~20-40s in practice.
// Bump maxDuration to 120s so we never hit the ceiling.
// (Vercel Pro allows up to 300s; hobby allows 60s — upgrade if still timing out on hobby)
export const maxDuration = 120;
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
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

    // Shared rate-limit bucket with /complete — 5 total per hour per user.
    const rl = rateLimit(`onboarding:${userId}`, { limit: 5, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many onboarding attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
      );
    }

    // ── Parse & validate photos ──────────────────────────────────────────────
    const formData = await request.formData();
    const shopName = (formData.get('shopName') as string | null)?.trim();
    if (!shopName) {
      return NextResponse.json({ error: 'Shop name is required' }, { status: 400 });
    }

    void MAX_IMAGE_BYTES;
    const photoEntries = formData.getAll('photos').slice(0, 10);
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

    if (photoEntries.length > 0 && validated.length === 0) {
      return NextResponse.json(
        {
          error: 'None of your photos could be read. Please upload clear JPG, PNG, or WebP photos under 10 MB each.',
          rejected,
        },
        { status: 400 }
      );
    }

    // ── Convert to buffers ───────────────────────────────────────────────────
    const imageBuffers = await Promise.all(
      validated.map(async ({ file, mime }) => ({
        buffer: Buffer.from(await file.arrayBuffer()),
        mime,
      }))
    );

    // ── Fast path: all images → single GPT-4o call ───────────────────────────
    let menuItems = await extractMenuItemsFromImages(imageBuffers);
    console.log(`[onboarding/extract] fast-path extracted ${menuItems.length} items`);

    // ── Fallback: OCR each image → aggregate → GPT-4o ────────────────────────
    if (menuItems.length === 0 && imageBuffers.length > 0) {
      console.warn('[onboarding/extract] fast-path returned 0 items — falling back to OCR pipeline');
      const ocrResults = await Promise.all(
        imageBuffers.map(async ({ buffer, mime }) => {
          try { return await imageToMenuText(buffer, mime); }
          catch { return ''; }
        })
      );
      const aggregatedOcr = ocrResults.filter(t => t.trim()).join('\n\n---\n\n');
      if (aggregatedOcr) {
        menuItems = await extractMenuItems(aggregatedOcr);
        console.log(`[onboarding/extract] fallback extracted ${menuItems.length} items`);
      }
    }

    if (validated.length > 0 && menuItems.length === 0) {
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
    });
  } catch (err) {
    console.error('[onboarding/extract] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
