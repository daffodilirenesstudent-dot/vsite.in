// src/app/api/onboarding/complete/route.ts
// Step 2 of split onboarding: receives JSON (shopName + extracted items with
// owner-assigned tiers), creates site + bulk-inserts products with all fields.
//
// Hardening for production scale (500+ users, 300+ items):
//   • Idempotency-Key header → safe retry, no duplicate sites on double-click
//   • Atomic slug allocation (insert-and-catch-23505, not check-then-insert)
//   • Batched embedding API call (1 call for all item names, not N calls)
//   • Bounded concurrency on pgvector RPCs (10 in flight at a time)
//   • Separate rate-limit bucket from /extract
//   • Hard variant cap (no infinite arrays)
//   • Vercel Hobby: maxDuration=60

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { confidentKeywordImage } from '@/lib/menu/defaultImages';
import { rateLimit } from '@/lib/platform/rateLimit';
import { weightedScore, previewQuadrant } from '@/lib/menu/menuEngineering';
import {
  isMenuThemeId, isHexColor, DEFAULT_MENU_THEME, MENU_THEMES,
} from '@/lib/menu/menuThemes';
import { audit } from '@/lib/platform/auditLog';
import OpenAI from 'openai';
import { TRIAL_DURATION_MS } from '@/lib/platform/productFlags';

import { logger } from '@/lib/platform/logger';
export const maxDuration = 60;
export const runtime = 'nodejs';

// ── Constants ────────────────────────────────────────────────────────────────

const COMPLETE_LIMIT_PER_HR = 5;
const MAX_ITEMS = 300;
const MAX_VARIANTS = 10;
// Must stay in step with MAX_PRICE in @/lib/menu/menuExtractor. When these two
// disagree, the extractor happily returns an item this route then rejects with
// a 400 that discards the WHOLE menu — one over-cap catering tray losing the
// other 200 items the owner just photographed.
const MAX_ITEM_PRICE_INR = 100_000;
const TRIAL_STORE_LIMIT = 2;
const PAID_STORE_LIMIT  = 5;
const SIM_THRESHOLD = 0.45;
const RPC_CONCURRENCY = 10;

// ── OpenAI singleton ─────────────────────────────────────────────────────────

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface EnrichedItem {
  name: string;
  price: number;
  description: string;
  category: string | null;
  item_type: 'single' | 'variant' | 'combo';
  food_type: 'veg' | 'non_veg' | 'egg' | 'unknown';
  variants?: Array<{ size: string; price: number }>;
  star_rating: number;
  profit_tier: number;
  prep_complexity_tier: number;
}

