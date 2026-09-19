// src/lib/menu/menuExtractor.ts
//
// Menu photos → structured items, built to survive a burst of onboardings on a
// single small instance without losing items silently.
//
//   Pass 1 — EXTRACT, one call per photo (gpt-4o, detail:'high', compact tuples)
//     Each page is its own call, so a failure costs one page, not three, and
//     `max_tokens` can be sized to one page (2,500) instead of reserving 16,000
//     against the per-minute limit for ~3,000 actually used.
//
//     Per-page fallback ladder:
//       429 / 5xx / timeout → retry once on the same model (after retry-after)
//                           → gpt-4o-mini, a separate rate-limit pool
//       finish_reason "length" → one retry at 5,000 tokens
//                              → salvage every complete tuple from the cut JSON
//       anything else → the page is reported in `failedPages`; the rest survive
//
//   Pass 2 — DESCRIBE (gpt-4o-mini, parallel batches of 50)
//     Writes South Indian style descriptions per item. Keyword-library fallback
//     when a batch fails.
//
//   A scan has an output-token budget (45k): every page's first attempt fits,
//   and the long retries draw on what is left. Without it, an upload of dense
//   pages that all claim truncation could force a long retry on every page.
//
//   Every call goes through the process-wide token scheduler
//   (`openaiScheduler.ts`) and records its cost (`aiSpendGuard.ts`). The client
//   has an explicit timeout and no hidden SDK retries: retries are decided
//   here, where their cost is visible.
//
//   Post-processing (deterministic, no LLM):
//     • Dedup by (normalized_name, price), keeping same-name items that sit in
//       different non-empty sections
//     • Price sanity check (clamp impossibly large hallucinations)
//     • Description fallback: keyword match if Pass 2 returned empty

import OpenAI from 'openai';
import { matchByKeyword } from '@/lib/menu/defaultImages';
import { rateScheduler, SchedulerError } from '@/lib/menu/openaiScheduler';
import { recordAiUsage } from '@/lib/menu/aiSpendGuard';

import { logger } from '@/lib/platform/logger';

// ── Constants — env-overridable ──────────────────────────────────────────────

// INR. Was 10,000, which is a normal price for a catering tray, a party
// platter or a whole-goat biryani — and anything above it was rewritten to 0
// and published to a live public menu as a free item. The ceiling now marks
// genuinely impossible input (an OCR misread of a phone number, say) rather
// than an expensive real dish; SUSPICIOUS_PRICE still logs the grey zone.
const MAX_PRICE = 100_000;
const SUSPICIOUS_PRICE = 3_000;    // log a warning above this
const MAX_VARIANTS = 10;
const DESCRIBE_BATCH_SIZE = 50;
/** One dense page is ~100 tuples × ~22 tokens. Bigger pages take the retry. */
const PAGE_MAX_TOKENS = 2_500;
const PAGE_RETRY_MAX_TOKENS = 5_000;   // ~225 tuples: beyond any real page
/** Output tokens one scan may request across Pass 1: 15 pages × 2,500 + spare for retries. */
const SCAN_OUTPUT_BUDGET = 45_000;
/** Below this, a call cannot hold even a sparse page. */
const MIN_PAGE_TOKENS = 500;
const TEXT_MAX_TOKENS = 16_000;    // OCR-text path: a whole menu in one call
const PASS2_MAX_TOKENS = 8_000;
const OPENAI_TIMEOUT_MS = 45_000;
const DEFAULT_DEADLINE_MS = 50_000;

// Token estimates used to reserve rate-limit budget BEFORE a call. Deliberately
// on the high side: under-reserving is what produces 429s.
const EXTRACT_PROMPT_TOKENS = 450;
const DESCRIBE_PROMPT_TOKENS = 1_150;
/** Per image at detail:'high', 6 tiles. gpt-4o-mini bills images at ~33× the tokens. */
const IMAGE_TOKENS: Record<string, number> = { 'gpt-4o': 1_105, 'gpt-4o-mini': 36_835 };

const PRIMARY_MODEL = 'gpt-4o';
const FALLBACK_MODEL = 'gpt-4o-mini';

