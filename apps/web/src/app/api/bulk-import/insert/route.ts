// src/app/api/bulk-import/insert/route.ts
// Receives extracted menu items (already parsed + described by /api/bulk-import/extract)
// and inserts them into an existing site with image matching + menu engineering.
//
// Hardened to match onboarding/complete scale (80–300 items):
//   • Description generation batched 50/call in parallel (same as menuExtractor Pass 2)
//   • One batched embedding call for all items needing vector image match
//   • Bounded RPC concurrency (10 in flight)
//   • .maybeSingle() on all single-row queries to avoid 406 on empty tables
//   • withRetry on insert
//   • Quota: 15 AI work units/user/day, reserved atomically before any spend
//
// ─── THE QUOTA IS A SPEND CONTROL, NOT A FAIR-USE COUNTER ────────────────────
// Everything below the reservation calls OpenAI on a single shared org key, so
// an unbounded caller here does not just run up a bill — it exhausts the key's
// rate limit and takes AI extraction offline for every paying customer at once.
//
// Three properties are load-bearing, and all three were absent (2026-09
// assessment, Finding 3). If you change this code, keep all three:
//
//   1. It meters the WORK. It used to charge `photosCount` from the request
//      body — a number between 1 and 5 with no relationship to the 300 items
//      and six parallel GPT-4o-mini calls the request actually bought.
//   2. It charges BEFORE the spend. It used to charge last, and only on the
//      success path, so aborting the connection did the work for free.
//   3. It increments by COMPARE-AND-SWAP. It used to read, then blind-upsert
//      `read + n`, so twenty concurrent requests all read zero, all passed, and
//      the counter finished at n.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { matchByKeyword } from '@/lib/menu/defaultImages';
import { weightedScore, previewQuadrant } from '@/lib/menu/menuEngineering';
import { rateLimit } from '@/lib/platform/rateLimit';
import { AI_PAGE_LIMITS } from '@/lib/platform/productFlags';
import { aiSpendAllowed, recordAiUsage } from '@/lib/menu/aiSpendGuard';
import OpenAI from 'openai';

import { logger } from '@/lib/platform/logger';
export const maxDuration = 60;
export const runtime = 'nodejs';

/**
 * Daily allowance, in AI work units. One unit ≈ one LLM round trip.
 *
 * Sized against a real import: five menu photos yields roughly 60 items, which
 * costs 1 (embedding pass) + 2 (description batches) = 3 units. So the day's
 * allowance is about five full imports, and a single maximal 300-item payload
 * costs 7 — two of those in a day and the owner is done.
 */
const DAILY_PHOTO_LIMIT = 15;

/** Requests per hour per user. The quota bounds spend; this bounds concurrency. */
const IMPORT_LIMIT_PER_HR = 10;

/** How many times to re-read and retry a losing compare-and-swap before giving up. */
const QUOTA_CAS_ATTEMPTS = 5;
const MAX_ITEMS = 300;
const MAX_VARIANTS = 10;
const SIM_THRESHOLD = 0.45;
const RPC_CONCURRENCY = 10;
const DESCRIBE_BATCH_SIZE = 50;

// ── OpenAI singleton ──────────────────────────────────────────────────────────
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function clampTier(v: number): number { return Math.min(4, Math.max(1, Math.round(v))); }

/**
 * How much AI work this payload will actually cause.
 *
 * One unit for the embedding + vector pass, which runs for every import, plus
 * one for each 50-item description batch — those fan out in parallel, so the
 * wall-clock cost hides the true spend and only a count reflects it.
 *
 * Items that arrive WITH a description are nearly free: they skip the expensive
 * leg entirely, which is why the count is of items needing one, not of items.
 */
function workUnitsFor(items: Record<string, unknown>[]): number {
    const needingDescription = items.filter(i => !String(i.description ?? '').trim()).length;
    return 1 + Math.ceil(needingDescription / DESCRIBE_BATCH_SIZE);
}

type Reservation = { ok: true; used: number } | { ok: false; used: number; reason: 'quota' | 'contention' };

