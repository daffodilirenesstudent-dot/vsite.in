// src/lib/menuExtractor.ts
// Takes aggregated OCR text from menu photos and returns structured menu items.
// Uses OpenAI GPT-4o-mini with a structured JSON prompt.

import OpenAI from 'openai';


export interface MenuItemVariant {
  size: string;   // e.g. "Full", "Half", "250ml", "Small", "Large"
  price: number;  // price in INR for this size
}

export interface MenuItem {
  name: string;
  price: number;               // for single: actual price. for variant: lowest variant price
  description: string;
  category: string;
  item_type: 'single' | 'variant' | 'combo';
  food_type: 'veg' | 'non_veg' | 'unknown';
  variants?: MenuItemVariant[]; // populated when item_type === 'variant'
}

const SYSTEM_PROMPT = `You are a menu parser for Indian cafes and restaurants. Given raw OCR text from one or more menu photos (possibly in Hindi, Tamil, Telugu, Kannada, Malayalam, English, or mixed scripts), extract every menu item.

Return a JSON object with a single key "items" whose value is an array of menu items.
Example format: { "items": [ { "name": "...", ... } ] }

Each element must match this shape exactly:
{
  "name": "Item name in English (transliterate if needed)",
  "price": 120,
  "description": "One concise line describing the item",
  "category": "Main Dishes",
  "item_type": "single",
  "food_type": "veg",
  "variants": []
}

Field rules:

name:
- Translate to standard English (e.g. "பணியாரம்" → "Paniyaram")
- Transliterate regional names to English

price:
- For single items: the item price as a number in INR
- For variant items: use the LOWEST variant price (e.g. if Half=160, Full=360 → price=160)
- Use 0 only if no price is visible at all

description:
- The format depends on item_type:

  SINGLE items: Write 4 lines (use " | " as line separator) describing the dish.
    Line 1: What the dish is made of or how it is prepared (e.g. "Crispy dosa made with fermented rice batter")
    Line 2: Taste or texture highlight (e.g. "Golden and crunchy outside, soft inside")
    Line 3: Best enjoyed with / serving suggestion (e.g. "Served with sambar and fresh coconut chutney")
    Line 4: Any additional information about the dish (e.g. "Perfect for a light snack or breakfast")
    Example: "Crispy dosa made with fermented rice batter | Golden and crunchy outside, soft inside | Served with sambar and fresh coconut chutney | Perfect for a light snack or breakfast"

  VARIANT items: Write the size-price pairs first, then add a brief 1-line dish description after " || " (double pipe separator).
    Format: "SizeLabel - ₹Price | SizeLabel - ₹Price || One-line dish description"
    Example for Full=360, Half=160  → description: "Full - ₹360 | Half - ₹160 || Juicy grilled chicken marinated in spices, served with mint chutney"
    Example for 250ml=100, 100ml=50 → description: "250ml - ₹100 | 100ml - ₹50 || Freshly squeezed lemon juice served chilled with mint"
    Use the EXACT same size labels you put in the variants array.
    The dish description after " || " must be a single concise line (no sub-pipes within it).

  COMBO items: Write 4-5 lines (use " | " as line separator) listing what is included, in simple everyday English suited for South Indian food.
    Line 1: Main item(s) in the combo
    Line 2: Side(s) included
    Line 3: Drink or dessert (if any), or extra benefit
    Line 4 (optional): Value or serving note
    Example: "Rice, sambar, rasam and 2 curries | Served with papad, pickle and salad | Includes a sweet pongal or payasam | Great value meal for one"

category:
- The section heading this item falls under (e.g. "Main Dishes", "Beverages", "Sweets", "Snacks")
- Use the exact heading text from the menu. If no section heading is present, use ""

item_type:
- "variant" — item appears in multiple sizes/portions/flavours with DIFFERENT prices
  Examples: Small/Medium/Large, Full/Half, 250ml/100ml, Regular/Premium, Big/Small
  IMPORTANT: When item_type is "variant", you MUST populate the "variants" array
- "combo"   — meal deal, set meal, or bundled offer (e.g. "Combo 1: Burger + Fries + Drink")
- "single"  — single price, no size options

variants:
- REQUIRED when item_type is "variant", empty array [] otherwise
- Each variant: { "size": "Full", "price": 360 }
- Size labels: use the exact label from the menu (Full, Half, Small, Large, 250ml, 100ml, Big, Small Size, Regular, Premium, etc.)
- Extract ALL sizes listed for that item
- Example for "Grill Chicken full 360₹ half 160₹":
  "variants": [{ "size": "Full", "price": 360 }, { "size": "Half", "price": 160 }]
- Example for "Lemon Juice 250ml 100₹ 100ml 50₹":
  "variants": [{ "size": "250ml", "price": 100 }, { "size": "100ml", "price": 50 }]

food_type:
- "veg"     — vegetarian (infer from item name, green dot symbol, or common knowledge)
- "non_veg" — contains meat, chicken, fish, egg (infer from name or red dot symbol)
- "unknown" — genuinely unsure

Other rules:
- Remove duplicates; keep only food/drink items (skip phone numbers, addresses, taglines)
- If there are no recognisable menu items, return { "items": [] }
- Do NOT merge variants into separate items — one product = one entry with variants array`;

