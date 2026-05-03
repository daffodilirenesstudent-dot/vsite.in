// src/lib/menuExtractor.ts
//
// Two-pass pipeline for high accuracy on large menus (200–300+ items) within
// Vercel Hobby's 60s function ceiling.
//
//   Pass 1 — EXTRACT (images → GPT-4o, COMPACT JSON output)
//     Output is a tuple-array — ["name", price, "category", typeChar, foodChar, [["sz",p]]]
//     This cuts output tokens ~3x vs verbose JSON, so 300 items fit in 16k easily.
//     Visual cues from images (veg/non-veg dots, section headings) are preserved.
//
//   Pass 2 — DESCRIBE (gpt-4o, parallel batches of 50)
//     Writes South Indian style descriptions per item. Runs concurrently so wall
//     time for 300 items ≈ wall time for 50 items (~6-8s).
//
//   Post-processing (deterministic, no LLM):
//     • Dedup by (normalized_name, price)
//     • Price sanity check (clamp impossibly large hallucinations)
//     • Description fallback: keyword match if Pass 2 returned empty
//
// Fallback: aggregated OCR text path used only if Pass 1 image call returns 0 items.

import OpenAI from 'openai';
import { matchByKeyword } from '@/lib/defaultImages';

// ── Module-level singleton — reuses HTTPS connection across calls ────────────
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface MenuItemVariant {
  size: string;
  price: number;
}

export interface MenuItem {
  name: string;
  price: number;
  description: string;
  category: string;
  item_type: 'single' | 'variant' | 'combo';
  food_type: 'veg' | 'non_veg' | 'egg' | 'unknown';
  variants?: MenuItemVariant[];
}

// ── Constants — env-overridable ──────────────────────────────────────────────

const MAX_PRICE = 10_000;          // INR — flag/clamp anything above this
const SUSPICIOUS_PRICE = 3_000;    // log a warning above this
const MAX_VARIANTS = 10;
const DESCRIBE_BATCH_SIZE = 50;
const PASS1_MAX_TOKENS = 16_000;
const PASS2_MAX_TOKENS = 8_000;

// ── Pass 1 prompt: COMPACT tuple output ──────────────────────────────────────

const EXTRACT_SYSTEM_PROMPT = `You are a menu parser for Indian restaurants. Extract every menu item from the provided menu images or OCR text.

Return a JSON object with a single key "items" whose value is an array of TUPLES (not objects) for compactness:

{ "items": [
  ["Item Name", price, "Category", "s", "v", []],
  ["Grill Chicken", 160, "Grills", "v", "n", [["Half",160],["Full",360]]]
]}

TUPLE POSITIONS (always 6 elements, in this exact order):
  [0] name        — string, English (transliterate regional names: பணியாரம் → Paniyaram)
  [1] price       — number in INR. For variants use the LOWEST variant price. Use 0 only if no price visible.
  [2] category    — string, exact section heading from menu, or "" if none
  [3] item_type   — single character: "s" = single, "v" = variant, "c" = combo
  [4] food_type   — single character: "v" = veg, "n" = non_veg, "e" = egg, "u" = unknown
  [5] variants    — array of [size, price] pairs. REQUIRED for "v" items. Empty [] otherwise.

RULES:
- Extract EVERY item visible across all images — do not skip any.
- Remove duplicates that appear on multiple pages (cover + interior).
- Skip non-food lines: phone numbers, addresses, taglines, table numbers, GST notes.
- "v" item_type = same dish in multiple sizes/portions with different prices (Half/Full, 250ml/500ml, Small/Large).
- "c" item_type = bundled meal deal ("Combo 1: Burger + Fries").
- Write NO descriptions — leave that for the next stage.
- If no items found return { "items": [] }.`;