/**
 * Atomically claim `units` of today's allowance, or refuse.
 *
 * Compare-and-swap against the value we read: the UPDATE carries
 * `.eq('photos_used', observed)`, so it matches only if no one moved the counter
 * in between. A losing writer sees zero rows, re-reads, and tries again. This is
 * what makes the check-and-charge a single decision rather than two racing ones.
 *
 * A Postgres `photos_used = photos_used + n` RPC would be cheaper, but that needs
 * a migration, and migrations are out of bounds without an explicit goal. The CAS
 * loop is equivalent for this contention level (one user's own concurrent
 * requests) and needs no schema change.
 */
async function reserveQuota(userId: string, day: string, units: number): Promise<Reservation> {
    let lastSeen = 0;

    for (let attempt = 0; attempt < QUOTA_CAS_ATTEMPTS; attempt++) {
        const { data: row } = await supabaseServer
            .from('bulk_import_usage')
            .select('photos_used')
            .eq('user_id', userId)
            .eq('month', day)
            .maybeSingle();

        const used = (row as { photos_used: number } | null)?.photos_used ?? null;
        lastSeen = used ?? 0;

        if (lastSeen + units > DAILY_PHOTO_LIMIT) {
            return { ok: false, used: lastSeen, reason: 'quota' };
        }

        if (used === null) {
            // First import of the day. A concurrent request may be inserting the
            // same row; 23505 means it won, so fall through and CAS against it.
            const { error } = await supabaseServer
                .from('bulk_import_usage')
                .insert({ user_id: userId, month: day, photos_used: units });
            if (!error) return { ok: true, used: units };
            if ((error as { code?: string }).code !== '23505') {
                logger.error('[bulk-import/insert] quota insert failed:', error);
                return { ok: false, used: lastSeen, reason: 'contention' };
            }
            continue;
        }

        const { data: claimed } = await supabaseServer
            .from('bulk_import_usage')
            .update({ photos_used: used + units })
            .eq('user_id', userId)
            .eq('month', day)
            .eq('photos_used', used)        // ← the compare half of compare-and-swap
            .select('photos_used');

        if (claimed && (claimed as unknown[]).length > 0) {
            return { ok: true, used: used + units };
        }
        // Someone else moved it. Re-read and try again.
    }

    return { ok: false, used: lastSeen, reason: 'contention' };
}

/**
 * Hand back a reservation whose work never completed.
 *
 * Best-effort and non-fatal: over-charging a user who hit a failed insert is a
 * support ticket, under-charging is a spend leak, so a failure to release is
 * logged and swallowed rather than retried into the request's latency.
 */
async function releaseQuota(userId: string, day: string, units: number): Promise<void> {
    try {
        const { data: row } = await supabaseServer
            .from('bulk_import_usage')
            .select('photos_used')
            .eq('user_id', userId)
            .eq('month', day)
            .maybeSingle();
        const used = (row as { photos_used: number } | null)?.photos_used;
        if (typeof used !== 'number') return;

        await supabaseServer
            .from('bulk_import_usage')
            .update({ photos_used: Math.max(0, used - units) })
            .eq('user_id', userId)
            .eq('month', day)
            .eq('photos_used', used);
    } catch (err) {
        logger.warn('[bulk-import/insert] quota release failed (non-fatal):', err);
    }
}

