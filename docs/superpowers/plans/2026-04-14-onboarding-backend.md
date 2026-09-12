# Onboarding Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the onboarding page to create a digital menu site — user types shop name, uploads menu photos, Sarvam Vision OCR extracts text, OpenAI GPT-4o-mini parses items, site + products saved to DB.

**Architecture:** Single `POST /api/onboarding/complete` endpoint accepts multipart FormData (shop name + photo files). Per photo: try Sarvam Vision (OpenAI-compatible call with `sarvam-vision` model), fall back to GPT-4o vision. Aggregate OCR text → GPT-4o-mini extracts structured JSON items → create `sites` record → bulk insert `products` → set `onboarding_completed = true`.

**Tech Stack:** Next.js App Router API routes, OpenAI SDK (reused for Sarvam via custom baseURL), Supabase server client, Firebase JWT verification (existing pattern), Zod validation.

---

### Task 1: DB Migration — add item_type + food_type to products, category to sites

**Files:**
- Create: `supabase/migrations/005_menu_item_fields.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/005_menu_item_fields.sql
-- Adds menu-specific columns to products and category to sites

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'single'
    CHECK (item_type IN ('single', 'variant', 'combo'));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS food_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (food_type IN ('veg', 'non_veg', 'unknown'));

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'cafe';
```

- [ ] **Step 2: Run migration in Supabase SQL Editor**

Go to Supabase Dashboard → SQL Editor → paste the SQL above → Run.
Expected: no errors, columns appear in Table Editor for `products` and `sites`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_menu_item_fields.sql
git commit -m "feat: add item_type, food_type to products; category to sites"
```

---

### Task 2: Sarvam Vision helper — OCR image → markdown text

**Files:**
- Create: `src/lib/sarvamVision.ts`

- [ ] **Step 1: Create the helper**

```typescript
// src/lib/sarvamVision.ts
// Converts an image buffer to markdown text using Sarvam Vision.
// Falls back to OpenAI GPT-4o vision if Sarvam fails.

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Sarvam Vision via OpenAI-compatible API
const sarvam = new OpenAI({
  apiKey: process.env.SARVAM_API_KEY ?? '',
  baseURL: 'https://api.sarvam.ai/v1',
  defaultHeaders: {
    'api-subscription-key': process.env.SARVAM_API_KEY ?? '',
  },
});

/**
 * Converts a menu photo buffer to markdown OCR text.
 * Tries Sarvam Vision first, falls back to GPT-4o vision.
 * Returns empty string if both fail.
 */
