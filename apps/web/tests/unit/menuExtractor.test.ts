/**
 * First tests for the menu extractor.
 *
 * This module is the product's headline feature — "photograph your paper menu
 * and we build it for you" — and until now it had no test of its own. It is
 * referenced in tests/api/routes.test.ts only to be mocked away, so nothing
 * ever exercised the parsing, dedup or price-normalisation logic that decides
 * what a shop's menu actually says.
 *
 * These tests drive the real `extractMenuItems` with a stubbed OpenAI client,
 * so the model is deterministic and the code under test is ours: tuple
 * parsing, dedup, and clamping.
 *
 * Two failures below are real data-loss defects, not style issues. See the
 * comments on each.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.OPENAI_API_KEY = 'sk-test';

vi.mock('server-only', () => ({}));

/** Pass 1 returns tuples; pass 2 returns descriptions. Queued per call. */
const completions: string[] = [];
const createMock = vi.fn(async () => ({
  choices: [{ message: { content: completions.shift() ?? '{"items":[]}' } }],
}));

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: createMock } };
    constructor(_o?: unknown) {}
  },
}));

import { extractMenuItems } from '@/lib/menu/menuExtractor';

/** Queue a pass-1 tuple response followed by an empty pass-2 description set. */
function queue(items: unknown[]) {
  completions.length = 0;
  completions.push(JSON.stringify({ items }));
  // generateDescriptions runs in parallel batches; an empty object is a valid
  // "no descriptions" reply and leaves names/prices untouched.
  for (let i = 0; i < 8; i++) completions.push('{"descriptions":[]}');
}

beforeEach(() => {
  createMock.mockClear();
  completions.length = 0;
});

// Tuple shape: [name, price, category, typeChar, foodChar, variants]

describe('tuple parsing', () => {
  it('extracts a plain item', async () => {
    queue([['Masala Dosa', 80, 'Tiffin', 's', 'v']]);
    const items = await extractMenuItems('menu text');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Masala Dosa', price: 80, food_type: 'veg' });
  });

  it('drops rows with no usable name instead of inventing one', async () => {
    queue([['', 80, 'Tiffin', 's', 'v'], [null, 20, 'x', 's', 'v']]);
    expect(await extractMenuItems('menu text')).toHaveLength(0);
  });

  it('takes the cheapest variant price when a variant item has no base price', async () => {
    queue([['Biryani', 0, 'Rice', 'v', 'n', [['Half', 120], ['Full', 220]]]]);
    const items = await extractMenuItems('menu text');
    expect(items[0].price).toBe(120);
  });
});

describe('price normalisation', () => {
  it('zeroes a negative price', async () => {
    queue([['Tea', -10, 'Drinks', 's', 'v']]);
    expect((await extractMenuItems('t'))[0].price).toBe(0);
  });

  it('keeps a legitimately expensive item priced', async () => {
    // FINDING: clampPrice turns anything above MAX_PRICE (10,000) into 0
    // rather than flagging it, on the assumption it is a hallucination. A real
    // catering tray, party platter or whole-goat biryani above ₹10,000 is
    // therefore published to the public menu at ₹0 — a free item on a live
    // storefront, with only a server-side console.warn to say so.
    queue([['Party Catering Tray (50 pax)', 12_000, 'Catering', 's', 'v']]);
    const items = await extractMenuItems('t');
    expect(items).toHaveLength(1);
    expect(
      items[0].price,
      'an over-cap price is silently published as ₹0 instead of being flagged for review',
    ).not.toBe(0);
  });
});

describe('dedup', () => {
  it('collapses the same item repeated across pages', async () => {
    queue([
      ['Masala Dosa', 80, 'Tiffin', 's', 'v'],
      ['masala  dosa', 80, 'Tiffin', 's', 'v'],
    ]);
    expect(await extractMenuItems('t')).toHaveLength(1);
  });

  it('keeps two DIFFERENT items that happen to share a price', async () => {
    queue([
      ['Idli', 30, 'Tiffin', 's', 'v'],
      ['Vadai', 30, 'Tiffin', 's', 'v'],
    ]);
    expect(await extractMenuItems('t')).toHaveLength(2);
  });

  it('keeps two different TAMIL items that share a price', async () => {
    // FINDING: the dedup key is `normalizeName(name)|price`, and
    // normalizeName is NFKD + /[^a-z0-9]+/ — which deletes every Tamil
    // codepoint. Every Tamil name normalises to the empty string, so the key
    // degenerates to "|price" and any two Tamil items at the same price
    // collide. One is dropped silently.
    //
    // This is the worst possible failure for a Tamil-first product: a shop
    // that photographs a Tamil menu loses items, and the loss is invisible
    // because the extractor reports success.
    queue([
      ['இட்லி', 30, 'டிபன்', 's', 'v'],
      ['வடை', 30, 'டிபன்', 's', 'v'],
    ]);
    const items = await extractMenuItems('t');
    expect(
      items.map(i => i.name),
      'two distinct Tamil items at the same price collapse into one',
    ).toHaveLength(2);
  });
});