// ── Pass 2 prompt: description generation ────────────────────────────────────

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
- If "egg" appears in the name, treat as egg-based and describe accordingly.
- Every item must get a non-empty description.`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeName(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
}

function clampPrice(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > MAX_PRICE) {
    console.warn(`[menuExtractor] price ${raw} exceeds MAX_PRICE ${MAX_PRICE} — clamping to 0 (probable hallucination)`);
    return 0;
  }
  if (raw > SUSPICIOUS_PRICE) {
    console.warn(`[menuExtractor] suspicious price ${raw} (above ${SUSPICIOUS_PRICE}) — keeping but flag for review`);
  }
  return raw;
}

const TYPE_CHAR_MAP: Record<string, MenuItem['item_type']> = { s: 'single', v: 'variant', c: 'combo' };
const FOOD_CHAR_MAP: Record<string, MenuItem['food_type']> = { v: 'veg', n: 'non_veg', e: 'egg', u: 'unknown' };

// Tuple → MenuItem (without description). Tolerant to extra/missing fields and
// to the model occasionally returning verbose objects instead of tuples.
function tupleToItem(t: unknown): Omit<MenuItem, 'description'> | null {
  // Tuple form
  if (Array.isArray(t)) {
    const [name, price, category, typeChar, foodChar, variantsRaw] = t as unknown[];
    if (typeof name !== 'string' || !name.trim()) return null;

    const item_type = TYPE_CHAR_MAP[String(typeChar).toLowerCase()] ?? 'single';
    const food_type = FOOD_CHAR_MAP[String(foodChar).toLowerCase()] ?? 'unknown';

    const rawVariants = Array.isArray(variantsRaw) ? variantsRaw : [];
    const variants: MenuItemVariant[] = rawVariants.slice(0, MAX_VARIANTS)
      .map(v => Array.isArray(v) ? { size: String(v[0] ?? '').trim(), price: clampPrice(v[1]) } : null)
      .filter((v): v is MenuItemVariant => v !== null && v.size.length > 0 && v.size.length <= 50);

    let finalPrice = clampPrice(price);
    if (item_type === 'variant' && variants.length > 0 && finalPrice === 0) {
      finalPrice = Math.min(...variants.map(v => v.price).filter(p => p > 0)) || 0;
    }

    return {
      name: name.trim().slice(0, 200),
      price: finalPrice,
      category: typeof category === 'string' ? category.trim().slice(0, 80) : '',
      item_type,
      food_type,
      variants: item_type === 'variant' && variants.length > 0 ? variants : undefined,
    };
  }

  // Verbose object form (defensive — older prompt format)
  if (typeof t === 'object' && t !== null) {
    const o = t as Record<string, unknown>;
    if (typeof o.name !== 'string' || !o.name.trim()) return null;

    const itRaw = String(o.item_type ?? '').toLowerCase();
    const item_type: MenuItem['item_type'] =
      (['single', 'variant', 'combo'] as const).includes(itRaw as MenuItem['item_type'])
        ? (itRaw as MenuItem['item_type']) : 'single';

    const ftRaw = String(o.food_type ?? '').toLowerCase();
    const food_type: MenuItem['food_type'] =
      (['veg', 'non_veg', 'egg', 'unknown'] as const).includes(ftRaw as MenuItem['food_type'])
        ? (ftRaw as MenuItem['food_type']) : 'unknown';

    const rawVariants = Array.isArray(o.variants) ? o.variants : [];
    const variants: MenuItemVariant[] = rawVariants.slice(0, MAX_VARIANTS)
      .map(v => {
        if (typeof v !== 'object' || v === null) return null;
        const vo = v as Record<string, unknown>;
        const size = typeof vo.size === 'string' ? vo.size.trim() : '';
        return size.length > 0 && size.length <= 50 ? { size, price: clampPrice(vo.price) } : null;
      })
      .filter((v): v is MenuItemVariant => v !== null);

    let finalPrice = clampPrice(o.price);
    if (item_type === 'variant' && variants.length > 0 && finalPrice === 0) {
      finalPrice = Math.min(...variants.map(v => v.price).filter(p => p > 0)) || 0;
    }

    return {
      name: o.name.trim().slice(0, 200),
      price: finalPrice,
      category: typeof o.category === 'string' ? o.category.trim().slice(0, 80) : '',
      item_type,
      food_type,
      variants: item_type === 'variant' && variants.length > 0 ? variants : undefined,
    };
  }

  return null;
}

function parseRawTuples(raw: string): Array<Omit<MenuItem, 'description'>> {
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(raw) as Record<string, unknown>; }
  catch (err) {
    console.error('[menuExtractor] JSON parse failed (likely truncated):', err);
    return [];
  }

  let items: unknown[] = [];
  if (Array.isArray(parsed.items)) items = parsed.items;
  else {
    const key = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
    if (key) items = parsed[key] as unknown[];
  }

  return items.map(tupleToItem).filter((i): i is Omit<MenuItem, 'description'> => i !== null);
}

// ── Deterministic dedup: same item appearing on multiple pages ───────────────

function dedupItems<T extends { name: string; price: number }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    const key = `${normalizeName(item.name)}|${item.price}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return Array.from(seen.values());
}

// ── Pass 2: parallel batched description generation ─────────────────────────

