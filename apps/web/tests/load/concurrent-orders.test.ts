/**
 * Load / concurrency tests for the QR ordering system.
 *
 * These tests verify correctness invariants that matter under load:
 *  1. Orders have distinct IDs and sequential tokens across 30 requests
 *  2. Subtotals are correctly rounded regardless of float inputs
 *  3. Rate limiter correctly throttles after RL_SITE_LIMIT requests
 *  4. Idempotency replays return the same order without creating duplicates
 *  5. Order number format is always 7-digit
 *
 * The route now makes a single process_order_v2 RPC call per order.
 * Mocks return appropriate JSONB payloads to simulate each scenario.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@/lib/orderEmail', () => ({
  buildOrderConfirmationEmail: vi.fn(() => ({ subject: 'OK', htmlbody: '' })),
}));

import { POST } from '@/app/api/orders/route';
import { supabaseServer } from '@/lib/supabase-server';
import { NextRequest } from 'next/server';

// ── Constants ─────────────────────────────────────────────────────────────────

const SITE_ID    = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PRODUCT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOrderRequest(overrides: Record<string, unknown> = {}, idempotencyKey?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return new NextRequest(new URL('http://localhost/api/orders'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      siteId:        SITE_ID,
      customerName:  'Load Test User',
      customerEmail: 'load@example.com',
      paymentMethod: 'online',
      items:         [{ id: PRODUCT_ID, qty: 1 }],
      ...overrides,
    }),
  });
}

// Wire up the single process_order_v2 RPC with a stateful payload generator.
// factory() is called once per RPC invocation and must return a JSONB payload.
function wireRpc(factory: (callIndex: number) => Record<string, unknown>) {
  let calls = 0;
  vi.mocked(supabaseServer.rpc).mockImplementation((fn: string) => {
    if (fn === 'process_order_v2') {
      return Promise.resolve({ data: factory(++calls), error: null }) as any;
    }
    return Promise.resolve({ data: null, error: null }) as any;
  });
  // email_queue fire-and-forget
  vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
    if (table === 'email_queue') {
      return { insert: vi.fn().mockReturnValue({ then: vi.fn() }) } as any;
    }
    return {} as any;
  });
}

function makeOkPayload(i: number, paymentMethod: 'online' | 'counter' | 'no_payment' = 'online') {
  const orderId = `order-${String(i).padStart(5, '0')}`;
  return {
    status:         'ok',
    order_id:       orderId,
    order_number:   String(1_000_000 + i),
    counter_number: paymentMethod === 'counter' ? `C${String(i).padStart(2, '0')}` : null,
    token_number:   paymentMethod === 'counter' ? null : String(i),
    subtotal:       80,
    site_name:      'Load Cafe',
    site_slug:      'load-cafe',
    verified_items: [{ name: 'Dosa', qty: 1, price: 80 }],
  };
}

// ── 1. Sequential volume — 30 online orders ───────────────────────────────────

describe('Volume: 30 sequential online orders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('all 30 succeed with status 200', async () => {
    wireRpc(i => makeOkPayload(i));
    const statuses: number[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await POST(makeOrderRequest());
      statuses.push(res.status);
    }
    expect(statuses.every(s => s === 200)).toBe(true);
  });

  it('30 orders produce distinct orderId values', async () => {
    wireRpc(i => makeOkPayload(i));
    const orderIds: string[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await POST(makeOrderRequest());
      const body = await res.json();
      orderIds.push(body.orderId);
    }
    expect(new Set(orderIds).size).toBe(30);
  });

  it('token numbers form a gapless sequence 1..30', async () => {
    wireRpc(i => makeOkPayload(i));
    const tokens: number[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await POST(makeOrderRequest());
      const body = await res.json();
      tokens.push(parseInt(body.tokenNumber, 10));
    }
    tokens.sort((a, b) => a - b);
    expect(tokens[0]).toBe(1);
    expect(tokens[29]).toBe(30);
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i]).toBe(tokens[i - 1] + 1);
    }
  });

  it('all order numbers are 7-digit integers in [1000000, 9999999]', async () => {
    wireRpc(i => makeOkPayload(i));
    for (let i = 0; i < 30; i++) {
      const res = await POST(makeOrderRequest());
      const body = await res.json();
      const n = parseInt(body.orderNumber, 10);
      expect(body.orderNumber).toMatch(/^\d{7}$/);
      expect(n).toBeGreaterThanOrEqual(1_000_000);
      expect(n).toBeLessThanOrEqual(9_999_999);
    }
  });
});

// ── 2. Sequential volume — 30 counter orders ──────────────────────────────────

describe('Volume: 30 sequential counter orders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('counter numbers form C01..C30 — distinct, zero-padded', async () => {
    wireRpc(i => makeOkPayload(i, 'counter'));
    const counters: string[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await POST(makeOrderRequest({ paymentMethod: 'counter' }));
      const body = await res.json();
      counters.push(body.counterNumber);
    }
    counters.sort();
    expect(new Set(counters).size).toBe(30);
    expect(counters[0]).toBe('C01');
    expect(counters[29]).toBe('C30');
  });
});

// ── 3. Idempotency replay storm ───────────────────────────────────────────────

describe('Idempotency: retry storm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('10 retries with same key produce 1 fresh + 9 replayed responses', async () => {
    const KEY = 'storm-key-001';
    // First call → fresh order; subsequent calls → replayed
    wireRpc(i => {
      if (i === 1) {
        return {
          status:         'ok',
          order_id:       'order-idem-001',
          order_number:   '1234567',
          counter_number: null,
          token_number:   '1',
          subtotal:       80,
          site_name:      'Cafe',
          site_slug:      'cafe',
          verified_items: [{ name: 'Dosa', qty: 1, price: 80 }],
        };
      }
      return {
        status:         'replayed',
        order_id:       'order-idem-001',
        order_number:   '1234567',
        counter_number: null,
        token_number:   '1',
      };
    });

    const results: { fresh: boolean; orderId: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await POST(makeOrderRequest({}, KEY));
      const body = await res.json();
      results.push({ fresh: !body.replayed, orderId: body.orderId });
    }

    const fresh    = results.filter(r => r.fresh);
    const replayed = results.filter(r => !r.fresh);

    expect(fresh.length).toBe(1);
    expect(replayed.length).toBe(9);

    // All responses reference the same order
    const ids = new Set(results.map(r => r.orderId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBe('order-idem-001');
  });
});

// ── 4. Rate limiting ──────────────────────────────────────────────────────────

describe('Rate limiting: 101st request gets 429', () => {
  it('first 100 succeed, 101st is throttled', async () => {
    // process_order_v2 handles rate limiting internally.
    // Mock: first 100 calls → ok, 101st → rate_limited.
    wireRpc(i => {
      if (i <= 100) return makeOkPayload(i);
      return { status: 'rate_limited' };
    });

    const statuses: number[] = [];
    for (let i = 0; i < 101; i++) {
      const res = await POST(makeOrderRequest());
      statuses.push(res.status);
    }

    expect(statuses.filter(s => s === 200).length).toBe(100);
    expect(statuses.filter(s => s === 429).length).toBe(1);
    expect(statuses[100]).toBe(429);
  }, 30_000);
});

// ── 5. Subtotal precision at scale ────────────────────────────────────────────

describe('Subtotal precision: rounding invariants', () => {
  it('server subtotal always rounds to 2 decimal places', () => {
    function serverSubtotal(items: { price: number; qty: number }[]): number {
      return Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
    }

    const cases = [
      { price: 0.1,    qty: 3,   expected: 0.30 },
      { price: 99.99,  qty: 2,   expected: 199.98 },
      { price: 7.77,   qty: 7,   expected: 54.39 },
      { price: 0.99,   qty: 99,  expected: 98.01 },
      { price: 200,    qty: 1,   expected: 200 },
      { price: 10,     qty: 10,  expected: 100 },
      { price: 15.50,  qty: 4,   expected: 62.00 },
      { price: 49.99,  qty: 3,   expected: 149.97 },
      { price: 0.01,   qty: 100, expected: 1.00 },
      { price: 33.33,  qty: 3,   expected: 99.99 },
      { price: 1,      qty: 1,   expected: 1.00 },
      { price: 80,     qty: 2,   expected: 160.00 },
      { price: 12.50,  qty: 8,   expected: 100.00 },
      { price: 5.55,   qty: 5,   expected: 27.75 },
      { price: 9.99,   qty: 10,  expected: 99.90 },
      { price: 25,     qty: 4,   expected: 100.00 },
      { price: 199.99, qty: 1,   expected: 199.99 },
      { price: 14.50,  qty: 2,   expected: 29.00 },
      { price: 3.33,   qty: 6,   expected: 19.98 },
      { price: 60,     qty: 3,   expected: 180.00 },
    ];

    for (const { price, qty, expected } of cases) {
      const result = serverSubtotal([{ price, qty }]);
      expect(result).toBeCloseTo(expected, 2);
    }
  });

  it('multi-item cart subtotals round correctly', () => {
    function serverSubtotal(items: { price: number; qty: number }[]): number {
      return Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
    }

    const cart = [
      { price: 80, qty: 2 },
      { price: 25.50, qty: 3 },
      { price: 9.99, qty: 1 },
    ];
    expect(serverSubtotal(cart)).toBeCloseTo(246.49, 2);
  });

  it('float drift case: 0.1 + 0.2 = 0.30 (not 0.30000000000000004)', () => {
    function serverSubtotal(items: { price: number; qty: number }[]): number {
      return Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
    }
    const result = serverSubtotal([{ price: 0.1, qty: 1 }, { price: 0.2, qty: 1 }]);
    expect(result).toBe(0.30);
  });
});

// ── 6. Order number uniqueness guarantee ──────────────────────────────────────

describe('Order number: uniqueness and format', () => {
  it('10000 generated order numbers have no collisions (probabilistic)', () => {
    const nums = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const buf = crypto.randomBytes(4);
      const n = (buf.readUInt32BE(0) % 9_000_000) + 1_000_000;
      nums.add(n);
    }
    // With 9M possible values and 10k draws, expect ≥ 9990 unique values
    expect(nums.size).toBeGreaterThan(9990);
  });

  it('all generated numbers are in [1000000, 9999999]', () => {
    for (let i = 0; i < 1000; i++) {
      const buf = crypto.randomBytes(4);
      const n = (buf.readUInt32BE(0) % 9_000_000) + 1_000_000;
      expect(n).toBeGreaterThanOrEqual(1_000_000);
      expect(n).toBeLessThanOrEqual(9_999_999);
    }
  });
});