// ── Module-level singleton — reuses HTTPS connection across calls ────────────
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      // The SDK default is a 10-minute timeout and two silent retries. Under
      // load those retries fired into the same exhausted rate limit and their
      // cost was invisible here. Retries are decided by the ladder below.
      timeout: OPENAI_TIMEOUT_MS,
      maxRetries: 0,
    });
  }
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

export interface PageReport {
  /** 0-based position in the images passed in. */
  index: number;
  status: 'ok' | 'failed';
  items: number;
  /** Model that produced the result, e.g. "gpt-4o" or "gpt-4o-mini". */
  via?: string;
  /** Why a page failed: rate_limited | server_error | busy | circuit_open | rejected | truncated. */
  reason?: string;
}

export interface ExtractionReport {
  items: MenuItem[];
  pages: PageReport[];
  /** 0-based indexes of pages whose items could not be read. */
  failedPages: number[];
}

export interface ExtractOptions {
  signal?: AbortSignal;
  /** Epoch ms; queued calls not started by then are abandoned. Default: now + 50s. */
  deadline?: number;
  /** Account the spend is charged to, for the per-user daily cap. */
  spendKey?: string;
  /** Capacity promised to this scan at admission; drawn down as pages start. */
  claim?: CapacityClaim;
}

/** Tokens promised to admitted scans whose pages have not yet reached the scheduler. */
export interface CapacityClaim {
  consume(tokens: number): void;
  release(): void;
}

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Dedup key for an item name, across scripts.
 *
 * The previous implementation was `NFKD` + `/[^a-z0-9]+/`, an allow-list of
 * ASCII alphanumerics. That deletes every Tamil codepoint, so every Tamil name
 * normalised to the empty string and the dedup key degenerated to "|price" —
 * any two Tamil items sharing a price collided and one was silently dropped.
 * For a Tamil-first product that is the worst available failure: the shop
 * loses menu items and extraction still reports success.
 *
 * Inverted to a deny-list: strip whitespace and ASCII punctuation, keep every
 * letter and digit of every script. Written as explicit ASCII ranges rather
 * than \p{...} because tsconfig sets no `target`, so the /u flag is not
 * available here.
 */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s\x00-/:-@[-`{-~]+/g, '');
}

function clampPrice(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > MAX_PRICE) {
    console.warn(`[menuExtractor] price ${raw} exceeds MAX_PRICE ${MAX_PRICE} — clamping to 0 (probable hallucination)`);
    return 0; // Beyond this it is not an expensive dish, it is a misread number.

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

/**
 * Recover every complete element of the first array nested in an object from
 * JSON that was cut off mid-stream (`finish_reason: "length"`).
 *
 * `{"items":[["A",..],["B",..],["C",3` → [["A",..],["B",..]]. Tracks depth
 * outside strings; an element of the items array ends when depth returns to 2.
 */
function salvageItemsArray(raw: string): unknown[] {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let arrayStart = -1;
  let lastComplete = -1;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') {
      depth++;
      if (depth === 2 && ch === '[' && arrayStart < 0) arrayStart = i;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 2 && arrayStart >= 0) lastComplete = i + 1;
      if (depth < 2 && arrayStart >= 0) break;
    }
  }
  if (arrayStart < 0 || lastComplete < 0) return [];
  try {
    const arr = JSON.parse(`${raw.slice(arrayStart, lastComplete)}]`) as unknown;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function parseRawTuples(raw: string): Array<Omit<MenuItem, 'description'>> {
  let items: unknown[] = [];
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(parsed.items)) items = parsed.items;
    else {
      const key = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      if (key) items = parsed[key] as unknown[];
    }
  } catch {
    items = salvageItemsArray(raw);
    if (items.length > 0) {
      logger.warn(`[menuExtractor] salvaged ${items.length} items from truncated JSON`);
    } else {
      console.error('[menuExtractor] JSON parse failed and nothing could be salvaged');
    }
  }

  return items.map(tupleToItem).filter((i): i is Omit<MenuItem, 'description'> => i !== null);
}

// ── Deterministic dedup: same item appearing on multiple pages ───────────────

/**
 * Same name and price is the same dish — unless both copies carry a section
 * and the sections differ. South Indian menus name items relative to their
 * section ("Plain ₹60" under Dosa and again under Uthappam), and the previous
 * name|price key dropped one of them. A copy with no section (a cover page, a
 * specials board) still merges into the sectioned one.
 */
function dedupItems<T extends { name: string; price: number; category?: string }>(items: T[]): T[] {
  const byKey = new Map<string, T[]>();
  const out: T[] = [];
  const section = (c: string | undefined) => normalizeName(c ?? '');
  for (const item of items) {
    const key = `${normalizeName(item.name)}|${item.price}`;
    const seen = byKey.get(key) ?? [];
    const cat = section(item.category);
    const dup = seen.find(o => !section(o.category) || !cat || section(o.category) === cat);
    if (dup) {
      if (!section(dup.category) && cat) dup.category = item.category;
      continue;
    }
    seen.push(item);
    byKey.set(key, seen);
    out.push(item);
  }
  return out;
}

// ── One scheduled, metered model call ────────────────────────────────────────

type ChatParams = Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, 'model'>;

interface CallResult {
  content: string;
  finish: string | null;
}

interface CallContext {
  deadline: number;
  signal?: AbortSignal;
  spendKey?: string;
  claim?: CapacityClaim;
  /** Pass 1 output tokens this scan may still request. Shared by all its pages. */
  output: { remaining: number };
}

function httpStatus(err: unknown): number | undefined {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
}

function errorHeaders(err: unknown): Headers | Record<string, string> | undefined {
  return (err as { headers?: Headers | Record<string, string> } | null)?.headers;
}

/**
 * Worth one more try: 5xx, 408/409, and failures with no HTTP status at all
 * (timeouts, dropped connections). A 4xx with a status is the request's fault
 * and will not improve on retry.
 */
function isTransient(err: unknown): boolean {
  if (err instanceof SchedulerError) return false;
  const status = httpStatus(err);
  if (status === undefined) return true;
  return status >= 500 || status === 408 || status === 409;
}

async function callModel(model: string, params: ChatParams, reserveTokens: number, ctx: CallContext): Promise<CallResult> {
  const scheduler = rateScheduler();
  const lease = await scheduler.acquire(model, reserveTokens, { deadline: ctx.deadline, signal: ctx.signal });
  // Now counted by the scheduler itself; stop counting it as promised.
  if (model === PRIMARY_MODEL) ctx.claim?.consume(reserveTokens);
  try {
    const request = getOpenAI().chat.completions.create({ ...params, model }, { signal: ctx.signal });
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    if (typeof (request as { withResponse?: unknown }).withResponse === 'function') {
      const { data, response } = await request.withResponse();
      completion = data;
      scheduler.learn(model, response.headers);
    } else {
      completion = await request;
    }
    lease.ok();
    recordAiUsage(model, completion.usage, ctx.spendKey);
    const choice = completion.choices?.[0];
    return { content: choice?.message?.content ?? '{}', finish: choice?.finish_reason ?? null };
  } catch (err) {
    if (httpStatus(err) === 429) scheduler.rateLimited(model, errorHeaders(err));
    else if (isTransient(err)) lease.fail();
    throw err;
  }
}

function extractReserve(model: string, maxTokens: number): number {
  return EXTRACT_PROMPT_TOKENS + (IMAGE_TOKENS[model] ?? IMAGE_TOKENS[PRIMARY_MODEL]) + maxTokens;
}

// ── Pass 1: one page, with the fallback ladder ───────────────────────────────

interface PageResult {
  items: Array<Omit<MenuItem, 'description'>>;
  report: PageReport;
}

async function extractPage(
  image: { buffer: Buffer; mime: string },
  index: number,
  ctx: CallContext,
): Promise<PageResult> {
  const messages: ChatParams['messages'] = [
    { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.buffer.toString('base64')}`, detail: 'high' } },
        { type: 'text', text: 'Extract every menu item from this image. Use the compact tuple format.' },
      ],
    },
  ];

  let model = PRIMARY_MODEL;
  let maxTokens = PAGE_MAX_TOKENS;
  let retriedSameModel = false;
  let triedFallback = false;
  let triedLonger = false;
  let salvaged: Array<Omit<MenuItem, 'description'>> = [];

  const ok = (items: Array<Omit<MenuItem, 'description'>>): PageResult =>
    ({ items, report: { index, status: 'ok', items: items.length, via: model } });
  const failed = (reason: string): PageResult =>
    ({ items: [], report: { index, status: 'failed', items: 0, via: model, reason } });

  // Bounded: at most two calls per model plus one longer retry.
  for (let attempt = 0; attempt < 6; attempt++) {
    // Draw this call's output allowance from the scan's shared budget.
    const allowance = Math.min(maxTokens, ctx.output.remaining);
    if (allowance < MIN_PAGE_TOKENS) return salvaged.length > 0 ? ok(salvaged) : failed('budget');
    ctx.output.remaining -= allowance;
    try {
      const res = await callModel(
        model,
        { messages, response_format: { type: 'json_object' }, max_tokens: allowance },
        extractReserve(model, allowance),
        ctx,
      );
      const items = parseRawTuples(res.content);
      if (res.finish !== 'length') return ok(items);

      if (items.length > salvaged.length) salvaged = items;
      if (!triedLonger) {
        triedLonger = true;
        maxTokens = PAGE_RETRY_MAX_TOKENS;
        continue;
      }
      return salvaged.length > 0 ? ok(salvaged) : failed('truncated');
    } catch (err) {
      // No completion came back, so nothing was generated: give the allowance
      // back, or a burst of 429s would starve the scan's later pages.
      ctx.output.remaining += allowance;
      if (err instanceof SchedulerError) {
        if (err.code === 'CIRCUIT_OPEN' && !triedFallback) {
          triedFallback = true;
          model = FALLBACK_MODEL;
          retriedSameModel = false;
          continue;
        }
        return failed(err.code === 'SCHEDULER_TIMEOUT' ? 'busy' : err.code.toLowerCase());
      }
      const status = httpStatus(err);
      const retryable = status === 429 || isTransient(err);
      if (!retryable || ctx.signal?.aborted) return failed('rejected');
      if (!retriedSameModel) { retriedSameModel = true; continue; }
      if (!triedFallback) {
        triedFallback = true;
        model = FALLBACK_MODEL;
        retriedSameModel = false;
        continue;
      }
      return failed(status === 429 ? 'rate_limited' : 'server_error');
    }
  }
  return salvaged.length > 0 ? ok(salvaged) : failed('exhausted');
}

