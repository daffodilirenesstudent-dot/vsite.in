// src/app/api/onboarding/extract/route.ts
// Step 1 of split onboarding: OCR + GPT extraction only — no DB writes.
// Returns the extracted item list so the wizard can collect owner ratings.
// The final DB writes happen in /api/onboarding/complete after the wizard.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { imageToMenuText } from '@/lib/sarvamVision';
import { extractMenuItems } from '@/lib/menuExtractor';
import { validateImageFile, MAX_IMAGE_BYTES } from '@/lib/fileValidation';
import { rateLimit } from '@/lib/rateLimit';

// OCR (Sarvam) + GPT-4o extraction on up to 10 photos commonly takes 20–40s.
// Vercel's default timeout for serverless on hobby is 10s — that was the
// "menu upload won't go to next" symptom. Bump to 60s.
export const maxDuration = 60;
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

    // If the user uploaded photos but ALL were rejected, surface that clearly
    // instead of letting them advance into an empty wizard.
    if (photoEntries.length > 0 && validated.length === 0) {
      return NextResponse.json(
        {
          error: 'None of your photos could be read. Please upload clear JPG, PNG, or WebP photos under 10 MB each.',
          rejected,
        },
        { status: 400 }
      );
    }

    // ── OCR (parallel) ───────────────────────────────────────────────────────
    const ocrResults = await Promise.all(
      validated.map(async ({ file, mime }) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        try {
          return await imageToMenuText(buffer, mime);
        } catch (err) {
          console.warn('[onboarding/extract] OCR failed for one photo:', err);
          return '';
        }
      })
    );
    const aggregatedOcr = ocrResults.filter(t => t.trim()).join('\n\n---\n\n');

    // ── Extract structured items ──────────────────────────────────────────────
    const menuItems = aggregatedOcr ? await extractMenuItems(aggregatedOcr) : [];
    console.log(`[onboarding/extract] Extracted ${menuItems.length} items for user ${userId.slice(0, 8)}…`);

    // If photos were uploaded but no items came back, tell the user — the
    // wizard cannot meaningfully proceed with zero items.
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
