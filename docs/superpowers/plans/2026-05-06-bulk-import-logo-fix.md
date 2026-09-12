# Bulk Import + Logo Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Add Bulk Products" button to the product-inventory dashboard that lets users upload 1–3 menu photos per scan (10/month quota), runs the same AI extraction + image-matching + menu-engineering pipeline as onboarding, and bulk-inserts items into the existing site; also remove the shop logo from the QRMenuTemplate sticky header.

**Architecture:** Reuse the existing `/api/onboarding/extract` endpoint for photo extraction (no duplication). Add a new `/api/bulk-import/insert` route that accepts the extracted items JSON, checks a per-user monthly photo quota stored in a new `bulk_import_usage` Supabase table, matches images, scores items, and bulk-inserts into the existing site. A new `BulkImportModal` component drives the three-phase UI (upload → processing → results) and is mounted directly on the product-inventory page.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + storage), Firebase Auth, OpenAI (text-embedding-3-small + GPT-4o via existing menuExtractor), React inline-style component pattern (matches existing dashboard style), `compressImage` from `@/lib/imageCompress`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/bulk-import/insert/route.ts` | Auth, quota check, image matching, menu-engineering sort, DB insert, quota update |
| Create | `src/components/manage/BulkImportModal.tsx` | Three-phase modal UI (upload / processing / results / error) |
| Modify | `src/app/manage/product-inventory/page.tsx` | Add "Add Bulk Products" button + mount modal |
| Modify | `src/components/templates/QRMenuTemplate.tsx` | Remove logo `<img>` from sticky header (lines 880–883) |
| Supabase | migration via MCP | Create `bulk_import_usage` table |

---

## Task 1: Supabase — Create bulk_import_usage Table

**Files:**
- Supabase migration (applied via MCP tool)

- [ ] **Step 1: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with this SQL:

```sql
create table if not exists public.bulk_import_usage (
  user_id  text        not null,
  month    text        not null,   -- format: YYYY-MM
  photos_used int      not null default 0,
  primary key (user_id, month)
);

-- Allow the service-role key (used by supabaseServer) full access.
-- Row-level security is not needed here because only the API server writes.
alter table public.bulk_import_usage enable row level security;

create policy "service_role_all" on public.bulk_import_usage
  for all using (true) with check (true);
```

- [ ] **Step 2: Verify table exists**

In Supabase dashboard (or via MCP `list_tables`), confirm `bulk_import_usage` appears with columns `user_id`, `month`, `photos_used`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add bulk_import_usage table migration"
```

---

## Task 2: API Route — /api/bulk-import/insert

**Files:**
- Create: `src/app/api/bulk-import/insert/route.ts`

This route:
1. Verifies Firebase token
2. Validates `{siteId, items[], photosCount}` body
3. Confirms site belongs to the user
4. Checks monthly quota (SELECT from bulk_import_usage)
5. Calls same image-matching logic as onboarding/complete (duplicated here intentionally — YAGNI)
6. Applies weightedScore sort + display_order offset
7. Bulk-inserts products
8. Upserts the quota row

- [ ] **Step 1: Create the route file**

Create `src/app/api/bulk-import/insert/route.ts`:

```typescript
// src/app/api/bulk-import/insert/route.ts
// Receives extracted menu items from the client (already parsed by /api/onboarding/extract)
// and inserts them into an existing site with image matching + menu engineering.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { matchByKeyword } from '@/lib/defaultImages';
import { weightedScore, previewQuadrant } from '@/lib/menuEngineering';
import OpenAI from 'openai';

export const maxDuration = 60;
export const runtime = 'nodejs';

const MONTHLY_PHOTO_LIMIT = 10;
const MAX_ITEMS = 300;
const MAX_VARIANTS = 10;
const SIM_THRESHOLD = 0.45;
const RPC_CONCURRENCY = 10;

// ── OpenAI singleton ──────────────────────────────────────────────────────────
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function clampTier(v: number): number { return Math.min(4, Math.max(1, Math.round(v))); }

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 1500): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, baseMs * (i + 1)));
    }
  }
  throw last;
}

async function mapWithLimit<T, R>(
  items: T[], limit: number, fn: (x: T, i: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function findImagesForItems(itemNames: string[]): Promise<Array<string | null>> {
  const keywordHits = itemNames.map(name => matchByKeyword(name)?.image_url ?? null);
  const indicesNeedingEmbedding: number[] = [];
  itemNames.forEach((_, i) => { if (!keywordHits[i]) indicesNeedingEmbedding.push(i); });
  if (indicesNeedingEmbedding.length === 0) return keywordHits;

  let embeddings: number[][] = [];
  try {
    const res = await getOpenAI().embeddings.create({
      model: 'text-embedding-3-small',
      input: indicesNeedingEmbedding.map(i => itemNames[i].slice(0, 500).toLowerCase()),
    });
    embeddings = res.data.map(d => d.embedding);
  } catch (err) {
    console.warn('[bulk-import/insert] embedding call failed:', err);
    return keywordHits;
  }

  const rpcResults = await mapWithLimit(indicesNeedingEmbedding, RPC_CONCURRENCY, async (origIdx, posIdx) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabaseServer as any).rpc('match_default_image', {
        query_embedding: embeddings[posIdx],
        match_threshold: SIM_THRESHOLD,
        match_count: 1,
      });
      if (!error && data?.length) return { origIdx, url: data[0].image_url as string };
    } catch (err) {
      console.warn(`[bulk-import/insert] RPC failed for "${itemNames[origIdx]}":`, err);
    }
    return { origIdx, url: null };
  });

  for (const { origIdx, url } of rpcResults) keywordHits[origIdx] = url;
  return keywordHits;
}

// ── Handler ───────────────────────────────────────────────────────────────────
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

    // Parse body
    let body: { siteId: string; items: Record<string, unknown>[]; photosCount: number };
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const { siteId, items = [], photosCount } = body;

    if (!siteId || typeof siteId !== 'string')
      return NextResponse.json({ error: 'siteId required' }, { status: 400 });
    if (typeof photosCount !== 'number' || photosCount < 1 || photosCount > 3)
      return NextResponse.json({ error: 'photosCount must be 1–3' }, { status: 400 });
    if (!Array.isArray(items) || items.length === 0)
      return NextResponse.json({ error: 'No items to insert' }, { status: 400 });
    if (items.length > MAX_ITEMS)
      return NextResponse.json({ error: `Too many items — max ${MAX_ITEMS}` }, { status: 400 });

    // Verify site belongs to this user
    const { data: siteRow, error: siteErr } = await supabaseServer
      .from('sites').select('id').eq('id', siteId).eq('user_id', userId).single();
    if (siteErr || !siteRow)
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    // Quota check
    const month = currentMonth();
    const { data: usageRow } = await supabaseServer
      .from('bulk_import_usage')
      .select('photos_used')
      .eq('user_id', userId)
      .eq('month', month)
      .single();
    const photosUsed = (usageRow as { photos_used: number } | null)?.photos_used ?? 0;

    if (photosUsed + photosCount > MONTHLY_PHOTO_LIMIT) {
      return NextResponse.json({
        error: `Monthly limit reached. You've used ${photosUsed} of ${MONTHLY_PHOTO_LIMIT} photos this month.`,
        code: 'QUOTA_EXCEEDED',
        photosUsed,
        limit: MONTHLY_PHOTO_LIMIT,
      }, { status: 429 });
    }

    // Image matching
    const imageUrls = await findImagesForItems(items.map(i => String(i.name ?? '')));

    // Score + sort
    const scored = items.map((item, originalIndex) => ({
      item,
      imageUrl: imageUrls[originalIndex] ?? null,
      originalIndex,
      score: weightedScore({
        starRating:  clampTier(Number(item.star_rating) || 2),
        profitTier:  clampTier(Number(item.profit_tier) || 2),
        ordersToday: 0,
        likeCount:   0,
        offerActive: false,
      }),
    }));
    scored.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

    // Base display_order — append after existing products
    const { data: maxOrderRow } = await supabaseServer
      .from('products')
      .select('display_order')
      .eq('site_id', siteId)
      .order('display_order', { ascending: false })
      .limit(1)
      .single();
    const baseOrder = ((maxOrderRow as { display_order: number } | null)?.display_order ?? -1) + 1;

    // Build product rows
    const rows = scored.map(({ item, imageUrl }, idx) => {
      const itemType = String(item.item_type ?? 'single');
      const foodType = String(item.food_type ?? 'unknown');
      const starRating = clampTier(Number(item.star_rating) || 2);
      const profitTier = clampTier(Number(item.profit_tier) || 2);
      const prepTier   = clampTier(Number(item.prep_complexity_tier) || 2);
      const variants   = Array.isArray(item.variants) ? item.variants.slice(0, MAX_VARIANTS) : [];
      return {
        site_id:              siteId,
        name:                 String(item.name ?? '').trim(),
        selling_price:        Number(item.price) || 0,
        description:          String(item.description ?? ''),
        category:             item.category ? String(item.category) : null,
        item_type:            itemType,
        food_type:            foodType,
        type:                 itemType === 'variant' ? 'Variants' : itemType === 'combo' ? 'Combo' : 'Single Item',
        dish_type:            foodType === 'veg' ? 'Vegetarian' : 'Non-Vegetarian',
        image_url:            imageUrl,
        metadata:             variants.length ? { variants } : null,
        star_rating:          starRating,
        profit_tier:          profitTier,
        prep_complexity_tier: prepTier,
        display_order:        baseOrder + idx,
        ks_quadrant:          previewQuadrant(starRating, profitTier),
        is_live:              true,
      };
    });

    // Bulk insert
    const { error: insertErr } = await withRetry(() =>
      supabaseServer.from('products').insert(rows)
    );
    if (insertErr) {
      console.error('[bulk-import/insert] insert failed:', insertErr);
      return NextResponse.json({ error: 'Failed to save products. Please try again.' }, { status: 500 });
    }

    // Update quota (upsert — safe on concurrent retry)
    await supabaseServer.from('bulk_import_usage').upsert(
      { user_id: userId, month, photos_used: photosUsed + photosCount },
      { onConflict: 'user_id,month' }
    );

    return NextResponse.json({
      success: true,
      inserted: rows.length,
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    console.error('[bulk-import/insert] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `src/app/api/bulk-import/insert/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/bulk-import/insert/route.ts
git commit -m "feat: add bulk-import insert API route with quota enforcement"
```

---

## Task 3: UI Component — BulkImportModal

**Files:**
- Create: `src/components/manage/BulkImportModal.tsx`

Four internal phases driven by a `phase` state: `'upload' | 'processing' | 'results' | 'error'`. The processing phase is non-dismissable. Styling follows the existing inline-style pattern used in `product-inventory/page.tsx`.

- [ ] **Step 1: Create the component file**

Create `src/components/manage/BulkImportModal.tsx`:

```tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { firebaseAuth } from '@/lib/firebase';
import { compressImage } from '@/lib/imageCompress';

interface BulkImportModalProps {
  siteId: string;
  siteName: string;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

type Phase = 'upload' | 'processing' | 'results' | 'error';

const MONTHLY_LIMIT = 10;
const SESSION_MAX = 3;
const STEP_MESSAGES = [
  'Reading your menu photos…',
  'Matching product images…',
  'Adding to your inventory…',
];

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonthLabel(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BulkImportModal({ siteId, siteName, onClose, onSuccess }: BulkImportModalProps) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [quotaUsed, setQuotaUsed] = useState<number | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [addedCount, setAddedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch this month's usage on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const userId = firebaseAuth.currentUser?.uid;
      if (!userId) { setQuotaUsed(0); return; }
      const { data } = await supabase
        .from('bulk_import_usage')
        .select('photos_used')
        .eq('user_id', userId)
        .eq('month', currentMonth())
        .single();
      if (!cancelled) setQuotaUsed((data as { photos_used: number } | null)?.photos_used ?? 0);
    })();
    return () => { cancelled = true; };
  }, []);

  const quotaExhausted = quotaUsed !== null && quotaUsed >= MONTHLY_LIMIT;
  const sessionMax = Math.min(SESSION_MAX, quotaUsed !== null ? MONTHLY_LIMIT - quotaUsed : SESSION_MAX);
  const canClose = phase !== 'processing';

  const addFiles = (raw: FileList | null) => {
    if (!raw) return;
    const accepted: File[] = [];
    for (let i = 0; i < raw.length && accepted.length + files.length < sessionMax; i++) {
      if (raw[i].type.startsWith('image/')) accepted.push(raw[i]);
    }
    setFiles(prev => [...prev, ...accepted].slice(0, sessionMax));
  };

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, j) => j !== i));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const startProcessing = async () => {
    if (files.length === 0) return;
    setPhase('processing');
    setStepIdx(0);

    // Advance step indicator on a timer (visually reassuring to the user)
    let idx = 0;
    stepTimerRef.current = setInterval(() => {
      idx = Math.min(idx + 1, STEP_MESSAGES.length - 1);
      setStepIdx(idx);
    }, 4000);

    try {
      const user = firebaseAuth.currentUser;
      if (!user) throw new Error('Not authenticated. Please refresh and try again.');
      const token = await user.getIdToken();

      // Compress images before upload (Vercel 4.5 MB body cap)
      const compressed = await Promise.all(files.map(f => compressImage(f)));

      // Step 1 — extract items from photos (reuse existing endpoint)
      const formData = new FormData();
      formData.append('shopName', siteName);
      compressed.forEach(f => formData.append('photos', f));

      const extractRes = await fetch('/api/onboarding/extract', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const extractData = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractData.error ?? 'Could not read menu from photos.');

      setStepIdx(1);

      // Step 2 — insert into existing site
      const insertRes = await fetch('/api/bulk-import/insert', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteId,
          items: extractData.items,
          photosCount: files.length,
        }),
      });
      const insertData = await insertRes.json();
      if (!insertRes.ok) throw new Error(insertData.error ?? 'Failed to save products.');

      setStepIdx(2);
      await new Promise(r => setTimeout(r, 700));

      clearInterval(stepTimerRef.current!);
      setAddedCount(insertData.inserted);
      setPhase('results');
      onSuccess(insertData.inserted);
    } catch (err: unknown) {
      clearInterval(stepTimerRef.current!);
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setPhase('error');
    }
  };

  // Shared style tokens
  const purple = '#5137EF';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.40)' }}
      onClick={canClose ? onClose : undefined}
    >
      <div
        className="bg-white flex flex-col"
        style={{ width: 'min(480px, 95vw)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E4E4E7', flexShrink: 0 }}>
          <div className="flex items-start justify-between">
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0A0A0A', lineHeight: '28px' }}>Add Bulk Products</h2>
              <p style={{ fontSize: 13, color: '#71717A', marginTop: 2 }}>Upload menu photos — AI extracts and adds items automatically</p>
            </div>
            {canClose && (
              <button
                onClick={onClose}
                className="flex items-center justify-center hover:bg-neutral-100 transition-colors"
                style={{ width: 32, height: 32, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#71717A' }}>close</span>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>

          {/* ── UPLOAD ── */}
          {phase === 'upload' && (
            <>
              {/* Quota row */}
              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                {quotaUsed === null ? (
                  <div style={{ height: 26, width: 180, background: '#F4F4F5', borderRadius: 6 }} />
                ) : (
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 13, color: '#52525C' }}>Monthly quota:</span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      background: quotaExhausted ? '#FEE2E2' : '#F0EDFF',
                      color: quotaExhausted ? '#E7000B' : purple,
                      borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600,
                    }}>
                      {quotaUsed} / {MONTHLY_LIMIT} photos used
                    </span>
                  </div>
                )}
                {quotaUsed !== null && !quotaExhausted && (
                  <span style={{ fontSize: 11, color: '#99A1AF' }}>Resets {nextMonthLabel()}</span>
                )}
              </div>

              {quotaExhausted ? (
                <div style={{ border: '1px solid #FED7AA', borderRadius: 10, padding: '24px 16px', background: '#FFF7ED', textAlign: 'center', marginBottom: 20 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#EA580C', display: 'block', marginBottom: 8 }}>event_busy</span>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#9A3412', marginBottom: 4 }}>Monthly limit reached</p>
                  <p style={{ fontSize: 12, color: '#C2410C' }}>
                    You've used all {MONTHLY_LIMIT} photos this month. Resets on {nextMonthLabel()}.
                  </p>
                </div>
              ) : (
                <>
                  {/* Drop zone */}
                  <div
                    onDrop={handleDrop}
                    onDragOver={e => e.preventDefault()}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center"
                    style={{ border: '1.5px dashed #C4C4C4', borderRadius: 12, padding: '28px 16px', background: '#FAFAFA', cursor: 'pointer', marginBottom: 14 }}
                  >
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#F0EDFF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 24, color: purple }}>photo_camera</span>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A', marginBottom: 4 }}>Drop menu photos here</p>
                    <p style={{ fontSize: 12, color: '#99A1AF', marginBottom: 12, textAlign: 'center' }}>
                      Up to {sessionMax} photo{sessionMax !== 1 ? 's' : ''} per scan · JPG, PNG or WebP
                    </p>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '7px 20px', fontSize: 13, fontWeight: 600, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer' }}
                    >
                      Choose Files
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
                    />
                  </div>

                  {/* Selected file chips */}
                  {files.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                      {files.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F4F4F5', borderRadius: 8, padding: '6px 10px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#52525C' }}>image</span>
                          <span style={{ fontSize: 12, color: '#0A0A0A', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          <button type="button" onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#71717A' }}>close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3" style={{ marginTop: 4 }}>
                <button
                  onClick={onClose}
                  style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                {!quotaExhausted && (
                  <button
                    onClick={startProcessing}
                    disabled={files.length === 0}
                    style={{
                      background: files.length === 0 ? '#B8AEEF' : purple,
                      borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600,
                      color: '#FFFFFF', border: 'none',
                      cursor: files.length === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Scan &amp; Add
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── PROCESSING ── */}
          {phase === 'processing' && (
            <div className="flex flex-col items-center" style={{ padding: '28px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F0EDFF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <span className="material-symbols-outlined animate-spin" style={{ fontSize: 28, color: purple }}>progress_activity</span>
              </div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#0A0A0A', marginBottom: 8, textAlign: 'center' }}>
                {STEP_MESSAGES[stepIdx]}
              </p>
              <p style={{ fontSize: 12, color: '#99A1AF', textAlign: 'center', lineHeight: '18px' }}>
                This takes up to 30 seconds.<br />Please don't close this window.
              </p>
              <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
                {STEP_MESSAGES.map((_, i) => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i <= stepIdx ? purple : '#E4E4E7', transition: 'background 0.3s' }} />
                ))}
              </div>
            </div>
          )}

          {/* ── RESULTS ── */}
          {phase === 'results' && (
            <div className="flex flex-col items-center" style={{ padding: '28px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#13801C', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#0A0A0A', marginBottom: 8, textAlign: 'center' }}>
                {addedCount} product{addedCount !== 1 ? 's' : ''} added!
              </p>
              <p style={{ fontSize: 13, color: '#52525C', textAlign: 'center', marginBottom: 24, lineHeight: '20px' }}>
                Your inventory is updated. Items are now live on your menu.
              </p>
              <button
                onClick={onClose}
                style={{ background: purple, borderRadius: 8, padding: '10px 32px', fontSize: 14, fontWeight: 600, color: '#FFFFFF', border: 'none', cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          )}

          {/* ── ERROR ── */}
          {phase === 'error' && (
            <div className="flex flex-col items-center" style={{ padding: '28px 0' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#E7000B' }}>error</span>
              </div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#0A0A0A', marginBottom: 8, textAlign: 'center' }}>Something went wrong</p>
              <p style={{ fontSize: 13, color: '#52525C', textAlign: 'center', marginBottom: 24, lineHeight: '20px' }}>
                {errorMsg}
              </p>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={onClose}
                  style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer' }}
                >
                  Close
                </button>
                <button
                  onClick={() => { setPhase('upload'); setErrorMsg(''); setFiles([]); }}
                  style={{ background: purple, borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, color: '#FFFFFF', border: 'none', cursor: 'pointer' }}
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `BulkImportModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/manage/BulkImportModal.tsx
git commit -m "feat: add BulkImportModal component (upload/processing/results/error phases)"
```

---

## Task 4: Wire Button into product-inventory Page

**Files:**
- Modify: `src/app/manage/product-inventory/page.tsx`

Changes:
1. Import `BulkImportModal`
2. Add `bulkModalOpen` state
3. Add the "Add Bulk Products" button to the header (left of "Add Product")
4. Mount `<BulkImportModal>` when open, with `onSuccess` that re-fetches products

- [ ] **Step 1: Add import + state**

In `src/app/manage/product-inventory/page.tsx`, add the import after the existing imports:

```typescript
import BulkImportModal from '@/components/manage/BulkImportModal';
```

Inside `ProductInventoryPage`, add a state variable after the existing state declarations (after line ~191):

```typescript
const [bulkModalOpen, setBulkModalOpen] = useState(false);
```

- [ ] **Step 2: Add the button in the header**

Locate the header div (around line 459–472). Replace:

```tsx
<button
    className="flex items-center gap-1.5 text-white hover:opacity-90 transition-opacity shrink-0"
    style={{ background: '#5137EF', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 500 }}
    onClick={openDrawer}
>
    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
    Add Product
</button>
```

With:

```tsx
<div className="flex items-center gap-2 shrink-0">
    <button
        className="flex items-center gap-1.5 hover:opacity-90 transition-opacity"
        style={{ background: '#FFFFFF', border: '1.5px solid #5137EF', color: '#5137EF', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 500 }}
        onClick={() => setBulkModalOpen(true)}
    >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>photo_library</span>
        Add Bulk Products
    </button>
    <button
        className="flex items-center gap-1.5 text-white hover:opacity-90 transition-opacity"
        style={{ background: '#5137EF', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 500 }}
        onClick={openDrawer}
    >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
        Add Product
    </button>
</div>
```

- [ ] **Step 3: Mount the modal**

Just before the closing `</div>` of the page return (after the drawer section, around line 990), add:

```tsx
{/* ── BULK IMPORT MODAL ── */}
{bulkModalOpen && activeSite && (
    <BulkImportModal
        siteId={activeSite.id}
        siteName={activeSite.name ?? ''}
        onClose={() => setBulkModalOpen(false)}
        onSuccess={() => {
            setBulkModalOpen(false);
            if (siteId) fetchProducts(siteId);
            refreshNotifications();
        }}
    />
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/manage/product-inventory/page.tsx
git commit -m "feat: add 'Add Bulk Products' button and mount BulkImportModal in product inventory"
```

---

## Task 5: Remove Logo from QRMenuTemplate Sticky Header

**Files:**
- Modify: `src/components/templates/QRMenuTemplate.tsx:878–895`

The logo `<img>` (lines 880–883) appears inside the sticky header next to the shop name. Remove only the conditional logo block; keep the shop name `<span>` and its wrapper `<div>` untouched.

- [ ] **Step 1: Remove the logo block**

In `src/components/templates/QRMenuTemplate.tsx`, locate and remove these lines (around 880–883):

```tsx
{logoUrl && (
  <img src={logoUrl} alt={shopName}
    style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
)}
```

The surrounding `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` can have `gap: 8` reduced to `gap: 0` or removed since there's now only one child, but only change this if the spacing looks wrong — the shop name `<span>` doesn't need a gap to anything.

After removal the header inner block should look like:

```tsx
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
  <div style={{ display: 'flex', alignItems: 'center' }}>
    <span style={{
      fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16,
      color: T.pink, letterSpacing: '0.5px', textTransform: 'uppercase',
    }}>{shopName}</span>
  </div>
  {shopTagline && (
    <span style={{
      fontFamily: "'Manrope',sans-serif", fontWeight: 400, fontSize: 11,
      color: T.descColor, letterSpacing: '0.01em',
    }}>{shopTagline}</span>
  )}
</div>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/templates/QRMenuTemplate.tsx
git commit -m "fix: remove shop logo from QRMenuTemplate sticky header"
```

---

## Task 6: Build Verification

- [ ] **Step 1: Run full Next.js build**

```bash
npm run build
```

Expected: build completes with no errors. Warnings about unused vars are acceptable; TypeScript errors are not.

- [ ] **Step 2: Verify `bulk_import_usage` quota table exists in Supabase**

Check via MCP `list_tables` or Supabase dashboard that `bulk_import_usage` table has `user_id`, `month`, `photos_used` columns.

- [ ] **Step 3: Manual smoke test checklist**

Start dev server (`npm run dev`) and verify:

1. Product Inventory page shows two buttons: "Add Bulk Products" (outline purple) and "Add Product" (solid purple)
2. Clicking "Add Bulk Products" opens the BulkImportModal
3. Quota shows "0 / 10 photos used this month" on first use
4. Drop zone accepts up to 3 images; adding a 4th is ignored
5. "Scan & Add" is disabled (greyed) when no files selected; enabled when ≥1 file added
6. Clicking Scan & Add enters the processing phase (spinner, step messages, non-dismissable)
7. After completion, "N products added!" results screen appears
8. Products appear in the inventory list after the modal closes
9. QRMenu template (visit `/shop/[slug]`) shows shop name only — no logo in the sticky header
10. Uploading 10 photos across sessions disables the upload zone with "Monthly limit reached" message

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: bulk product import from menu photos with AI extraction and monthly quota"
```