async function generateDescriptions(
  openai: OpenAI,
  items: Array<Omit<MenuItem, 'description'>>
): Promise<string[]> {
  const descriptions = new Array<string>(items.length).fill('');
  const batches = chunk(items.map((item, idx) => ({ item, idx })), DESCRIBE_BATCH_SIZE);

  await Promise.all(batches.map(async (batch) => {
    const payload = batch.map(({ item }) => ({
      name: item.name,
      item_type: item.item_type,
      food_type: item.food_type,
      variants: item.variants ?? [],
    }));

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: DESCRIBE_SYSTEM_PROMPT },
          { role: 'user', content: `Write descriptions for these ${payload.length} items:\n\n${JSON.stringify(payload)}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: PASS2_MAX_TOKENS,
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const descs = Array.isArray(parsed.descriptions)
        ? (parsed.descriptions as unknown[]).map(d => String(d ?? '').trim())
        : [];

      batch.forEach(({ idx }, batchIdx) => {
        descriptions[idx] = descs[batchIdx] ?? '';
      });
    } catch (err) {
      console.error('[menuExtractor] Pass 2 batch failed (items left without description, fallback applied):', err);
    }
  }));

  // Fallback: any item still without a description gets the keyword-matched
  // description from the default-images library (or a safe generic).
  items.forEach((item, idx) => {
    if (!descriptions[idx]) {
      const kw = matchByKeyword(item.name);
      descriptions[idx] = kw?.description ?? `${item.name} — freshly prepared and served.`;
    }
  });

  return descriptions;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Pass 1+2: images → compact tuple extraction → dedup → parallel descriptions.
 * Handles 300+ items reliably within Vercel Hobby's 60s ceiling.
 */
export async function extractMenuItemsFromImages(
  images: Array<{ buffer: Buffer; mime: string }>
): Promise<MenuItem[]> {
  if (images.length === 0) return [];

  const openai = getOpenAI();
  const t0 = Date.now();

  // Pass 1 — single GPT-4o call with all images
  let rawTuples: Array<Omit<MenuItem, 'description'>> = [];
  try {
    const imageContent = images.map(({ buffer, mime }) => ({
      type: 'image_url' as const,
      image_url: {
        url: `data:${mime};base64,${buffer.toString('base64')}`,
        // 'auto' lets GPT-4o decide — uses 'high' only when text density needs it.
        // Cuts vision token cost ~3-4x vs forcing 'high' for every image.
        detail: 'auto' as const,
      },
    }));

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            ...imageContent,
            { type: 'text', text: 'Extract every menu item from these images. Use the compact tuple format.' },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: PASS1_MAX_TOKENS,
    });

    rawTuples = parseRawTuples(completion.choices[0]?.message?.content ?? '{}');
    console.log(`[menuExtractor] Pass 1 (images): ${rawTuples.length} items in ${Date.now() - t0}ms`);
  } catch (err) {
    console.error('[menuExtractor] Pass 1 (image extraction) failed:', err);
    return [];
  }

  if (rawTuples.length === 0) return [];

  // Dedup before Pass 2 (don't waste tokens describing the same item twice)
  const deduped = dedupItems(rawTuples);
  if (deduped.length < rawTuples.length) {
    console.log(`[menuExtractor] dedup: ${rawTuples.length} → ${deduped.length}`);
  }

  // Pass 2 — descriptions
  const t1 = Date.now();
  const descriptions = await generateDescriptions(openai, deduped);
  console.log(`[menuExtractor] Pass 2 (descriptions): ${descriptions.filter(Boolean).length}/${deduped.length} in ${Date.now() - t1}ms`);

  return deduped.map((item, idx) => ({ ...item, description: descriptions[idx] }));
}

/**
 * OCR text fallback path. Same structure as image path — used when Pass 1
 * image call returns 0 items (model couldn't read images).
 */
export async function extractMenuItems(ocrText: string): Promise<MenuItem[]> {
  if (!ocrText.trim()) return [];

  const openai = getOpenAI();

  let rawTuples: Array<Omit<MenuItem, 'description'>> = [];
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
        { role: 'user', content: `Menu OCR text:\n\n${ocrText}` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: PASS1_MAX_TOKENS,
    });

    rawTuples = parseRawTuples(completion.choices[0]?.message?.content ?? '{}');
    console.log(`[menuExtractor] Pass 1 (OCR): ${rawTuples.length} items`);
  } catch (err) {
    console.error('[menuExtractor] Pass 1 (OCR extraction) failed:', err);
    return [];
  }

  if (rawTuples.length === 0) return [];

  const deduped = dedupItems(rawTuples);
  const descriptions = await generateDescriptions(openai, deduped);
  return deduped.map((item, idx) => ({ ...item, description: descriptions[idx] }));
}
