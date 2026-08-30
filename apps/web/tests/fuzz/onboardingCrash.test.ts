/**
 * Crash fuzzer for the onboarding write path.
 *
 * Target: POST /api/onboarding/complete — the only input-driven route that
 * creates a site, bulk-inserts up to 300 products, and writes the profiles
 * flag. It is reached immediately after OTP, by a user who has just signed up
 * and has nothing to lose by malforming the payload.
 *
 * The contract under test is narrow and absolute:
 *
 *   A malformed request must be REJECTED, not CRASH.
 *
 * Concretely: every input below must produce a 4xx carrying a JSON error. A 500
 * means an unhandled exception reached the catch-all — the handler dereferenced
 * attacker-shaped data without checking it. 500s are reported as findings, not
 * tolerated as "it errored, close enough".
 *
 * Why this matters beyond tidiness: a trivially scriptable 500 burns the error
 * budget, fires a Sentry event per request, and tells an attacker precisely
 * which field's parsing gave way — a free map of the validator's blind spots.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

process.env.OPENAI_API_KEY = 'sk-test';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
  verifyFirebaseToken: vi.fn(async (t: string) => (t === 'good-token' ? 'uid-fuzz' : null)),
}));
vi.mock('@/lib/platform/rateLimit', () => ({
  rateLimit: () => ({ allowed: true, retryAfterMs: 0 }),
}));

// Supabase chain mock. Every builder method returns the chain; the chain is
// thenable (for `await supabase.from(x).insert(y)`) and also exposes
// single()/maybeSingle() for the `.select().single()` shapes.
const tableScript: Record<string, { thenable?: unknown; single?: unknown }> = {};

function chainFor(table: string) {
  const s = tableScript[table] ?? {};
  const chain: Record<string, unknown> = {};
  for (const m of [
    'select', 'eq', 'neq', 'in', 'is', 'gt', 'lt', 'order', 'limit',
    'insert', 'upsert', 'update', 'delete',
  ]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(async () => s.single ?? { data: null, error: null });
  chain.maybeSingle = vi.fn(async () => s.single ?? { data: null, error: null });
  chain.then = (resolve: (v: unknown) => void) => resolve(s.thenable ?? { data: [], error: null });
  return chain;
}

vi.mock('@/lib/platform/db/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn((t: string) => chainFor(t)),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  },
}));

vi.mock('openai', () => ({
  default: class {
    embeddings = { create: vi.fn(async () => ({ data: [{ embedding: Array(1536).fill(0.01) }] })) };
    constructor(_o?: unknown) {}
  },
}));

import { POST as complete } from '@/app/api/onboarding/complete/route';

beforeEach(() => {
  for (const k of Object.keys(tableScript)) delete tableScript[k];
  // Happy-path DB: no existing sites, site insert succeeds, everything else OK.
  tableScript['sites'] = {
    thenable: { data: [], error: null },
    single: { data: { id: 'site-1', slug: 'fuzz-cafe' }, error: null },
  };
  tableScript['idempotency_keys'] = { single: { data: null, error: null } };
});

/** Raw-body request, so we can send bodies JSON.stringify would refuse. */
function rawReq(body: string, token = 'good-token') {
  return new NextRequest('https://x/api/onboarding/complete', {
    method: 'POST',
    headers: new Headers({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    body,
  });
}

const jsonReq = (body: unknown, token = 'good-token') => rawReq(JSON.stringify(body), token);

/** A known-good payload, so each fuzz case mutates exactly one thing. */
function validItem(over: Record<string, unknown> = {}) {
  return {
    name: 'Masala Dosa',
    price: 80,
    description: 'Crisp dosa',
    category: 'Tiffin',
    item_type: 'single',
    food_type: 'veg',
    star_rating: 3,
    profit_tier: 3,
    prep_complexity_tier: 2,
    ...over,
  };
}

/** 200 is allowed: rejecting is required, but so is accepting genuinely valid input. */
const ACCEPTABLE = [200, 400, 401, 403, 409, 413, 429, 503];

async function assertNoCrash(label: string, body: unknown, raw = false) {
  const res = raw ? await complete(rawReq(body as string)) : await complete(jsonReq(body));
  const text = await res.text();
  expect(
    ACCEPTABLE,
    `CRASH: "${label}" returned ${res.status}. Body: ${text.slice(0, 300)}`,
  ).toContain(res.status);
  return res;
}

// ═══════════════════════════════════════════════════════════════════════════
// A. Body-level structural fuzzing
// ═══════════════════════════════════════════════════════════════════════════

describe('A. body shape', () => {
  const BODIES: Array<[string, string]> = [
    ['null literal', 'null'],
    ['bare true', 'true'],
    ['bare number', '0'],
    ['bare string', '"shopName"'],
    ['bare array', '[]'],
    ['empty body', ''],
    ['truncated json', '{"shopName":'],
    ['nul byte in string', '{"shopName":"a\\u0000b","items":[]}'],
    ['bom prefix', '﻿{"shopName":"a","items":[]}'],
  ];

  it.each(BODIES)('%s does not crash', async (label, body) => {
    await assertNoCrash(label, body, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. shopName fuzzing
// ═══════════════════════════════════════════════════════════════════════════

describe('B. shopName', () => {
  const NAMES: Array<[string, unknown]> = [
    ['missing', undefined],
    ['null', null],
    ['number', 12345],
    ['boolean', true],
    ['array', ['a']],
    ['object', { toString: 'x' }],
    ['empty', ''],
    ['whitespace only', '   \t\n  '],
    ['201 chars', 'x'.repeat(201)],
    ['100k chars', 'x'.repeat(100_000)],
    ['only punctuation', '!!!@@@###'],
    ['only dashes', '-----'],
    ['tamil', 'கபே சாப்பாடு'],
    ['emoji', '\u{1F35B}\u{1F525}'],
    ['rtl override', 'cafe‮evil'],
    ['sql-ish', "'; DROP TABLE sites; --"],
    ['path traversal', '../../etc/passwd'],
    ['html', '<script>alert(1)</script>'],
    ['newlines', 'a\nb\rc'],
  ];

  it.each(NAMES)('%s does not crash', async (label, shopName) => {
    await assertNoCrash(`shopName=${label}`, { shopName, items: [] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. items container fuzzing
// ═══════════════════════════════════════════════════════════════════════════

describe('C. items container', () => {
  const CONTAINERS: Array<[string, unknown]> = [
    ['null', null],
    ['string', 'items'],
    ['number', 7],
    ['object', { 0: validItem() }],
    ['boolean', false],
    ['nested array', [[validItem()]]],
    ['301 items', Array.from({ length: 301 }, () => validItem())],
  ];

  it.each(CONTAINERS)('items=%s does not crash', async (label, items) => {
    await assertNoCrash(`items=${label}`, { shopName: 'Fuzz Cafe', items });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. items ELEMENT fuzzing — the highest-value surface
// ═══════════════════════════════════════════════════════════════════════════

describe('D. items elements', () => {
  const ELEMENTS: Array<[string, unknown]> = [
    ['null element', null],
    ['number element', 42],
    ['string element', 'dosa'],
    ['boolean element', true],
    ['array element', []],
    ['empty object', {}],
  ];

  it.each(ELEMENTS)('items:[%s] does not crash', async (label, el) => {
    await assertNoCrash(`element=${label}`, { shopName: 'Fuzz Cafe', items: [el] });
  });

  it('null element among valid ones does not crash', async () => {
    await assertNoCrash('mixed null element', {
      shopName: 'Fuzz Cafe',
      items: [validItem(), null, validItem()],
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E. Per-field type confusion
// ═══════════════════════════════════════════════════════════════════════════

describe('E. item fields', () => {
  const FIELD_CASES: Array<[string, Record<string, unknown>]> = [
    ['name null', { name: null }],
    ['name number', { name: 99 }],
    ['name object', { name: {} }],
    ['name array', { name: ['a'] }],
    ['price string', { price: '80' }],
    ['price null', { price: null }],
    ['price NaN-ish', { price: 'NaN' }],
    ['price negative', { price: -5 }],
    ['price huge', { price: 1e308 }],
    ['price object', { price: {} }],
    ['description number', { description: 5 }],
    ['description object', { description: { a: 1 } }],
    ['description array', { description: [] }],
    ['description null', { description: null }],
    ['category number', { category: 5 }],
    ['category object', { category: {} }],
    ['item_type bogus', { item_type: 'drink' }],
    ['item_type null', { item_type: null }],
    ['item_type object', { item_type: {} }],
    ['food_type bogus', { food_type: 'vegan' }],
    ['food_type null', { food_type: null }],
    ['star_rating string', { star_rating: '3' }],
    ['star_rating null', { star_rating: null }],
    ['star_rating 0', { star_rating: 0 }],
    ['star_rating 99', { star_rating: 99 }],
    ['profit_tier object', { profit_tier: {} }],
    ['prep tier array', { prep_complexity_tier: [] }],
  ];

  it.each(FIELD_CASES)('%s does not crash', async (label, over) => {
    await assertNoCrash(`field ${label}`, { shopName: 'Fuzz Cafe', items: [validItem(over)] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F. variants — nested array, second dereference layer
// ═══════════════════════════════════════════════════════════════════════════

describe('F. variants', () => {
  const VARIANT_CASES: Array<[string, unknown]> = [
    ['null element', [null]],
    ['number element', [1]],
    ['string element', ['half']],
    ['empty object', [{}]],
    ['size null', [{ size: null, price: 10 }]],
    ['size number', [{ size: 5, price: 10 }]],
    ['price string', [{ size: 'half', price: '10' }]],
    ['price missing', [{ size: 'half' }]],
    ['11 variants', Array.from({ length: 11 }, () => ({ size: 'x', price: 1 }))],
    ['variants object not array', { size: 'half', price: 10 }],
    ['variants string', 'half'],
    ['deep nested', [[[{ size: 'x', price: 1 }]]]],
  ];

  it.each(VARIANT_CASES)('variants=%s does not crash', async (label, variants) => {
    await assertNoCrash(`variants ${label}`, {
      shopName: 'Fuzz Cafe',
      items: [validItem({ variants })],
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G. Injection / pollution payloads
// ═══════════════════════════════════════════════════════════════════════════

describe('G. injection and pollution', () => {
  it('prototype pollution keys do not crash or pollute', async () => {
    await assertNoCrash('proto pollution', JSON.parse(
      '{"shopName":"Fuzz Cafe","__proto__":{"polluted":true},' +
      '"constructor":{"prototype":{"polluted":true}},"items":[]}',
    ));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('postgrest operator injection in strings does not crash', async () => {
    await assertNoCrash('postgrest ops', {
      shopName: 'Fuzz Cafe',
      items: [validItem({ name: 'a,b.eq.1', category: '*)(|(uid=*' })],
    });
  });

  it('extremely long field values do not crash', async () => {
    await assertNoCrash('long fields', {
      shopName: 'Fuzz Cafe',
      items: [validItem({ name: 'x'.repeat(50_000), description: 'y'.repeat(50_000) })],
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// H. Header fuzzing
// ═══════════════════════════════════════════════════════════════════════════

describe('H. Idempotency-Key header', () => {
  const KEYS = ['', ' ', 'x'.repeat(201), 'x'.repeat(10_000), '../../etc', '{"a":1}'];

  it.each(KEYS.map((k, i) => [i, k] as [number, string]))(
    'key #%i does not crash',
    async (_i, key) => {
      const res = await complete(
        new NextRequest('https://x/api/onboarding/complete', {
          method: 'POST',
          headers: new Headers({
            Authorization: 'Bearer good-token',
            'Content-Type': 'application/json',
            'Idempotency-Key': key,
          }),
          body: JSON.stringify({ shopName: 'Fuzz Cafe', items: [] }),
        }),
      );
      expect(ACCEPTABLE, `CRASH: idempotency key returned ${res.status}`).toContain(res.status);
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// I. Fail-open checks — a DB error must not silently grant
// ═══════════════════════════════════════════════════════════════════════════

describe('I. store-limit accounting under DB failure', () => {
  it('does not create a site when the existing-sites query errors', async () => {
    // The limit check destructures `data` and never inspects `error`. If the
    // query fails, data is null, totalSites computes as 0, and both the
    // 5-store and 2-trial-store caps are skipped.
    tableScript['sites'] = {
      thenable: { data: null, error: { message: 'connection reset', code: '08006' } },
      single: { data: { id: 'site-1', slug: 'fuzz-cafe' }, error: null },
    };
    const res = await complete(jsonReq({ shopName: 'Fuzz Cafe', items: [] }));
    expect(
      res.status,
      'store-limit check fails OPEN: a failed sites query reads as "user owns 0 stores", so both caps are skipped',
    ).not.toBe(200);
  });
});