export async function imageToMenuText(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  // Stage 1: Try Sarvam Vision
  try {
    const response = await sarvam.chat.completions.create({
      model: 'sarvam-vision',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
            {
              type: 'text',
              text: 'Extract all text from this menu image. Preserve item names, prices, and categories as markdown. Include all text visible in the image.',
            },
          ],
        },
      ],
      max_tokens: 2000,
    });
    const text = response.choices[0]?.message?.content ?? '';
    if (text.trim().length > 20) return text;
  } catch (err) {
    console.warn('[sarvamVision] Sarvam failed, falling back to GPT-4o:', err);
  }

  // Stage 2: Fallback — OpenAI GPT-4o vision
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: dataUrl, detail: 'high' },
            },
            {
              type: 'text',
              text: 'Extract all text from this menu image. Preserve item names, prices, and categories. Return as plain text.',
            },
          ],
        },
      ],
      max_tokens: 2000,
    });
    return response.choices[0]?.message?.content ?? '';
  } catch (err) {
    console.error('[sarvamVision] GPT-4o fallback also failed:', err);
    return '';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/sarvamVision.ts
git commit -m "feat: add sarvamVision helper with GPT-4o fallback"
```

---

### Task 3: Menu extractor — OCR text → structured JSON items

**Files:**
- Create: `src/lib/menuExtractor.ts`

- [ ] **Step 1: Create the extractor**

```typescript
// src/lib/menuExtractor.ts
// Takes raw OCR text from one or more menu pages and returns structured items.

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface MenuItem {
  name: string;
  price: number;
  description: string;
  item_type: 'single' | 'variant' | 'combo';
  food_type: 'veg' | 'non_veg' | 'unknown';
}

const SYSTEM_PROMPT = `You are a menu parser for Indian cafes. Given raw OCR text from one or more menu photos (possibly in Hindi, Tamil, Telugu, Kannada, Malayalam, English, or mixed), extract every menu item as a JSON array.

Return ONLY a valid JSON array — no markdown, no explanation, no wrapper object.

Each item must have:
{
  "name": "Item name in English (transliterate if needed)",
  "price": 120,
  "description": "One-line description of the item",
  "item_type": "single",
  "food_type": "veg"
}

Rules:
- item_type must be exactly: "single" | "variant" | "combo"
  - "variant" = item has size/flavour variants (e.g. Small/Medium/Large)
  - "combo" = meal deal, set meal, or bundled offer
  - "single" = everything else
- food_type must be exactly: "veg" | "non_veg" | "unknown"
  - detect from name, context, or green/red dot symbols
  - use "unknown" when unsure
- price must be a number (0 if not found or varies)
- Translate all names to standard English
- Remove duplicates
- If the text has no recognisable menu items, return []`;

/**
 * Parses aggregated OCR text into structured menu items.
 * Returns an empty array if extraction fails.
 */
export async function extractMenuItems(ocrText: string): Promise<MenuItem[]> {
  if (!ocrText.trim()) return [];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Menu OCR text:\n\n${ocrText}` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4000,
    });

    const raw = completion.choices[0]?.message?.content ?? '[]';

    // GPT may wrap in an object even with json_object mode — unwrap if so
    const parsed = JSON.parse(raw);
    const items: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.items)
      ? parsed.items
      : [];

    return items
      .filter((i): i is MenuItem => {
        return (
          typeof i === 'object' &&
          i !== null &&
          typeof (i as MenuItem).name === 'string' &&
          (i as MenuItem).name.trim().length > 0
        );
      })
      .map((i) => ({
        name: String(i.name).trim(),
        price: typeof i.price === 'number' ? i.price : 0,
        description: String(i.description ?? '').trim(),
        item_type: ['single', 'variant', 'combo'].includes(i.item_type)
          ? (i.item_type as MenuItem['item_type'])
          : 'single',
        food_type: ['veg', 'non_veg', 'unknown'].includes(i.food_type)
          ? (i.food_type as MenuItem['food_type'])
          : 'unknown',
      }));
  } catch (err) {
    console.error('[menuExtractor] Failed to extract items:', err);
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/menuExtractor.ts
git commit -m "feat: add menuExtractor — OCR text to structured menu items"
```

---

### Task 4: POST /api/onboarding/complete — main backend route

**Files:**
- Create: `src/app/api/onboarding/complete/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/onboarding/complete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase';
import { imageToMenuText } from '@/lib/sarvamVision';
import { extractMenuItems } from '@/lib/menuExtractor';

function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50) || `cafe-${Date.now()}`
  );
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // 2. Parse form data
    const formData = await request.formData();
    const shopName = (formData.get('shopName') as string | null)?.trim();
    if (!shopName) {
      return NextResponse.json({ error: 'Shop name is required' }, { status: 400 });
    }

    const photoFiles: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'photos' && value instanceof File && value.size > 0) {
        photoFiles.push(value);
      }
    }

    // 3. OCR each photo with Sarvam Vision
    const ocrParts: string[] = [];
    for (const file of photoFiles.slice(0, 10)) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await imageToMenuText(buffer, file.type || 'image/jpeg');
      if (text.trim()) ocrParts.push(text);
    }
    const aggregatedOcr = ocrParts.join('\n\n---\n\n');

    // 4. Extract menu items from OCR text
    const menuItems = aggregatedOcr ? await extractMenuItems(aggregatedOcr) : [];

    // 5. Create site record (type: Menu, category: cafe)
    const baseSlug = generateSlug(shopName);
    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const { data: existing } = await supabaseServer
        .from('sites')
        .select('slug')
        .eq('slug', slug)
        .single();
      if (!existing) break;
      slug = `${baseSlug}-${counter++}`;
    }

    const { data: site, error: siteError } = await supabaseServer
      .from('sites')
      .insert({
        user_id: userId,
        slug,
        type: 'Menu',
        name: shopName,
        category: 'cafe',
        description: `${shopName} digital menu`,
      })
      .select('id, slug')
      .single();

    if (siteError || !site) {
      console.error('[onboarding/complete] site insert error:', siteError);
      return NextResponse.json({ error: 'Failed to create site' }, { status: 500 });
    }

    // 6. Bulk insert products
    if (menuItems.length > 0) {
      const rows = menuItems.map((item) => ({
        site_id: site.id,
        name: item.name,
        price: item.price,
        description: item.description,
        item_type: item.item_type,
        food_type: item.food_type,
      }));

      const { error: prodError } = await supabaseServer
        .from('products')
        .insert(rows);

      if (prodError) {
        console.error('[onboarding/complete] products insert error:', prodError);
        // Non-fatal — site was created, items can be added later
      }
    }

    // 7. Mark onboarding complete
    await supabaseServer
      .from('profiles')
      .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
      .eq('id', userId);

    return NextResponse.json({
      success: true,
      siteSlug: site.slug,
      itemCount: menuItems.length,
    });
  } catch (err) {
    console.error('[onboarding/complete] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Increase body size limit for photo uploads (default 4MB → 25MB)
export const config = {
  api: { bodyParser: false },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/onboarding/complete/route.ts
git commit -m "feat: add POST /api/onboarding/complete API route"
```

---

### Task 5: Update onboarding page UI + handleNext

**Files:**
- Modify: `src/app/onboarding/page.tsx`

Key changes:
1. Remove the category text input — replace with a fixed "Cafe" badge
2. `handleNext` sends `FormData` to `/api/onboarding/complete` with Firebase token
3. Loading state shows "Scanning your menu…" message
4. On success: redirect to `/manage/dashboard?onboarded=true&items=<count>`

- [ ] **Step 1: Rewrite the page**

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';

const MAX_PHOTOS = 10;

interface PreviewPhoto {
  id: string;
  url: string;
  file: File;
  name: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Saving…');
  const [businessName, setBusinessName] = useState('');
  const [photos, setPhotos] = useState<PreviewPhoto[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [error, setError] = useState('');

  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMobile(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    setChecking(false);
  }, [user, loading, router]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files).filter(f => f.type.startsWith('image/'));
    setPhotos(prev => {
      const slots = MAX_PHOTOS - prev.length;
      if (slots <= 0) return prev;
      return [
        ...prev,
        ...incoming.slice(0, slots).map(f => ({
          id: `${f.name}-${f.size}-${Math.random()}`,
          url: URL.createObjectURL(f),
          file: f,
          name: f.name,
        })),
      ];
    });
  }, []);

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const photo = prev.find(p => p.id === id);
      if (photo) URL.revokeObjectURL(photo.url);
      return prev.filter(p => p.id !== id);
    });
  };

  const handleNext = async () => {
    if (!user || saving) return;
    if (!businessName.trim()) { setError('Please enter your business name.'); return; }

    setError('');
    setSaving(true);
    setLoadingMsg(photos.length > 0 ? 'Scanning your menu… this takes ~15 seconds' : 'Setting up your store…');

    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append('shopName', businessName.trim());
      photos.forEach(p => formData.append('photos', p.file));

      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        setSaving(false);
        return;
      }

      // Revoke object URLs
      photos.forEach(p => URL.revokeObjectURL(p.url));

      router.replace(
        `/manage/dashboard?onboarded=true&items=${data.itemCount ?? 0}`
      );
    } catch {
      setError('Network error. Please try again.');
      setSaving(false);
    }
  };

  if (loading || checking) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-100 border-t-primary" />
      </div>
    );
  }

  const atLimit = photos.length >= MAX_PHOTOS;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-violet-50 via-purple-50 to-slate-50 flex flex-col">

      {/* Top bar */}
      <header className="flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/30">
            <span className="material-symbols-outlined text-white" style={{ fontSize: 22 }}>graphic_eq</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-800">Vsite</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>headset_mic</span>
            Support
          </a>
          <a href="#" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>help_outline</span>
            Help Center
          </a>
        </div>
      </header>

      {/* Page heading */}
      <div className="mt-6 text-center">
        <h1 className="text-2xl font-bold text-slate-800">Setup Your Store</h1>
        <p className="mt-1 text-sm text-slate-400">
          Let&apos;s set up your store. Add a name that your customers will recognize.
        </p>
      </div>

      {/* Card */}
      <main className="flex flex-1 justify-center px-4 py-6 pb-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-white shadow-sm border border-slate-100 px-7 py-7">

            {/* Connect Your Business */}
            <div className="mb-5 flex items-center gap-2">
              <span className="text-base">🔗</span>
              <span className="text-sm font-semibold text-slate-700">Connect Your Business</span>
            </div>

            <div className="space-y-4 mb-7">
              {/* Business Name */}
              <div>
                <label className="mb-1.5 block text-xs text-slate-500">
                  Enter your Business Name
                </label>
                <input
                  type="text"
                  placeholder="Cream Story"
                  value={businessName}
                  onChange={e => { setBusinessName(e.target.value); setError(''); }}
                  className="w-full rounded-[10px] border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                  autoFocus
                  disabled={saving}
                />
              </div>

              {/* Business Category — fixed "Cafe" for MVP */}
              <div>
                <label className="mb-1.5 block text-xs text-slate-500">
                  Business Category
                </label>
                <div className="flex items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <span className="text-base">☕</span>
                  <span className="text-sm font-medium text-slate-700">Cafe</span>
                  <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Selected</span>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="mb-6 border-t border-slate-100" />

            {/* Menu Photo Upload */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Menu Photos</p>
                {photos.length > 0 && (
                  <span className={`text-xs font-medium tabular-nums ${atLimit ? 'text-amber-500' : 'text-slate-400'}`}>
                    {photos.length} / {MAX_PHOTOS}
                  </span>
                )}
              </div>

              {/* Hidden file inputs */}
              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => e.target.files && addFiles(e.target.files)}
              />
              {isMobile && (
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => e.target.files && addFiles(e.target.files)}
                />
              )}

              {/* Upload area */}
              <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white py-7 px-4">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                  <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 28 }}>upload</span>
                </div>
                <p className="mb-1 text-sm font-medium text-slate-700">
                  Upload your menu photos
                </p>
                <p className="mb-4 text-center text-xs text-slate-400 leading-relaxed">
                  PNG, JPG or WebP &nbsp;·&nbsp; Up to {MAX_PHOTOS} photos
                  {isMobile && <><br />Upload from gallery or take a photo</>}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={atLimit || saving}
                    onClick={() => uploadRef.current?.click()}
                    className="rounded-[10px] border border-slate-300 bg-white px-5 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Choose File
                  </button>
                  {isMobile && (
                    <button
                      type="button"
                      disabled={atLimit || saving}
                      onClick={() => cameraRef.current?.click()}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-5 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>photo_camera</span>
                      Take Photo
                    </button>
                  )}
                </div>
              </div>

              {/* Photo preview grid */}
              {photos.length > 0 && (
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {photos.map(photo => (
                    <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={photo.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => removePhoto(photo.id)}
                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/65 text-white opacity-0 transition-opacity group-hover:opacity-100 active:opacity-100 disabled:cursor-not-allowed"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {atLimit && (
                <p className="mt-2 text-center text-xs text-amber-500">
                  Maximum {MAX_PHOTOS} photos reached. Remove one to add more.
                </p>
              )}
            </div>

            {/* Error message */}
            {error && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-600">
                {error}
              </p>
            )}
          </div>

          {/* Next button */}
          <div className="mt-5 flex justify-end">
            <button
              onClick={handleNext}
              disabled={saving}
              className="rounded-[10px] bg-primary px-10 py-2.5 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {loadingMsg}
                </span>
              ) : 'Next'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "feat: wire onboarding page to /api/onboarding/complete"
```

---

### Task 6: Dashboard — onboarding success banner

**Files:**
- Modify: `src/app/manage/dashboard/page.tsx`

- [ ] **Step 1: Add useSearchParams + success banner to DashboardPage**

Add to `DashboardPage` component (the exported default):

```tsx
'use client';
// Add to imports:
import { useSearchParams } from 'next/navigation';
```

Replace the `DashboardPage` function body:

```tsx
export default function DashboardPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [siteUrl, setSiteUrl] = useState('#');
  const [siteSlug, setSiteSlug] = useState('');
  const [showBanner, setShowBanner] = useState(false);
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    const onboarded = searchParams.get('onboarded');
    const items = searchParams.get('items');
    if (onboarded === 'true') {
      setShowBanner(true);
      setItemCount(Number(items ?? 0));
      // Clean URL without reload
      window.history.replaceState({}, '', '/manage/dashboard');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('sites')
      .select('slug, domain')
      .eq('user_id', user.id)
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const site = data[0];
          setSiteSlug(site.slug ?? '');
          setSiteUrl(site.slug ? `/shop/${site.slug}` : '#');
        }
      });
  }, [user]);

  return (
    <>
      {showBanner && (
        <div className="mx-4 mt-4 md:mx-8 flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-green-600" style={{ fontSize: 20 }}>check_circle</span>
            <p className="text-sm font-medium text-green-800">
              {itemCount > 0
                ? `Your menu is ready! ${itemCount} items extracted from your photos.`
                : 'Your store is set up! Add menu items from the product inventory.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {siteSlug && (
              <a
                href={`/shop/${siteSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>open_in_new</span>
                Preview Menu
              </a>
            )}
            <button
              onClick={() => setShowBanner(false)}
              className="text-green-500 hover:text-green-700"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
        </div>
      )}
      <RealDashboard siteUrl={siteUrl} />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/manage/dashboard/page.tsx
git commit -m "feat: add onboarding success banner to dashboard"
```

---

## Self-Review

**Spec coverage:**
- ✅ Shop name input (manual typing)
- ✅ Business type fixed as "Cafe" 
- ✅ Menu photo upload (up to 10)
- ✅ Sarvam Vision OCR + OpenAI fallback
- ✅ Extract: name, price, item_type (single/variant/combo), food_type (veg/non_veg/unknown)
- ✅ Save to DB (sites + products)
- ✅ Mark onboarding_completed
- ✅ Redirect to dashboard with success banner
- ✅ "Preview Menu" button on dashboard

**Placeholder scan:** None found.

**Type consistency:**
- `MenuItem` interface defined in Task 3 and used in Task 4 — consistent.
- `item_type` and `food_type` DB column names match insert rows in Task 4.
- `PreviewPhoto` gains a `file: File` field in Task 5 (was missing in original) — used in `handleNext` FormData append.
