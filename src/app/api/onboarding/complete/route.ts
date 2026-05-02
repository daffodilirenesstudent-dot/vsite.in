// src/app/api/onboarding/complete/route.ts
// Step 2 of split onboarding: receives JSON (shopName + extracted items with
// owner-assigned tiers), creates site + bulk-inserts products with all fields.
// No OCR or GPT calls here — those happened in /api/onboarding/extract.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { matchByKeyword } from '@/lib/defaultImages';
import { rateLimit } from '@/lib/rateLimit';
import { weightedScore, previewQuadrant } from '@/lib/menuEngineering';
import OpenAI from 'openai';

// 300 items × OpenAI embedding round-trips can take 60-90s.
export const maxDuration = 120;
export const runtime = 'nodejs';

// ── Types ────────────────────────────────────────────────────────────────────

interface EnrichedItem {
  name: string;
  price: number;
  description: string;
  category: string | null;
  item_type: 'single' | 'variant' | 'combo';
  food_type: 'veg' | 'non_veg' | 'egg' | 'unknown';
  variants?: Array<{ size: string; price: number }>;
  star_rating: number;          // 1–4
  profit_tier: number;          // 1–4
  prep_complexity_tier: number; // 1–4
}

interface CompletePayload {
  shopName: string;
  items: EnrichedItem[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 1500): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
}

async function findDefaultImage(productName: string): Promise<string | null> {
  const kwMatch = matchByKeyword(productName);
  if (kwMatch) return kwMatch.image_url;
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: productName.slice(0, 500).toLowerCase(),
    });
    const queryVector = embRes.data[0].embedding;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseServer as any).rpc('match_default_image', {
      query_embedding: queryVector,
      match_threshold: 0.45,
      match_count: 1,
    });
    if (!error && data?.length) return data[0].image_url as string;
  } catch (e) {
    console.warn(`[onboarding/complete] image match failed for "${productName}":`, e);
  }
  return null;
}

function generateSlug(name: string): string {
  return (
    name.toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50) || `cafe-${Date.now()}`
  );
}

function clampTier(value: number): number {
  return Math.min(4, Math.max(1, Math.round(value)));
}

const VALID_ITEM_TYPES = new Set(['single', 'variant', 'combo']);
const VALID_FOOD_TYPES = new Set(['veg', 'non_veg', 'egg', 'unknown']);