// ── Pass 2: parallel batched description generation ─────────────────────────

async function generateDescriptions(
  items: Array<Omit<MenuItem, 'description'>>,
  ctx: CallContext,
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
    const userText = `Write descriptions for these ${payload.length} items:\n\n${JSON.stringify(payload)}`;

    try {
      const res = await callModel(
        FALLBACK_MODEL,
        {
          messages: [
            { role: 'system', content: DESCRIBE_SYSTEM_PROMPT },
            { role: 'user', content: userText },
          ],
          response_format: { type: 'json_object' },
          max_tokens: PASS2_MAX_TOKENS,
        },
        DESCRIBE_PROMPT_TOKENS + Math.ceil(userText.length / 4) + PASS2_MAX_TOKENS,
        ctx,
      );

      const parsed = JSON.parse(res.content) as Record<string, unknown>;
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

function contextFrom(opts: ExtractOptions): CallContext {
  return {
    deadline: opts.deadline ?? Date.now() + DEFAULT_DEADLINE_MS,
    signal: opts.signal,
    spendKey: opts.spendKey,
    claim: opts.claim,
    output: { remaining: SCAN_OUTPUT_BUDGET },
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

let promisedTokens = 0;

/**
 * Promise capacity to a scan the moment it is admitted.
 *
 * Between admission and its pages reaching the scheduler, a scan reads its
 * body and validates photos — long enough for a crowd arriving together to
 * all see an idle budget and all be admitted, then time out in the queue.
 * Claimed tokens count against the next admission decision until the pages
 * take them over (`consume`) or the scan ends (`release`).
 */
export function claimExtractionCapacity(pages: number): CapacityClaim {
  let left = pages * extractReserve(PRIMARY_MODEL, PAGE_MAX_TOKENS);
  promisedTokens += left;
  return {
    consume(tokens) {
      const d = Math.min(left, tokens);
      left -= d;
      promisedTokens -= d;
    },
    release() {
      promisedTokens -= left;
      left = 0;
    },
  };
}

/**
 * How long a scan of `pages` photos would wait for rate-limit budget if it
 * started now, behind everything reserved, queued and promised. Zero when the
 * model lane is idle: a scan bigger than a whole window is still admitted then
 * (its late pages are reported, not hidden), because refusing it would refuse
 * it forever.
 */
export function extractionQueueWaitMs(pages: number): number {
  const scheduler = rateScheduler();
  const st = scheduler.stats(PRIMARY_MODEL);
  if (st.reservedTokens === 0 && st.queuedTokens === 0 && promisedTokens === 0) return 0;
  return scheduler.projectedWaitMs(PRIMARY_MODEL, pages * extractReserve(PRIMARY_MODEL, PAGE_MAX_TOKENS) + promisedTokens);
}

/**
 * Pass 1+2 with a per-page report: images → one scheduled call per page
 * (fallback ladder) → dedup → descriptions.
 *
 * Pages run concurrently; the scheduler, not this function, decides how many
 * are in flight, so a burst of users queues instead of tripping the rate limit.
 */
export async function extractMenuPages(
  images: Array<{ buffer: Buffer; mime: string }>,
  opts: ExtractOptions = {},
): Promise<ExtractionReport> {
  if (images.length === 0) return { items: [], pages: [], failedPages: [] };
  const ctx = contextFrom(opts);
  const t0 = Date.now();

  const results = await Promise.all(images.map((img, i) => extractPage(img, i, ctx)));
  const pages = results.map(r => r.report);
  const failedPages = pages.filter(p => p.status === 'failed').map(p => p.index);
  const rawTuples = results.flatMap(r => r.items);

  logger.debug(`[menuExtractor] Pass 1: ${rawTuples.length} items from ${images.length} pages (${failedPages.length} failed) in ${Date.now() - t0}ms`);
  if (failedPages.length > 0) {
    logger.warn(`[menuExtractor] ${failedPages.length}/${images.length} pages failed: ${pages.filter(p => p.status === 'failed').map(p => p.reason).join(',')}`);
  }
  if (rawTuples.length === 0) return { items: [], pages, failedPages };

  // Dedup before Pass 2 (don't waste tokens describing the same item twice)
  const deduped = dedupItems(rawTuples);
  if (deduped.length < rawTuples.length) {
    logger.debug(`[menuExtractor] dedup: ${rawTuples.length} → ${deduped.length}`);
  }

  const t1 = Date.now();
  const descriptions = await generateDescriptions(deduped, ctx);
  logger.debug(`[menuExtractor] Pass 2 (descriptions): ${descriptions.filter(Boolean).length}/${deduped.length} in ${Date.now() - t1}ms`);

  return {
    items: deduped.map((item, idx) => ({ ...item, description: descriptions[idx] })),
    pages,
    failedPages,
  };
}

/** Items only — for callers that do not report per-page outcomes (bulk import). */
export async function extractMenuItemsFromImages(
  images: Array<{ buffer: Buffer; mime: string }>,
  opts: ExtractOptions = {},
): Promise<MenuItem[]> {
  return (await extractMenuPages(images, opts)).items;
}

/**
 * OCR text fallback path. Same structure as the image path — used by bulk
 * import when the image path returns 0 items.
 */
export async function extractMenuItems(ocrText: string, opts: ExtractOptions = {}): Promise<MenuItem[]> {
  if (!ocrText.trim()) return [];
  const ctx = contextFrom(opts);
  const userText = `Menu OCR text:\n\n${ocrText}`;

  let rawTuples: Array<Omit<MenuItem, 'description'>> = [];
  try {
    const res = await callModel(
      PRIMARY_MODEL,
      {
        messages: [
          { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
          { role: 'user', content: userText },
        ],
        response_format: { type: 'json_object' },
        max_tokens: TEXT_MAX_TOKENS,
      },
      EXTRACT_PROMPT_TOKENS + Math.ceil(userText.length / 4) + TEXT_MAX_TOKENS,
      ctx,
    );
    rawTuples = parseRawTuples(res.content);
    logger.debug(`[menuExtractor] Pass 1 (OCR): ${rawTuples.length} items`);
  } catch (err) {
    console.error('[menuExtractor] Pass 1 (OCR extraction) failed:', err);
    return [];
  }

  if (rawTuples.length === 0) return [];

  const deduped = dedupItems(rawTuples);
  const descriptions = await generateDescriptions(deduped, ctx);
  return deduped.map((item, idx) => ({ ...item, description: descriptions[idx] }));
}