// Auto-infer menu engineering tiers for bulk import items (no user review step).
// Mirrors what owners assign manually during onboarding review.
//
// star_rating  (1–4) = popularity proxy: how much customers tend to order this
// profit_tier  (1–4) = profit margin proxy: high = simple/low-cost ingredients
// prep_complexity_tier (1–4) = kitchen effort: 1 = instant, 4 = long prep
function inferTiers(item: Record<string, unknown>): {
  star_rating: number;
  profit_tier: number;
  prep_complexity_tier: number;
} {
  const name     = String(item.name ?? '').toLowerCase();
  const category = String(item.category ?? '').toLowerCase();
  const price    = Math.max(0, Number(item.price) || 0);
  const itemType = String(item.item_type ?? 'single');

  // ── star_rating: popularity signal from name keywords ───────────────────
  let star_rating = 2;
  if (/special|signature|chef.?s|house|famous|best|must.?try|award/.test(name)) {
    star_rating = 4;
  } else if (/biryani|biriyani|butter\s+chicken|paneer\s+butter|dal\s+makhani|masala\s+dosa|thali|meal/.test(name)) {
    star_rating = 3; // universally popular dishes
  } else if (itemType === 'combo') {
    star_rating = 3; // combos drive high order counts
  }

  // ── profit_tier: margin signal from category + price bracket ────────────
  // Beverages/simple items = high margin (4). Expensive dishes = lower margin (1-2).
  let profit_tier = 2;
  if (/tea|coffee|chai|filter\s+coffee|juice|lassi|butter\s+milk|buttermilk|soda|water|shake|milkshake|smoothie/.test(name) ||
      /beverage|drink/.test(category)) {
    profit_tier = 4; // very high margin — almost pure ingredient cost is nil
  } else if (/bread|roti|chapati|parotta|paratha|idli|dosa|vada|puri|rice/.test(name)) {
    profit_tier = 3; // staple items — low ingredient cost, high volume
  } else if (price > 0 && price <= 100) {
    profit_tier = 3;
  } else if (price > 100 && price <= 250) {
    profit_tier = 2;
  } else if (price > 250) {
    profit_tier = 1; // expensive = premium ingredients, lower margin
  }

  // ── prep_complexity_tier: kitchen effort ─────────────────────────────────
  let prep_complexity_tier = 2;
  if (/tea|coffee|juice|water|soda|lassi|buttermilk/.test(name)) {
    prep_complexity_tier = 1; // pour and serve
  } else if (itemType === 'combo' || /thali|meal\s+box|family\s+pack/.test(name)) {
    prep_complexity_tier = 4; // assemble multiple dishes
  } else if (/biryani|biriyani|dum|slow.?cook|tandoor|roast|fry\s+rice|noodle/.test(name)) {
    prep_complexity_tier = 3; // long cook or marination
  } else if (/gravy|curry|korma|masala|salna|kuzhambu|sambhar/.test(name)) {
    prep_complexity_tier = 3;
  } else if (itemType === 'variant') {
    prep_complexity_tier = 2; // portioned dishes — standard complexity
  }

  return { star_rating, profit_tier, prep_complexity_tier };
}