function validatePayload(payload: CompletePayload): { ok: true } | { ok: false; error: string } {
  const { shopName, items = [] } = payload;

  if (typeof shopName !== 'string' || !shopName.trim()) {
    return { ok: false, error: 'Shop name is required' };
  }
  if (shopName.trim().length > 100) {
    return { ok: false, error: 'Shop name must be 100 characters or fewer' };
  }
  if (!Array.isArray(items)) {
    return { ok: false, error: 'items must be an array' };
  }
  if (items.length > 300) {
    return { ok: false, error: 'Too many items — maximum 300 allowed' };
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = `items[${i}]`;

    if (typeof item.name !== 'string' || !item.name.trim()) {
      return { ok: false, error: `${label}.name is required` };
    }
    if (item.name.length > 200) {
      return { ok: false, error: `${label}.name must be 200 characters or fewer` };
    }
    if (!Number.isFinite(item.price) || item.price < 0) {
      return { ok: false, error: `${label}.price must be a non-negative number` };
    }
    if (typeof item.description === 'string' && item.description.length > 500) {
      return { ok: false, error: `${label}.description must be 500 characters or fewer` };
    }
    if (item.category !== null && item.category !== undefined &&
        (typeof item.category !== 'string' || item.category.length > 80)) {
      return { ok: false, error: `${label}.category must be a string ≤ 80 characters` };
    }
    if (!VALID_ITEM_TYPES.has(item.item_type)) {
      return { ok: false, error: `${label}.item_type must be single, variant, or combo` };
    }
    if (!VALID_FOOD_TYPES.has(item.food_type)) {
      return { ok: false, error: `${label}.food_type must be veg, non_veg, egg, or unknown` };
    }

    // Tier checks — use Number.isFinite so NaN/Infinity cannot slip through
    for (const [field, val] of [
      ['star_rating', item.star_rating],
      ['profit_tier', item.profit_tier],
      ['prep_complexity_tier', item.prep_complexity_tier],
    ] as [string, number][]) {
      if (!Number.isFinite(val) || val < 1 || val > 4) {
        return { ok: false, error: `${label}.${field} must be a finite number between 1 and 4` };
      }
    }

    if (Array.isArray(item.variants)) {
      for (let v = 0; v < item.variants.length; v++) {
        const variant = item.variants[v];
        if (typeof variant.size !== 'string' || !variant.size.trim() || variant.size.length > 50) {
          return { ok: false, error: `${label}.variants[${v}].size must be a non-empty string ≤ 50 chars` };
        }
        if (!Number.isFinite(variant.price) || variant.price < 0) {
          return { ok: false, error: `${label}.variants[${v}].price must be a non-negative number` };
        }
      }
    }
  }

  return { ok: true };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const rl = rateLimit(`onboarding:${userId}`, { limit: 5, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many onboarding attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
      );
    }

    // ── Per-store limit check ─────────────────────────────────────────────────
    // Fetch all existing sites with their subscription status in one query.
    // Trial = store within 14 days of creation with no active paid plan.
    // Limits: max 2 active-trial stores, max 5 total stores per account.
    const { data: existingSites } = await supabaseServer
      .from('sites')
      .select('id, created_at, site_subscriptions(store_expires_at)')
      .eq('user_id', userId);

    const nowMs = Date.now();
    const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
    const TRIAL_STORE_LIMIT = 2;
    const PAID_STORE_LIMIT  = 5;

    const totalSites = existingSites?.length ?? 0;

    // A store is "on active trial" when it has no paid subscription AND was
    // created within the last 14 days. These consume a trial slot.
    //
    // NOTE: Supabase returns nested has-many relations as ARRAYS even when the
    // FK is functionally one-to-one. Reading `.site_subscriptions` as a single
    // object silently returns `undefined`, making every paid store look like
    // an unpaid trial slot — which then blocks legitimate users from creating
    // additional stores. Always normalize array → first row.
    const trialSites = (existingSites ?? []).filter(s => {
      const rawSub = (s as unknown as { site_subscriptions: unknown }).site_subscriptions;
      const sub = (Array.isArray(rawSub) ? rawSub[0] : rawSub) as
        | { store_expires_at: string | null }
        | null
        | undefined;
      const paidExpiry = sub?.store_expires_at ? new Date(sub.store_expires_at).getTime() : 0;
      if (paidExpiry > nowMs) return false; // has a paid plan — not a trial slot
      const trialEnd = new Date(s.created_at).getTime() + TRIAL_DURATION_MS;
      return trialEnd > nowMs; // within 14-day window
    }).length;

    if (totalSites >= PAID_STORE_LIMIT) {
      return NextResponse.json(
        { error: `You have reached the maximum of ${PAID_STORE_LIMIT} stores on your account.`, code: 'PLAN_LIMIT' },
        { status: 403 }
      );
    }

    if (trialSites >= TRIAL_STORE_LIMIT) {
      return NextResponse.json(
        { error: `Free trial allows up to ${TRIAL_STORE_LIMIT} stores at once. Activate a plan on an existing store to create more.`, code: 'TRIAL_LIMIT' },
        { status: 403 }
      );
    }

    // ── Parse and validate JSON body ──────────────────────────────────────────
    let payload: CompletePayload;
    try {
      payload = await request.json() as CompletePayload;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = validatePayload(payload);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { shopName, items = [] } = payload;

    // ── Unique slug ───────────────────────────────────────────────────────────
    const baseSlug = generateSlug(shopName.trim());
    let slug = baseSlug;
    let counter = 1;
    await withRetry(async () => {
      slug = baseSlug; counter = 1;
      while (true) {
        const { data: existing } = await supabaseServer.from('sites').select('slug').eq('slug', slug).single();
        if (!existing) break;
        slug = `${baseSlug}-${counter++}`;
      }
    });

    // ── Insert site ───────────────────────────────────────────────────────────
    let site: { id: string; slug: string } | null = null;
    await withRetry(async () => {
      const { data, error: siteError } = await supabaseServer
        .from('sites')
        .insert({
          user_id: userId,
          slug,
          type: 'Menu',
          name: shopName.trim(),
          category: 'cafe',
          description: `${shopName.trim()} digital menu`,
        })
        .select('id, slug')
        .single();
      if (siteError || !data) throw new Error(siteError?.message ?? 'site insert returned no data');
      site = data as { id: string; slug: string };
    });

    if (!site) {
      return NextResponse.json({ error: 'Failed to create site after retries' }, { status: 500 });
    }
    const siteRecord = site as { id: string; slug: string };

    // ── Create site_subscriptions row (trial — no store_expires_at yet) ───────
    // This row is REQUIRED. /api/subscription/verify-payment looks it up by
    // site_id and rejects activations that don't match — without this row the
    // user can pay Razorpay but the plan never activates ("Subscription
    // mismatch"). Treat the insert failure as fatal and roll back the site.
    let subInserted = false;
    try {
      await withRetry(async () => {
        const { error } = await supabaseServer.from('site_subscriptions').insert({
          site_id:    siteRecord.id,
          user_id:    userId,
          store_plan: 'qr_menu',
        });
        // 23505 = unique_violation: a prior attempt already inserted this row.
        // Idempotent — treat as success.
        if (error && error.code !== '23505') throw error;
      });
      subInserted = true;
    } catch (err) {
      console.error('[onboarding/complete] site_subscriptions insert failed — rolling back site:', err);
    }

    if (!subInserted) {
      // Roll back the site so the user is not left in a half-created state
      // (no subscription row → can never activate a plan).
      await supabaseServer.from('sites').delete().eq('id', siteRecord.id);
      return NextResponse.json(
        { error: 'Could not initialise store subscription. Please try again.' },
        { status: 500 }
      );
    }

    // ── Bulk insert products ──────────────────────────────────────────────────
    let insertedCount = 0;
    let productsFailed = false;
    if (items.length > 0) {
      const imageUrls = await Promise.all(
        items.map(item => findDefaultImage(item.name).catch(() => null))
      );

      // Score every item with the MCDS weighted formula.
      // At onboarding time ordersToday/likeCount are 0 — score is driven
      // purely by the owner-assigned star_rating (×0.50) and profit_tier (×0.35).
      const scored = items.map((item, originalIndex) => ({
        item,
        imageUrl: imageUrls[originalIndex] ?? null,
        originalIndex,
        score: weightedScore({
          starRating:  clampTier(item.star_rating),
          profitTier:  clampTier(item.profit_tier),
          ordersToday: 0,
          likeCount:   0,
          offerActive: false,
        }),
      }));

      // Sort highest score first; break ties by original extraction order for determinism.
      scored.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

      const rows = scored.map(({ item, imageUrl }, displayOrder) => ({
        site_id: siteRecord.id,
        name: item.name.trim(),
        selling_price: item.price,
        description: item.description,
        category: item.category ?? null,
        item_type: item.item_type,
        food_type: item.food_type,
        type:      item.item_type === 'variant' ? 'Variants' : item.item_type === 'combo' ? 'Combo' : 'Single Item',
        dish_type: item.food_type === 'veg' ? 'Vegetarian' : 'Non-Vegetarian',
        image_url: imageUrl,
        metadata: item.variants?.length ? { variants: item.variants } : null,
        star_rating:          clampTier(item.star_rating),
        profit_tier:          clampTier(item.profit_tier),
        prep_complexity_tier: clampTier(item.prep_complexity_tier),
        display_order:        displayOrder,
        ks_quadrant:          previewQuadrant(clampTier(item.star_rating), clampTier(item.profit_tier)),
      }));

      try {
        const { error: prodError } = await withRetry(async () =>
          supabaseServer.from('products').insert(rows)
        );
        if (prodError) {
          console.error('[onboarding/complete] products insert error:', prodError);
          productsFailed = true;
        } else {
          insertedCount = rows.length;
          console.log(`[onboarding/complete] inserted ${insertedCount} products for site ${siteRecord.id}`);
        }
      } catch (retryErr) {
        console.error('[onboarding/complete] products insert failed after 3 retries:', retryErr);
        productsFailed = true;
      }

      if (productsFailed) {
        // Roll back: site_subscriptions cascades on site delete (FK), so
        // both the site and its sub row go away. User retries cleanly.
        await supabaseServer.from('sites').delete().eq('id', siteRecord.id);
        return NextResponse.json(
          { error: 'Menu items could not be saved. Please try again.' },
          { status: 500 }
        );
      }
    }

    // ── Mark onboarding complete (idempotent — safe to repeat) ───────────────
    try {
      await withRetry(async () =>
        supabaseServer
          .from('profiles')
          .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
          .eq('id', userId)
      );
    } catch (err) {
      console.error('[onboarding/complete] CRITICAL: failed to mark onboarding complete:', err);
    }

    return NextResponse.json({
      success: true,
      siteId: siteRecord.id,
      siteSlug: siteRecord.slug,
      itemCount: insertedCount,
      extracted: items.length,
    });
  } catch (err) {
    console.error('[onboarding/complete] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