/**
 * Sends up to 10 menu images directly to GPT-4o in a single API call and
 * returns structured menu items. This is the fast path — one round trip
 * instead of N OCR calls + 1 extraction call, and more accurate because
 * GPT-4o sees visual cues (coloured dots, section header styling, price layout).
 */
export async function extractMenuItemsFromImages(
  images: Array<{ buffer: Buffer; mime: string }>
): Promise<MenuItem[]> {
  if (images.length === 0) return [];

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text',
              text: 'These are menu photos. Extract every menu item from all images combined. Return the JSON object as described.',
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 16000,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    console.log('[menuExtractor] direct-image response:', raw.slice(0, 500));
    return parseItemsFromRaw(raw);
  } catch (err) {
    console.error('[menuExtractor] extractMenuItemsFromImages failed:', err);
    return [];
  }
}

function parseItemsFromRaw(raw: string): MenuItem[] {
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  let items: unknown[] = [];
  if (Array.isArray(parsed.items)) {
    items = parsed.items as unknown[];
  } else {
    const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
    if (arrayKey) items = parsed[arrayKey] as unknown[];
  }
  console.log(`[menuExtractor] found ${items.length} raw items`);

  return items
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .filter(i => typeof i.name === 'string' && (i.name as string).trim().length > 0)
    .map(i => {
      const item_type = (['single', 'variant', 'combo'] as const).includes(
        i.item_type as 'single' | 'variant' | 'combo'
      )
        ? (i.item_type as MenuItem['item_type'])
        : 'single';

      const rawVariants = Array.isArray(i.variants) ? (i.variants as unknown[]) : [];
      const variants: MenuItemVariant[] = rawVariants
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
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
        description: String(i.description ?? '').trim(),
        category: String(i.category ?? '').trim(),
        item_type,
        food_type: (['veg', 'non_veg', 'unknown'] as const).includes(
          i.food_type as 'veg' | 'non_veg' | 'unknown'
        )
          ? (i.food_type as MenuItem['food_type'])
          : 'unknown',
        variants: item_type === 'variant' && variants.length > 0 ? variants : undefined,
      };
    });
}

/**
 * Parses aggregated OCR text into structured menu items.
 * Returns an empty array on failure.
 */
export async function extractMenuItems(ocrText: string): Promise<MenuItem[]> {
  if (!ocrText.trim()) return [];

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Menu OCR text:\n\n${ocrText}` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 16000,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    console.log('[menuExtractor] raw response:', raw.slice(0, 500));
    return parseItemsFromRaw(raw);
  } catch (err) {
    console.error('[menuExtractor] Failed to extract items:', err);
    return [];
  }
}
