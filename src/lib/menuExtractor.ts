// src/lib/menuExtractor.ts
//
// Two-pass pipeline for high accuracy on large menus (200+ items):
//
//   Pass 1 — EXTRACT (images → GPT-4o)
//     Focused only on: name, price, category, item_type, food_type, variants.
//     No descriptions — keeps output tokens small so 200+ items fit without
//     truncation. Pricing and structure accuracy is near-perfect at this scale.
//
//   Pass 2 — DESCRIBE (batches of 60 → gpt-4o-mini, parallel)
//     Writes full South Indian style descriptions for each item using the
//     item name, type, food_type, and variant info. Runs in parallel batches
//     so 200 items takes the same wall-clock time as 60 items (1 batch time).
//
// Fallback (OCR text path): same two-pass approach applied to aggregated text.

import OpenAI from 'openai';

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
  food_type: 'veg' | 'non_veg' | 'unknown';
  variants?: MenuItemVariant[];
}

// ── Pass 1 prompts: extract structure only, no descriptions ──────────────────

const EXTRACT_SYSTEM_PROMPT = `You are a menu parser for Indian restaurants and cafes. Your only job is to extract the COMPLETE list of every menu item from the provided content (images or OCR text).

Return a JSON object: { "items": [ ... ] }

Each item shape:
{
  "name": "English name (transliterate regional names — e.g. பணியாரம் → Paniyaram)",
  "price": 120,
  "category": "Section heading (e.g. Starters, Main Course, Beverages)",
  "item_type": "single",
  "food_type": "veg",
  "variants": []
}

RULES — follow exactly:

name:
- Translate or transliterate to English. Use standard spelling.
- Do NOT skip any item visible in the menu.

price:
- Exact INR price as a number.
- For variant items: use the LOWEST variant price.
- Use 0 only when price is completely absent.

category:
- The section heading this item belongs to. Copy exactly from the menu.
- Use "" if no section heading exists.

item_type:
- "variant"  → item sold in multiple sizes/portions with DIFFERENT prices (Small/Large, Full/Half, 250ml/100ml)
- "combo"    → bundled meal deal (e.g. "Combo 1: Burger + Fries + Drink")
- "single"   → everything else

variants (REQUIRED when item_type is "variant"):
- List every size: [{ "size": "Full", "price": 360 }, { "size": "Half", "price": 160 }]
- Use exact labels from the menu (Full, Half, Small, Large, 250ml, 100ml, Regular, Premium, etc.)
- Empty array [] for single/combo items.

food_type:
- "veg"     → vegetarian
- "non_veg" → meat, chicken, fish, egg
- "unknown" → genuinely unclear

CRITICAL:
- Extract EVERY item — do not skip any.
- Remove duplicates and non-food lines (phone numbers, addresses, taglines, table numbers).
- Do NOT write descriptions — leave that field out entirely.
- If no items found: { "items": [] }`;

// ── Pass 2 prompt: description writing ──────────────────────────────────────

const DESCRIBE_SYSTEM_PROMPT = `You are a menu copywriter specialising in South Indian and Indian restaurant menus. You will receive a JSON array of menu items. For each item write a vivid, accurate description in South Indian restaurant style.

Return a JSON object: { "descriptions": [ "desc for item 0", "desc for item 1", ... ] }

The array MUST have the same length as the input array and be in the same order.

Description format rules:

SINGLE items — exactly 4 lines joined by " | ":
  Line 1: Main ingredient or how it is prepared
  Line 2: Taste or texture highlight
  Line 3: Served with / accompaniments
  Line 4: Best occasion or extra note
  Example: "Crispy dosa made with fermented rice batter | Golden and crunchy outside, soft and airy inside | Served with sambar and fresh coconut chutney | Perfect for breakfast or a light evening snack"

VARIANT items — size-price pairs, then a dish description after " || ":
  Format: "SizeLabel - ₹Price | SizeLabel - ₹Price || One-line description of the dish"
  Use the EXACT size labels and prices from the variants array.
  Example: "Full - ₹360 | Half - ₹160 || Tender chicken marinated in aromatic spices and grilled to perfection"

COMBO items — 4 lines joined by " | " listing what is included:
  Line 1: Main items in the combo
  Line 2: Sides included
  Line 3: Drink or dessert (if any), or value highlight
  Line 4: Serving note or who it suits
  Example: "Steamed rice with sambar, rasam and 2 curries | Served with papad, pickle and fresh salad | Includes a sweet pongal or payasam | A wholesome South Indian meal for one"

General rules:
- Write in simple, appetising English — avoid overly formal or generic phrases.
- Use South Indian culinary terms where appropriate (e.g. tadka, tempering, tawa, masala, chutney, rasam, appam).
- Infer from the name: if the name contains "chicken / mutton / fish / prawn / egg" treat as non-veg and describe accordingly.
- If the name is a regional dish, describe it authentically (e.g. Appam → lacy fermented rice pancake).
- Never invent prices. Use the prices from the variants array exactly.
- Every item in the output array must have a non-empty description.`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

type RawItem = Record<string, unknown>;

function parseRawItems(raw: string): RawItem[] {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    let items: unknown[] = [];
    if (Array.isArray(parsed.items)) {
      items = parsed.items;
    } else {
      const key = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      if (key) items = parsed[key] as unknown[];
    }
    return items.filter((i): i is RawItem => typeof i === 'object' && i !== null);
  } catch {
    return [];
  }
}