interface CompletePayload {
  shopName: string;
  items: EnrichedItem[];
  /** Menu design picked on the summary step. Optional — Classic is the default. */
  menuTheme?: unknown;
  brandColor?: unknown;
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

/** True for a plain JSON object — not null, not an array. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validatePayload(payload: CompletePayload): { ok: true } | { ok: false; error: string } {
  // `await request.json()` happily returns null, a number, a string or an
  // array for a syntactically valid body. Destructuring any of those threw,
  // and the throw surfaced as a 500 — a scriptable crash on a route every new
  // signup hits. Reject the shape before touching a single field.
  if (!isPlainObject(payload)) return { ok: false, error: 'Request body must be a JSON object' };

  const { shopName, items = [], menuTheme, brandColor } = payload;
  if (typeof shopName !== 'string' || !shopName.trim()) return { ok: false, error: 'Shop name is required' };

  // Both are optional — an owner who never touched the picker sends neither,
  // and that must stay a completely valid launch. Present-but-wrong is a 400,
  // never a 500: the fuzz suite hammers this route with malformed bodies.
  if (menuTheme !== undefined && !isMenuThemeId(menuTheme)) {
    return { ok: false, error: 'menuTheme must be classic, cafe or premium' };
  }
  if (brandColor !== undefined && brandColor !== null && !isHexColor(brandColor)) {
    return { ok: false, error: 'brandColor must be a six-digit hex colour' };
  }
  if (shopName.trim().length > 100) return { ok: false, error: 'Shop name must be 100 characters or fewer' };
  if (!Array.isArray(items)) return { ok: false, error: 'items must be an array' };
  if (items.length > MAX_ITEMS) return { ok: false, error: `Too many items — maximum ${MAX_ITEMS} allowed` };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = `items[${i}]`;
    // Same omission one level down: `items: [null]` reached `item.name` and
    // threw. An array of the right length says nothing about its contents.
    if (!isPlainObject(item)) return { ok: false, error: `${label} must be an object` };
    if (typeof item.name !== 'string' || !item.name.trim()) return { ok: false, error: `${label}.name is required` };
    if (item.name.length > 200) return { ok: false, error: `${label}.name must be 200 characters or fewer` };
    if (!Number.isFinite(item.price) || item.price < 0) return { ok: false, error: `${label}.price must be a non-negative number` };
    if (item.price > MAX_ITEM_PRICE_INR) return { ok: false, error: `${label}.price looks unusually high — please verify` };
    // Was `typeof === 'string' && length > 1000`, which only bounded the
    // length of strings and waved every non-string through to the insert. An
    // object or array here reaches Postgres as a text column value and fails
    // the whole batch, rolling back a site the user watched being created.
    if (item.description !== null && item.description !== undefined) {
      if (typeof item.description !== 'string') {
        return { ok: false, error: `${label}.description must be a string` };
      }
      if (item.description.length > 1000) {
        return { ok: false, error: `${label}.description must be 1000 characters or fewer` };
      }
    }
    if (item.category !== null && item.category !== undefined &&
        (typeof item.category !== 'string' || item.category.length > 80)) {
      return { ok: false, error: `${label}.category must be a string ≤ 80 characters` };
    }
    if (!VALID_ITEM_TYPES.has(item.item_type)) return { ok: false, error: `${label}.item_type must be single, variant, or combo` };
    if (!VALID_FOOD_TYPES.has(item.food_type)) return { ok: false, error: `${label}.food_type invalid` };

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
      if (item.variants.length > MAX_VARIANTS) {
        return { ok: false, error: `${label}.variants must have at most ${MAX_VARIANTS} entries` };
      }
      for (let v = 0; v < item.variants.length; v++) {
        const variant = item.variants[v];
        if (!isPlainObject(variant)) {
          return { ok: false, error: `${label}.variants[${v}] must be an object` };
        }
        if (typeof variant.size !== 'string' || !variant.size.trim() || variant.size.length > 50) {
          return { ok: false, error: `${label}.variants[${v}].size must be a non-empty string ≤ 50 chars` };
        }
        if (!Number.isFinite(variant.price) || variant.price < 0 || variant.price > MAX_ITEM_PRICE_INR) {
          return { ok: false, error: `${label}.variants[${v}].price out of range` };
        }
      }
    }
  }
  return { ok: true };
}

// ── Bounded-concurrency Promise.all (no extra dep) ───────────────────────────

async function mapWithLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
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

// ── Image matching: ONE batched embedding call + bounded RPC concurrency ────

async function findImagesForItems(itemNames: string[]): Promise<Array<string | null>> {
  // Step 1: keyword fallback (free, instant) — only accept CONFIDENT hits.
  // Low-confidence generic/token guesses are dropped (→ null) so those items
  // fall through to the vector search below instead of being locked to a
  // wrong/generic image. Mirrors the >= 0.75 gate in /api/images/match.
  const keywordHits = itemNames.map(name => confidentKeywordImage(name));

  // Step 2: collect items that need vector search
  const indicesNeedingEmbedding: number[] = [];
  itemNames.forEach((_, i) => { if (!keywordHits[i]) indicesNeedingEmbedding.push(i); });

  if (indicesNeedingEmbedding.length === 0) return keywordHits;

  // Step 3: ONE embedding call for all of them (OpenAI accepts arrays — saves 100s of round trips)
  let embeddings: number[][] = [];
  try {
    const openai = getOpenAI();
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: indicesNeedingEmbedding.map(i => itemNames[i].slice(0, 500).toLowerCase()),
    });
    embeddings = res.data.map(d => d.embedding);
  } catch (err) {
    console.warn('[onboarding/complete] batched embedding call failed:', err);
    return keywordHits; // give up gracefully — items get null image
  }

  // Step 4: pgvector RPC with bounded concurrency
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
      console.warn(`[onboarding/complete] RPC failed for "${itemNames[origIdx]}":`, err);
    }
    return { origIdx, url: null };
  });

  for (const { origIdx, url } of rpcResults) keywordHits[origIdx] = url;
  return keywordHits;
}

// ── Idempotency ──────────────────────────────────────────────────────────────

const IDEMPOTENCY_ENDPOINT = 'onboarding/complete';

async function readIdempotencyCache(key: string, userId: string): Promise<{ status: number; body: unknown } | null> {
  try {
    const { data } = await supabaseServer
      .from('idempotency_keys')
      .select('response_body, status_code')
      .eq('key', key)
      .eq('user_id', userId)
      .eq('endpoint', IDEMPOTENCY_ENDPOINT)
      .single();
    if (data) return { status: data.status_code as number, body: data.response_body };
  } catch { /* miss is fine */ }
  return null;
}