function currentDay(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Image matching: one batched embedding call + bounded RPC concurrency ──────
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
    console.warn('[bulk-import/insert] embedding call failed — skipping vector match:', err);
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

// Same DESCRIBE prompt as menuExtractor Pass 2 — Tamil Nadu style, simple English
const DESCRIBE_SYSTEM_PROMPT = `You write ONE-LINE menu descriptions for a Tamil Nadu style restaurant.

You will receive a JSON array of items. Return { "descriptions": [ "...", "...", ... ] } in the same order, same length.

FORMAT:
- Write exactly ONE sentence (12–20 words). Keep it short, simple, and easy to read.
- No line breaks, no pipes, no bullet points. Just one clean sentence.
- For VARIANT items: prepend sizes with prices, then " — " then the one-liner.
  Example: "Half ₹160 · Full ₹320 — Spicy dum biryani with tender chicken, served hot with raita."

STYLE RULES:
- Write in simple, everyday English. No fancy words. Write like a friendly shop owner describing his food.
- Keep Tamil food terms natural: salna, kozhambu, poriyal, rasam, sambar, vadai, dosai, kothu, chutney, podimas, kuzhi, thayir, kaapi.
- Focus on taste and feel: hot, spicy, crispy, soft, tender, fresh, smoky, tangy, creamy, crunchy.
- Say what the dish actually is and how it tastes — not poetic descriptions.
- Never use: "delicious", "must-try", "mouth-watering", "exquisite", "culinary", "delectable".
- Know Tamil Nadu food deeply:
  "Chicken 65" = crispy fried chicken with curry leaves and chilli
  "Kothu Parotta" = chopped parotta mixed with egg/meat on a hot tawa
  "Mutton Chukka" = dry pepper mutton roast, Chettinad style
  "Kaara Kozhambu" = spicy tamarind gravy with onion and garlic
  "Parotta" = flaky layered bread served with salna
  "Eral Fry" = prawn fry with masala
  "Meen Kulambu" = fish curry cooked in tamarind and spices
  "Kuzhi Paniyaram" = small round snack made from idli/dosa batter
  "Pongal" = creamy rice-lentil dish tempered with pepper and ghee
  "Neer Dosa" = thin, soft rice crepe
  "Bonda" = deep-fried potato dumpling
  "Sundal" = boiled chickpeas tossed with coconut and curry leaves
  "Payasam" = sweet milk dessert with vermicelli or dal

EXAMPLES:
- Chicken Biryani → "Spicy dum biryani with tender chicken pieces, packed with flavour and served with raita and salna."
- Masala Dosa → "Crispy dosa stuffed with spiced potato, served hot with sambar and coconut chutney."
- Idli → "Soft steamed idlis served with hot sambar and fresh coconut chutney — simple and filling."
- Medu Vada → "Crispy lentil vada, golden outside and soft inside — best with sambar and chutney."
- Filter Coffee → "Hot filter kaapi made the Tamil way — strong, frothy, and fresh from the dabara."
- Parotta → "Flaky layered parotta straight off the tawa, best with a hot side of chicken salna."
- Kothu Parotta → "Chopped parotta mixed with egg and masala on a hot tawa — street-style and spicy."
- Chicken 65 → "Crispy fried chicken tossed with curry leaves, chilli, and pepper — hot and spicy."
- Mutton Chukka → "Dry roasted mutton with pepper, fennel, and coconut — Chettinad style, bold and spicy."
- Chicken Biryani (variant) → "Half ₹180 · Full ₹320 — Hot dum biryani with tender chicken, served with raita."
- Sambar Rice → "Hot sambar mixed with soft rice and a curry leaf tadka — comfort food at its best."
- Rasam → "Tangy pepper rasam with garlic and curry leaves — light, hot, and perfect with rice."
- Curd Rice → "Cool thayir sadam with mustard and curry leaves — the classic Tamil way to end a meal."
- Kuzhi Paniyaram → "Crispy golden paniyaram from fermented batter, served with coconut and tomato chutney."
- Pongal → "Creamy ven pongal with ghee, pepper, and cashews — warm, simple, and comforting."
- Chicken Shawarma → "Juicy chicken rolled in soft bread with garlic sauce and crunchy veggies."
- Mutton Biryani → "Slow-cooked mutton biryani with saffron rice and crispy onions — rich, spicy, and filling."
- Meen Kulambu → "Tangy fish curry cooked in tamarind and spices — hot, bold, and made for rice."
- Eral Fry → "Crispy prawn fry coated in spicy masala with curry leaves — fresh and flavourful."
- Poriyal → "Fresh vegetables stir-fried with mustard, urad dal, and coconut — simple and healthy."
- Gulab Jamun → "Soft sweet balls soaked in warm sugar syrup with a touch of cardamom."
- Veg Fried Rice → "Hot fried rice tossed with crunchy veggies and a dash of soy — quick and tasty."
- Kaara Kozhambu → "Spicy tamarind gravy with onion, garlic, and roasted spices — goes perfect with hot rice."
- Sundal → "Boiled chickpeas tossed with fresh coconut, curry leaves, and mustard — light and crunchy."

Every item MUST get a non-empty description. Never return an empty string.`;

// Batched parallel description generation — same approach as menuExtractor Pass 2.
// Chunks into 50-item batches, all batches run in parallel → wall time ≈ 1 batch.
async function generateDescriptions(items: Record<string, unknown>[], spendKey?: string): Promise<string[]> {
  const descriptions = new Array<string>(items.length).fill('');
  const indexed = items.map((item, idx) => ({ item, idx }));
  const batches = chunk(indexed, DESCRIBE_BATCH_SIZE);

  await Promise.all(batches.map(async (batch) => {
    const payload = batch.map(({ item }) => ({
      name: String(item.name ?? ''),
      item_type: String(item.item_type ?? 'single'),
      food_type: String(item.food_type ?? 'unknown'),
      variants: Array.isArray(item.variants) ? item.variants : [],
    }));

    try {
      const res = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: DESCRIBE_SYSTEM_PROMPT },
          { role: 'user', content: `Write descriptions for these ${payload.length} items:\n\n${JSON.stringify(payload)}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 8000,
      });
      if (spendKey) recordAiUsage('gpt-4o-mini', res.usage, spendKey);
      const raw = res.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const descs = Array.isArray(parsed.descriptions) ? parsed.descriptions as string[] : [];
      batch.forEach(({ idx }, batchIdx) => {
        descriptions[idx] = descs[batchIdx] ?? '';
      });
    } catch (err) {
      console.error('[bulk-import/insert] description batch failed:', err);
    }
  }));

  // Keyword fallback for any item still without a description
  items.forEach((item, idx) => {
    if (!descriptions[idx]) {
      const kw = matchByKeyword(String(item.name ?? ''));
      descriptions[idx] = kw?.description ?? `${String(item.name ?? '')} — freshly prepared and served.`;
    }
  });

  return descriptions;
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

    // Rate limit — the daily quota bounds total spend; this bounds how fast it
    // can be attempted, and keeps a burst of parallel requests from all landing
    // in the CAS loop at once.
    const rl = rateLimit(`bulk-insert:${userId}`, { limit: IMPORT_LIMIT_PER_HR, windowMs: 60 * 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many imports. Please try again in a few minutes.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
      );
    }

    // Parse body
    let body: { siteId: string; items: Record<string, unknown>[]; photosCount: number };
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const { siteId, photosCount } = body;
    let items: Record<string, unknown>[] = body.items ?? [];

    if (!siteId || typeof siteId !== 'string')
      return NextResponse.json({ error: 'siteId required' }, { status: 400 });
    if (typeof photosCount !== 'number' || photosCount < 1 || photosCount > 5)
      return NextResponse.json({ error: 'photosCount must be 1–5' }, { status: 400 });
    if (!Array.isArray(items) || items.length === 0)
      return NextResponse.json({ error: 'No items to insert' }, { status: 400 });
    if (items.length > MAX_ITEMS)
      return NextResponse.json({ error: `Too many items — max ${MAX_ITEMS}` }, { status: 400 });

    // Sanitise items — drop rows with no name, clamp fields
    items = items
      .filter(i => typeof i.name === 'string' && String(i.name).trim().length > 0)
      .map(i => ({
        ...i,
        name:        String(i.name).trim().slice(0, 200),
        price:       Math.max(0, Math.min(10_000, Number(i.price) || 0)),
        category:    i.category ? String(i.category).trim().slice(0, 80) : '',
        item_type:   ['single', 'variant', 'combo'].includes(String(i.item_type)) ? i.item_type : 'single',
        food_type:   ['veg', 'non_veg', 'egg', 'unknown'].includes(String(i.food_type)) ? i.food_type : 'unknown',
        description: String(i.description ?? '').trim(),
        variants:    Array.isArray(i.variants) ? i.variants.slice(0, MAX_VARIANTS) : [],
      }));

    if (items.length === 0)
      return NextResponse.json({ error: 'No valid items after sanitisation' }, { status: 400 });

    // Verify site belongs to this user
    const { data: siteRow, error: siteErr } = await supabaseServer
      .from('sites').select('id').eq('id', siteId).eq('user_id', userId).maybeSingle();
    if (siteErr || !siteRow)
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    // ── Reserve the AI spend BEFORE incurring any of it ──────────────────────
    // `photosCount` is still accepted for client back-compat but no longer
    // meters anything: it is a request-body number, and the cost is set by how
    // many items need a description. See workUnitsFor().
    //
    // AI_PAGE_LIMITS ON: the AI-read pages were already counted per store at
    // /bulk-import/extract, so the daily quota is no longer the gate. The
    // per-account daily $ cap stops this endpoint becoming an unmetered
    // description generator.
    const day = currentDay();
    const units = workUnitsFor(items);
    if (!AI_PAGE_LIMITS) {
      const reservation = await reserveQuota(userId, day, units);

      if (!reservation.ok) {
        if (reservation.reason === 'contention') {
          return NextResponse.json(
            { error: 'Could not reserve your import allowance. Please retry.', code: 'QUOTA_CONTENTION' },
            { status: 503 },
          );
        }
        return NextResponse.json({
          error: `Daily limit reached. You've used ${reservation.used} of ${DAILY_PHOTO_LIMIT} today.`,
          code: 'QUOTA_EXCEEDED',
          photosUsed: reservation.used,
          limit: DAILY_PHOTO_LIMIT,
        }, { status: 429 });
      }

      // From here on the allowance is spent. Every exit path that does NOT deliver
      // products must call releaseQuota, or an owner is charged for nothing.
      logger.debug(`[bulk-import/insert] reserved ${units} unit(s); ${reservation.used}/${DAILY_PHOTO_LIMIT} used today`);
    } else if (!aiSpendAllowed(userId)) {
      return NextResponse.json(
        { error: "You've reached today's scanning limit. Add your items by hand, or try again tomorrow.", code: 'DAILY_SCAN_LIMIT' },
        { status: 429 },
      );
    }

    // Generate descriptions for items that have none — batched 50/call in parallel
    const needsDesc = items.some(i => !String(i.description ?? '').trim());
    if (needsDesc) {
      logger.debug(`[bulk-import/insert] generating descriptions for ${items.length} items in batches of ${DESCRIBE_BATCH_SIZE}`);
      const descs = await generateDescriptions(items, AI_PAGE_LIMITS ? userId : undefined);
      items = items.map((item, idx) => ({
        ...item,
        description: String(item.description ?? '').trim() || descs[idx],
      }));
    }

    // Image matching — one batched embedding call + bounded RPC concurrency
    const imageUrls = await findImagesForItems(items.map(i => String(i.name ?? '')));

    // Auto-infer tiers for items that don't have owner-assigned values,
    // then apply menu engineering score + sort (same formula as onboarding)
    const itemsWithTiers: Record<string, unknown>[] = items.map(item => {
      const inferred = inferTiers(item);
      return {
        ...item,
        star_rating:          clampTier(Number(item.star_rating)          || inferred.star_rating),
        profit_tier:          clampTier(Number(item.profit_tier)          || inferred.profit_tier),
        prep_complexity_tier: clampTier(Number(item.prep_complexity_tier) || inferred.prep_complexity_tier),
      };
    });

    const scored = itemsWithTiers.map((item, originalIndex) => ({
      item,
      imageUrl: imageUrls[originalIndex] ?? null,
      originalIndex,
      score: weightedScore({
        starRating:  item.star_rating as number,
        profitTier:  item.profit_tier as number,
        ordersToday: 0,
        likeCount:   0,
        offerActive: false,
      }),
    }));
    scored.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

    // Base display_order — append after existing products
    // maybeSingle() avoids 406 when the site has no products yet
    const { data: maxOrderRow } = await supabaseServer
      .from('products')
      .select('display_order')
      .eq('site_id', siteId)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const baseOrder = ((maxOrderRow as { display_order: number } | null)?.display_order ?? -1) + 1;

    // Build product rows
    const rows = scored.map(({ item, imageUrl }, idx) => {
      const itemType   = String(item.item_type ?? 'single');
      const foodType   = String(item.food_type ?? 'unknown');
      const starRating = item.star_rating as number;
      const profitTier = item.profit_tier as number;
      const prepTier   = item.prep_complexity_tier as number;
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

    // Bulk insert with retry
    try {
      await withRetry(async () => {
        const result = await supabaseServer.from('products').insert(rows);
        if (result.error) throw result.error;
      });
    } catch (err) {
      console.error('[bulk-import/insert] insert failed:', err);
      // The AI spend already happened, but the owner got no products for it.
      // Hand the allowance back rather than charging for a failed import.
      if (!AI_PAGE_LIMITS) await releaseQuota(userId, day, units);
      return NextResponse.json({ error: 'Failed to save products. Please try again.' }, { status: 500 });
    }

    // Quota was charged up front — nothing to write here.

    logger.debug(`[bulk-import/insert] inserted ${rows.length} products in ${Date.now() - t0}ms`);

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