function buildMenuItems(rawItems: RawItem[], descriptions: string[]): MenuItem[] {
  return rawItems
    .filter(i => typeof i.name === 'string' && (i.name as string).trim().length > 0)
    .map((i, idx) => {
      const item_type = (['single', 'variant', 'combo'] as const).includes(
        i.item_type as MenuItem['item_type']
      ) ? (i.item_type as MenuItem['item_type']) : 'single';

      const rawVariants = Array.isArray(i.variants) ? (i.variants as unknown[]) : [];
      const variants: MenuItemVariant[] = rawVariants
        .filter((v): v is RawItem => typeof v === 'object' && v !== null)
        .filter(v => typeof v.size === 'string' && (v.size as string).trim().length > 0)
        .map(v => ({
          size: String(v.size).trim(),
          price: typeof v.price === 'number' ? Math.max(0, v.price) : 0,
        }));

      let price = typeof i.price === 'number' ? Math.max(0, i.price) : 0;
      if (item_type === 'variant' && variants.length > 0 && price === 0) {
        price = Math.min(...variants.map(v => v.price));
      }

      return {
        name: String(i.name).trim(),
        price,
        description: descriptions[idx] ?? '',
        category: typeof i.category === 'string' ? i.category.trim() : '',
        item_type,
        food_type: (['veg', 'non_veg', 'unknown'] as const).includes(
          i.food_type as MenuItem['food_type']
        ) ? (i.food_type as MenuItem['food_type']) : 'unknown',
        variants: item_type === 'variant' && variants.length > 0 ? variants : undefined,
      };
    });
}

// ── Pass 2: parallel batch description generation ────────────────────────────

async function generateDescriptions(
  openai: OpenAI,
  items: RawItem[],
  batchSize = 60
): Promise<string[]> {
  const descriptions = new Array<string>(items.length).fill('');
  const batches = chunk(items.map((item, idx) => ({ item, idx })), batchSize);

  await Promise.all(
    batches.map(async (batch) => {
      const payload = batch.map(({ item }) => ({
        name: item.name,
        item_type: item.item_type ?? 'single',
        food_type: item.food_type ?? 'unknown',
        variants: Array.isArray(item.variants) ? item.variants : [],
      }));

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: DESCRIBE_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Write descriptions for these ${payload.length} menu items:\n\n${JSON.stringify(payload)}`,
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 8000,
        });

        const raw = completion.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const descs = Array.isArray(parsed.descriptions)
          ? (parsed.descriptions as unknown[]).map(d => String(d ?? '').trim())
          : [];

        batch.forEach(({ idx }, batchIdx) => {
          descriptions[idx] = descs[batchIdx] ?? '';
        });

        console.log(`[menuExtractor] described batch of ${batch.length}, got ${descs.length} descriptions`);
      } catch (err) {
        console.error('[menuExtractor] description batch failed:', err);
        // Leave descriptions empty for this batch — items still usable
      }
    })
  );

  return descriptions;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Pass 1+2: images → structure extraction → parallel description generation.
 * Handles 200+ items without truncation or description loss.
 */
export async function extractMenuItemsFromImages(
  images: Array<{ buffer: Buffer; mime: string }>
): Promise<MenuItem[]> {
  if (images.length === 0) return [];

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // ── Pass 1: extract structure from all images in one GPT-4o call ─────────
  let rawItems: RawItem[] = [];
  try {
    const imageContent = images.map(({ buffer, mime }) => ({
      type: 'image_url' as const,
      image_url: {
        url: `data:${mime};base64,${buffer.toString('base64')}`,
        detail: 'high' as const,
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
            {
              type: 'text',
              text: 'Extract every menu item from all these images. Return the complete JSON.',
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 16000,
    });

    rawItems = parseRawItems(completion.choices[0]?.message?.content ?? '{}');
    console.log(`[menuExtractor] Pass 1 extracted ${rawItems.length} items from images`);
  } catch (err) {
    console.error('[menuExtractor] Pass 1 (image extraction) failed:', err);
    return [];
  }

  if (rawItems.length === 0) return [];

  // ── Pass 2: generate descriptions in parallel batches ───────────────────
  const descriptions = await generateDescriptions(openai, rawItems);
  console.log(`[menuExtractor] Pass 2 wrote ${descriptions.filter(Boolean).length}/${rawItems.length} descriptions`);

  return buildMenuItems(rawItems, descriptions);
}

/**
 * Pass 1+2: OCR text → structure extraction → parallel description generation.
 * Used as fallback when image extraction returns 0 items.
 */
export async function extractMenuItems(ocrText: string): Promise<MenuItem[]> {
  if (!ocrText.trim()) return [];

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // ── Pass 1: extract structure from aggregated OCR text ───────────────────
  let rawItems: RawItem[] = [];
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
        { role: 'user', content: `Menu OCR text:\n\n${ocrText}` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 16000,
    });

    rawItems = parseRawItems(completion.choices[0]?.message?.content ?? '{}');
    console.log(`[menuExtractor] Pass 1 (OCR) extracted ${rawItems.length} items`);
  } catch (err) {
    console.error('[menuExtractor] Pass 1 (OCR extraction) failed:', err);
    return [];
  }

  if (rawItems.length === 0) return [];

  // ── Pass 2: generate descriptions in parallel batches ───────────────────
  const descriptions = await generateDescriptions(openai, rawItems);
  console.log(`[menuExtractor] Pass 2 wrote ${descriptions.filter(Boolean).length}/${rawItems.length} descriptions`);

  return buildMenuItems(rawItems, descriptions);
}