async function writeIdempotencyCache(key: string, userId: string, status: number, body: unknown): Promise<void> {
  try {
    await supabaseServer.from('idempotency_keys').insert({
      key, user_id: userId, endpoint: IDEMPOTENCY_ENDPOINT,
      response_body: body, status_code: status,
    });
  } catch (err) {
    // Likely 23505 — concurrent retry got there first. That's fine; both
    // requests will end up with equivalent successful state.
    console.warn('[onboarding/complete] idempotency write skipped:', err);
  }
}

// ── Atomic slug allocation: insert-and-catch ────────────────────────────────

async function insertSiteWithUniqueSlug(
  userId: string,
  shopName: string,
  design: { menu_theme: string; menu_font: string; primary_color: string },
): Promise<{ id: string; slug: string }> {
  const baseSlug = generateSlug(shopName);
  // Try base, base-1, base-2, ... up to 50 attempts.
  for (let counter = 0; counter < 50; counter++) {
    const slug = counter === 0 ? baseSlug : `${baseSlug}-${counter}`;
    const { data, error } = await supabaseServer
      .from('sites')
      .insert({
        user_id: userId,
        slug,
        type: 'Menu',
        name: shopName,
        category: 'cafe',
        ...design,
      })
      .select('id, slug')
      .single();
    if (!error && data) return data as { id: string; slug: string };
    // 23505 = unique_violation on slug — try the next variant.
    if (error && error.code !== '23505') throw error;
  }
  throw new Error('Could not allocate a unique slug after 50 attempts');
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    // Auth
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Idempotency — check BEFORE rate limit so a retry of a successful call
    // doesn't burn the user's quota.
    const idemKey = request.headers.get('Idempotency-Key')?.trim();
    if (idemKey && idemKey.length > 0 && idemKey.length <= 200) {
      const cached = await readIdempotencyCache(idemKey, userId);
      if (cached) {
        logger.debug(`[onboarding/complete] idempotency hit for key ${idemKey.slice(0, 8)}…`);
        return NextResponse.json(cached.body, { status: cached.status });
      }
    }

    // Rate limit (separate bucket from /extract)
    const rl = rateLimit(`complete:${userId}`, { limit: COMPLETE_LIMIT_PER_HR, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many launch attempts. Please try again in a few minutes.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
      );
    }

    // Existing-store + trial-limit check
    const { data: existingSites, error: existingSitesError } = await supabaseServer
      .from('sites')
      .select('id, created_at, site_subscriptions(store_expires_at)')
      .eq('user_id', userId);

    // Fail CLOSED. The error was previously discarded, so a failed query left
    // `existingSites` null, `totalSites` computed as 0, and both the 5-store
    // and 2-trial-store caps were skipped — a DB blip (or anything that could
    // induce one) granted unlimited stores. Refusing to create a store during
    // an outage is recoverable; silently lifting the limit is not.
    if (existingSitesError) {
      console.error('[onboarding/complete] could not read existing sites:', existingSitesError);
      return NextResponse.json(
        { error: 'Could not verify your existing stores. Please try again in a moment.' },
        { status: 503 },
      );
    }

    const nowMs = Date.now();
    const totalSites = existingSites?.length ?? 0;
    const trialSites = (existingSites ?? []).filter(s => {
      const rawSub = (s as unknown as { site_subscriptions: unknown }).site_subscriptions;
      const sub = (Array.isArray(rawSub) ? rawSub[0] : rawSub) as
        | { store_expires_at: string | null } | null | undefined;
      const paidExpiry = sub?.store_expires_at ? new Date(sub.store_expires_at).getTime() : 0;
      if (paidExpiry > nowMs) return false;
      const trialEnd = new Date(s.created_at).getTime() + TRIAL_DURATION_MS;
      return trialEnd > nowMs;
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

    // Parse + validate body
    let payload: CompletePayload;
    try { payload = await request.json() as CompletePayload; }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const validation = validatePayload(payload);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { shopName, items = [] } = payload;
    const trimmedShopName = shopName.trim();

    // ── Atomic slug + site insert ────────────────────────────────────────────
    let site: { id: string; slug: string };
    try {
      // The design the owner picked at the counter, written on the same insert
      // as the site itself. Font follows the theme's own pairing; the picker
      // deliberately does not ask about type during onboarding, because every
      // extra decision there is measured against the abandonment it costs.
      const chosenTheme = isMenuThemeId(payload.menuTheme) ? payload.menuTheme : DEFAULT_MENU_THEME;
      const design = {
        menu_theme: chosenTheme,
        menu_font: MENU_THEMES[chosenTheme].fontPair,
        primary_color: isHexColor(payload.brandColor)
          ? payload.brandColor
          : MENU_THEMES[chosenTheme].accent,
      };
      site = await withRetry(() => insertSiteWithUniqueSlug(userId, trimmedShopName, design));

      // The design chosen at signup, recorded as the BASELINE. Without it the
      // October question — what share of owners change design in 30 days — has
      // a numerator and no denominator, and the answer would silently count
      // every store as never having chosen at all.
      audit({
        userId,
        siteId: site.id,
        action: 'menu_theme_change',
        targetId: site.id,
        details: { before: null, after: design, source: 'onboarding' },
        request,
      });
    } catch (err) {
      console.error('[onboarding/complete] site insert failed:', err);
      return NextResponse.json({ error: 'Failed to create site after retries' }, { status: 500 });
    }

    // ── site_subscriptions row (required for plan activation later) ─────────
    let subInserted = false;
    try {
      await withRetry(async () => {
        const { error } = await supabaseServer.from('site_subscriptions').insert({
          site_id: site.id, user_id: userId, store_plan: 'qr_menu',
        });
        if (error && error.code !== '23505') throw error;
      });
      subInserted = true;
    } catch (err) {
      console.error('[onboarding/complete] site_subscriptions insert failed:', err);
    }

    if (!subInserted) {
      await supabaseServer.from('sites').delete().eq('id', site.id);
      return NextResponse.json(
        { error: 'Could not initialise store subscription. Please try again.' },
        { status: 500 }
      );
    }

    // ── Bulk insert products ─────────────────────────────────────────────────
    let insertedCount = 0;
    if (items.length > 0) {
      // 1 batched embedding call + bounded-concurrency RPCs (was 300 fan-out)
      const imageUrls = await findImagesForItems(items.map(i => i.name));

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
      scored.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

      const rows = scored.map(({ item, imageUrl }, displayOrder) => ({
        site_id: site.id,
        name: item.name.trim(),
        selling_price: item.price,
        description: item.description,
        category: item.category ?? null,
        item_type: item.item_type,
        food_type: item.food_type,
        type:      item.item_type === 'variant' ? 'Variants' : item.item_type === 'combo' ? 'Combo' : 'Single Item',
        dish_type: (item.food_type === 'veg') ? 'Vegetarian' : 'Non-Vegetarian',
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
        if (prodError) throw prodError;
        insertedCount = rows.length;
      } catch (err) {
        console.error('[onboarding/complete] products insert failed after retries:', err);
        // Roll back site (cascades to site_subscriptions via FK)
        await supabaseServer.from('sites').delete().eq('id', site.id);
        return NextResponse.json(
          { error: 'Menu items could not be saved. Please try again.' },
          { status: 500 }
        );
      }
    }

    // Mark onboarding complete.
    //
    // upsert, not update: a plain UPDATE against a missing profiles row matches
    // zero rows and still reports success, so an account with no profile could
    // finish onboarding, be told it worked, and be bounced straight back to
    // /onboarding on the next visit. That is one half of the "existing user
    // treated as new" bug; the other half is the client gate in
    // ManageLayoutClient. onConflict 'id' so an existing row is updated rather
    // than rejected.
    try {
      await withRetry(async () =>
        supabaseServer
          .from('profiles')
          .upsert(
            {
              id: userId,
              onboarding_completed: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' },
          )
      );
    } catch (err) {
      console.error('[onboarding/complete] CRITICAL: failed to mark onboarding complete:', err);
    }

    const responseBody = {
      success: true,
      siteId: site.id,
      siteSlug: site.slug,
      itemCount: insertedCount,
      extracted: items.length,
      durationMs: Date.now() - t0,
    };

    // Cache for idempotency replay (best-effort, non-blocking failure)
    if (idemKey) await writeIdempotencyCache(idemKey, userId, 200, responseBody);

    return NextResponse.json(responseBody);
  } catch (err) {
    console.error('[onboarding/complete] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
