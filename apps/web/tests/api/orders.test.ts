/**
 * Integration tests for POST /api/orders (v3 — process_order_v2 RPC)
 *
 * The route now makes a single process_order_v2 RPC call in the hot path.
 * Tests mock that one call with appropriate JSONB status payloads, exactly as
 * Postgres would return them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

vi.mock('server-only', () => ({}));

vi.mock('@/lib/supabase-server', () => {
  const mockFrom = vi.fn();
  const mockRpc  = vi.fn();
  return { supabaseServer: { from: mockFrom, rpc: mockRpc } };
});

vi.mock('@/lib/orderEmail', () => ({
  buildOrderConfirmationEmail: vi.fn(() => ({
    subject:  'Order confirmed',
    htmlbody: '<html>Test</html>',
  })),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { POST } from '@/app/api/orders/route';
import { supabaseServer } from '@/lib/supabase-server';

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_SITE_ID    = '11111111-1111-1111-1111-111111111111';
const VALID_PRODUCT_ID = '22222222-2222-2222-2222-222222222222';
const VALID_ORDER_ID   = '33333333-3333-3333-3333-333333333333';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL('http://localhost/api/orders'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    siteId:        VALID_SITE_ID,
    customerName:  'Priya Sharma',
    customerEmail: 'priya@example.com',
    paymentMethod: 'online',
    items:         [{ id: VALID_PRODUCT_ID, qty: 2 }],
    ...overrides,
  };
}

// Base successful RPC payload
const OK_BASE = {
  status:         'ok',
  order_id:       VALID_ORDER_ID,
  order_number:   '1234567',
  counter_number: null,
  token_number:   '1',
  subtotal:       160,
  site_name:      'Test Cafe',
  site_slug:      'test-cafe',
  verified_items: [{ name: 'Masala Dosa', qty: 2, price: 80 }],
};

// Mock the single process_order_v2 RPC with a given JSONB payload
function mockRpc(payload: Record<string, unknown>) {
  vi.mocked(supabaseServer.rpc).mockImplementation((fn: string) => {
    if (fn === 'process_order_v2') {
      return Promise.resolve({ data: payload, error: null }) as any;
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

// ── Tests: input validation ───────────────────────────────────────────────────

describe('POST /api/orders — input validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400: invalid JSON body', async () => {
    const req = new NextRequest(new URL('http://localhost/api/orders'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'Invalid JSON body' });
  });

  it('400: missing siteId', async () => {
    const res = await POST(makeRequest(validBody({ siteId: undefined })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/siteId/i);
  });

  it('400: siteId not a UUID', async () => {
    const res = await POST(makeRequest(validBody({ siteId: 'not-a-uuid' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/siteId/i);
  });

  it('400: missing customerName', async () => {
    const res = await POST(makeRequest(validBody({ customerName: '' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/customer name/i);
  });

  it('400: customerName with only control characters sanitizes to empty', async () => {
    const res = await POST(makeRequest(validBody({ customerName: '\x00\x01\x02' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/customer name/i);
  });

  it('400: invalid email format', async () => {
    const res = await POST(makeRequest(validBody({ customerEmail: 'not-an-email' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email/i);
  });

  it('400: email missing TLD', async () => {
    const res = await POST(makeRequest(validBody({ customerEmail: 'user@domain' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email/i);
  });

  it('400: paymentMethod not one of the allowed values', async () => {
    const res = await POST(makeRequest(validBody({ paymentMethod: 'cash' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/paymentMethod/i);
  });

  it('400: empty items array', async () => {
    const res = await POST(makeRequest(validBody({ items: [] })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/item/i);
  });

  it('400: items not an array', async () => {
    const res = await POST(makeRequest(validBody({ items: 'burger' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/item/i);
  });

  it('400: item id not a UUID', async () => {
    const res = await POST(makeRequest(validBody({ items: [{ id: 'bad', qty: 1 }] })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/item id/i);
  });

  it('400: item qty = 0', async () => {
    const res = await POST(makeRequest(validBody({ items: [{ id: VALID_PRODUCT_ID, qty: 0 }] })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/qty/i);
  });

  it('400: item qty = 100 (exceeds MAX_QTY=99)', async () => {
    const res = await POST(makeRequest(validBody({ items: [{ id: VALID_PRODUCT_ID, qty: 100 }] })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/qty/i);
  });

  it('400: item qty is a float', async () => {
    const res = await POST(makeRequest(validBody({ items: [{ id: VALID_PRODUCT_ID, qty: 1.5 }] })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/qty/i);
  });
});

// ── Tests: RPC status → HTTP mapping ─────────────────────────────────────────

describe('POST /api/orders — rate limiting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('429: when RPC returns rate_limited', async () => {
    mockRpc({ status: 'rate_limited' });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/too many/i);
  });
});

describe('POST /api/orders — idempotency replay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 replayed=true when RPC returns replayed status', async () => {
    mockRpc({
      status:         'replayed',
      order_id:       VALID_ORDER_ID,
      order_number:   '7654321',
      counter_number: null,
      token_number:   '5',
    });

    const res = await POST(makeRequest(validBody(), { 'Idempotency-Key': 'my-unique-key-001' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.replayed).toBe(true);
    expect(body.orderId).toBe(VALID_ORDER_ID);
    expect(body.tokenNumber).toBe('5');
  });
});

describe('POST /api/orders — store checks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('404: store not found', async () => {
    mockRpc({ status: 'store_not_found' });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/store not found/i);
  });

  it('403: store offline', async () => {
    mockRpc({ status: 'store_offline' });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/offline/i);
  });

  it('403: store closed', async () => {
    mockRpc({ status: 'store_closed' });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/closed/i);
  });

  it('403: plan does not allow orders (qr_menu)', async () => {
    mockRpc({ status: 'plan_no_orders' });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/does not accept orders/i);
  });

  it('400: invalid payment method for this plan', async () => {
    mockRpc({ status: 'invalid_payment_method' });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid payment method/i);
  });

  it('400: invalid table number', async () => {
    mockRpc({ status: 'invalid_table_number' });
    const res = await POST(makeRequest(validBody({ tableNumber: 999 })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid table number/i);
  });
});

describe('POST /api/orders — price verification errors', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400: item not found in site products', async () => {
    mockRpc({ status: 'item_not_found', item_id: VALID_PRODUCT_ID });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not available/i);
  });

  it('400: product is_live=false (unavailable)', async () => {
    mockRpc({ status: 'item_unavailable', item_name: 'Burger' });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unavailable/i);
  });

  it('400: variant size not found in product metadata', async () => {
    mockRpc({ status: 'variant_not_found', item_name: 'Chai', variant: 'XLarge' });
    const res = await POST(makeRequest(validBody({
      items: [{ id: VALID_PRODUCT_ID, qty: 1, variantSize: 'XLarge' }],
    })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/variant/i);
  });

  it('400: order total out of valid range', async () => {
    mockRpc({ status: 'invalid_total', subtotal: 0 });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid order total/i);
  });
});

describe('POST /api/orders — counter capacity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('503: counter sequence exceeds MAX_COUNTER_DAY=99', async () => {
    mockRpc({ status: 'counter_full' });
    const res = await POST(makeRequest(validBody({ paymentMethod: 'counter' })));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/counter capacity/i);
  });
});

describe('POST /api/orders — happy path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200: online order returns orderId, orderNumber, tokenNumber', async () => {
    mockRpc(OK_BASE);
    const res = await POST(makeRequest(validBody({ paymentMethod: 'online' })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.orderId).toBe(VALID_ORDER_ID);
    expect(body.orderNumber).toBe('1234567');
    expect(body.tokenNumber).toBe('1');
    expect(body.counterNumber).toBeUndefined();
  });

  it('200: counter order returns counterNumber (C01), no tokenNumber', async () => {
    mockRpc({ ...OK_BASE, token_number: null, counter_number: 'C01' });
    const res = await POST(makeRequest(validBody({ paymentMethod: 'counter' })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.counterNumber).toBe('C01');
    expect(body.tokenNumber).toBeUndefined();
  });

  it('200: no_payment table order has no token or counter', async () => {
    mockRpc({ ...OK_BASE, token_number: null, counter_number: null });
    const res = await POST(makeRequest(validBody({ paymentMethod: 'no_payment', tableNumber: 3 })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tokenNumber).toBeUndefined();
    expect(body.counterNumber).toBeUndefined();
  });

  it('200: no_payment takeaway order has takeaway token number', async () => {
    mockRpc({ ...OK_BASE, token_number: 'Takeaway 1', counter_number: null });
    const res = await POST(makeRequest(validBody({ paymentMethod: 'no_payment' })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokenNumber).toBe('Takeaway 1');
  });

  it('route does NOT send client price to the RPC (server verifies prices)', async () => {
    mockRpc(OK_BASE);
    const rpcSpy = vi.mocked(supabaseServer.rpc);

    await POST(makeRequest(validBody({
      items: [{ id: VALID_PRODUCT_ID, qty: 1, price: 1 }], // client sends tampered price
    })));

    const [, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    const passedItems = args.p_items_json as Array<Record<string, unknown>>;
    // The route strips price before passing to the RPC
    expect(passedItems[0]).not.toHaveProperty('price');
    expect(passedItems[0].id).toBe(VALID_PRODUCT_ID);
    expect(passedItems[0].qty).toBe(1);
  });

  it('route passes variantSize through to the RPC', async () => {
    mockRpc({ ...OK_BASE, verified_items: [{ name: 'Chai', qty: 1, price: 40 }] });
    const rpcSpy = vi.mocked(supabaseServer.rpc);

    await POST(makeRequest(validBody({
      items: [{ id: VALID_PRODUCT_ID, qty: 1, variantSize: 'Large' }],
    })));

    const [, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    const passedItems = args.p_items_json as Array<Record<string, unknown>>;
    expect(passedItems[0].variantSize).toBe('Large');
  });
});

describe('POST /api/orders — email enqueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enqueues email fire-and-forget on online order success', async () => {
    mockRpc(OK_BASE);
    const fromSpy = vi.mocked(supabaseServer.from);

    await POST(makeRequest(validBody({ paymentMethod: 'online' })));

    const emailInsert = fromSpy.mock.calls.find(([t]) => t === 'email_queue');
    expect(emailInsert).toBeDefined();
  });

  it('does NOT enqueue email for counter order', async () => {
    mockRpc({ ...OK_BASE, token_number: null, counter_number: 'C01' });
    const fromSpy = vi.mocked(supabaseServer.from);

    await POST(makeRequest(validBody({ paymentMethod: 'counter' })));

    const emailInsert = fromSpy.mock.calls.find(([t]) => t === 'email_queue');
    expect(emailInsert).toBeUndefined();
  });

  it('does NOT enqueue email for no_payment order', async () => {
    mockRpc({ ...OK_BASE, token_number: null, counter_number: null });
    const fromSpy = vi.mocked(supabaseServer.from);

    await POST(makeRequest(validBody({ paymentMethod: 'no_payment', tableNumber: 2 })));

    const emailInsert = fromSpy.mock.calls.find(([t]) => t === 'email_queue');
    expect(emailInsert).toBeUndefined();
  });
});

describe('POST /api/orders — RPC failure handling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('500: when RPC returns an error object (DB error)', async () => {
    vi.mocked(supabaseServer.rpc).mockResolvedValue({ data: null, error: { message: 'DB error' } } as any);
    vi.mocked(supabaseServer.from).mockReturnValue({} as any);

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/failed to place order/i);
  });

  it('500: when RPC returns unknown status', async () => {
    mockRpc({ status: 'some_unknown_status_from_future_postgres' });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
  });

  it('500: order_creation_failed status', async () => {
    mockRpc({ status: 'order_creation_failed' });
    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/failed to place order/i);
  });
});

describe('POST /api/orders — RPC receives correct parameters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes rate-limit window, site limit, and IP limit correctly', async () => {
    mockRpc(OK_BASE);
    const rpcSpy = vi.mocked(supabaseServer.rpc);

    await POST(makeRequest(validBody()));

    const [fn, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('process_order_v2');
    expect(args.p_rl_window_ms).toBe(60_000);
    expect(args.p_rl_site_limit).toBe(100);
    expect(args.p_rl_ip_limit).toBe(20);
  });

  it('passes hashed rate-limit keys (not raw IPs)', async () => {
    mockRpc(OK_BASE);
    const rpcSpy = vi.mocked(supabaseServer.rpc);

    await POST(makeRequest(validBody()));

    const [, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    // Keys are 40-char hex (SHA-256 prefix), not raw siteId or IP
    expect(typeof args.p_site_rate_key).toBe('string');
    expect((args.p_site_rate_key as string).length).toBe(40);
    expect((args.p_site_rate_key as string)).not.toContain(VALID_SITE_ID);
    expect(typeof args.p_ip_rate_key).toBe('string');
    expect((args.p_ip_rate_key as string).length).toBe(40);
  });

  it('passes empty string for idempotency key when none provided', async () => {
    mockRpc(OK_BASE);
    const rpcSpy = vi.mocked(supabaseServer.rpc);

    await POST(makeRequest(validBody())); // no Idempotency-Key header

    const [, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_idempotency_key).toBe('');
  });

  it('passes hashed idempotency key when header is provided', async () => {
    mockRpc(OK_BASE);
    const rpcSpy = vi.mocked(supabaseServer.rpc);

    await POST(makeRequest(validBody(), { 'Idempotency-Key': 'my-request-id-abc' }));

    const [, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_idempotency_key).not.toBe('');
    expect(typeof args.p_idempotency_key).toBe('string');
    // Hashed, not raw
    expect(args.p_idempotency_key).not.toBe('my-request-id-abc');
  });

  it('passes null tableNumber when not provided', async () => {
    mockRpc(OK_BASE);
    const rpcSpy = vi.mocked(supabaseServer.rpc);

    await POST(makeRequest(validBody())); // no tableNumber

    const [, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_table_number).toBeNull();
  });

  it('passes tableNumber when provided', async () => {
    mockRpc(OK_BASE);
    const rpcSpy = vi.mocked(supabaseServer.rpc);

    await POST(makeRequest(validBody({ tableNumber: 5 })));

    const [, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_table_number).toBe(5);
  });
});
