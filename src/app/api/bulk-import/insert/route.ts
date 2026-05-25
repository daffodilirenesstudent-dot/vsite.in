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
//   • Quota: 15 photos/user/day tracked in bulk_import_usage

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { matchByKeyword } from '@/lib/defaultImages';
import { weightedScore, previewQuadrant } from '@/lib/menuEngineering';
import OpenAI from 'openai';

export const maxDuration = 60;
export const runtime = 'nodejs';

const DAILY_PHOTO_LIMIT = 15;
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

// Same DESCRIBE prompt as menuExtractor Pass 2 — South Indian style, variant format
const DESCRIBE_SYSTEM_PROMPT = `You write descriptions for South Indian restaurant menu items.

You will receive a JSON array of items. Return { "descriptions": [ "...", "...", ... ] } in the same order, same length.

FORMAT — depends on item_type:

SINGLE — exactly 4 lines joined by " | ":
  Line 1: Main ingredient or how it is prepared
  Line 2: Taste / texture highlight
  Line 3: Served with / accompaniments
  Line 4: Best occasion or extra note
  Example: "Crispy dosa made with fermented rice batter | Golden and crunchy outside, soft inside | Served with sambar and fresh coconut chutney | Perfect for a light breakfast or snack"

VARIANT — size-price pairs, then dish description after " || ":
  Format: "Size - ₹Price | Size - ₹Price || One-line dish description"
  Use the EXACT prices from the variants array.
  Example: "Full - ₹360 | Half - ₹160 || Tender chicken marinated in spices and chargrilled to smoky perfection"

COMBO — 4 lines joined by " | ":
  Line 1: Main item(s) included
  Line 2: Sides included
  Line 3: Drink/dessert or value highlight
  Line 4: Serving note
  Example: "Steamed rice, sambar and 2 curries | Served with papad, pickle and salad | Includes a sweet payasam | A satisfying South Indian meal"

GUIDELINES:
- Simple appetising English. Avoid generic filler ("a delicious dish").
- Use authentic South Indian terms where natural: tadka, tawa, chutney, sambar, podi, rasam, appam, kothu, salna.
- Infer accurately from the name. "Mutton Chukka" = dry mutton roast, "Karandi Omelette" = egg omelette in spoon, etc.
- Every item must get a non-empty description.`;

// Batched parallel description generation — same approach as menuExtractor Pass 2.
// Chunks into 50-item batches, all batches run in parallel → wall time ≈ 1 batch.
async function generateDescriptions(items: Record<string, unknown>[]): Promise<string[]> {
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
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: DESCRIBE_SYSTEM_PROMPT },
          { role: 'user', content: `Write descriptions for these ${payload.length} items:\n\n${JSON.stringify(payload)}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 8000,
      });
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

    // Parse body
    let body: { siteId: string; items: Record<string, unknown>[]; photosCount: number };
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const { siteId, photosCount } = body;
    let items: Record<string, unknown>[] = body.items ?? [];

    if (!siteId || typeof siteId !== 'string')
      return NextResponse.json({ error: 'siteId required' }, { status: 400 });
    if (typeof photosCount !== 'number' || photosCount < 1 || photosCount > 3)
      return NextResponse.json({ error: 'photosCount must be 1–3' }, { status: 400 });
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

    // Quota check — maybeSingle() avoids 406 for first-time users
    const day = currentDay();
    const { data: usageRow } = await supabaseServer
      .from('bulk_import_usage')
      .select('photos_used')
      .eq('user_id', userId)
      .eq('month', day)
      .maybeSingle();
    const photosUsed = (usageRow as { photos_used: number } | null)?.photos_used ?? 0;

    if (photosUsed + photosCount > DAILY_PHOTO_LIMIT) {
      return NextResponse.json({
        error: `Daily limit reached. You've used ${photosUsed} of ${DAILY_PHOTO_LIMIT} photos today.`,
        code: 'QUOTA_EXCEEDED',
        photosUsed,
        limit: DAILY_PHOTO_LIMIT,
      }, { status: 429 });
    }

    // Generate descriptions for items that have none — batched 50/call in parallel
    const needsDesc = items.some(i => !String(i.description ?? '').trim());
    if (needsDesc) {
      console.log(`[bulk-import/insert] generating descriptions for ${items.length} items in batches of ${DESCRIBE_BATCH_SIZE}`);
      const descs = await generateDescriptions(items);
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
      return NextResponse.json({ error: 'Failed to save products. Please try again.' }, { status: 500 });
    }

    // Update quota — upsert is safe on concurrent retry
    await supabaseServer.from('bulk_import_usage').upsert(
      { user_id: userId, month: day, photos_used: photosUsed + photosCount },
      { onConflict: 'user_id,month' }
    );

    console.log(`[bulk-import/insert] inserted ${rows.length} products in ${Date.now() - t0}ms`);

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
