/**
 * Integration tests for GET /api/orders/[id]/status
 *
 * Public endpoint. Two access modes:
 *   1. No ?t param — same-session counter/token polling (no signature required)
 *   2. ?t=SIGNED_TOKEN — email link (24-hour HMAC signed link)
 *
 * Covers: signed-token validation, expired tokens, tampered tokens,
 *         order-not-found, happy-path for both modes,
 *         response headers (no-cache), env misconfiguration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}));

vi.mock('@/lib/orderEmail', () => ({
  verifyOrderToken: vi.fn(),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { GET } from '@/app/api/orders/[id]/status/route';
import { verifyOrderToken } from '@/lib/orderEmail';

// ── Constants ─────────────────────────────────────────────────────────────────

const ORDER_ID   = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!; // set in setup.ts

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGet(orderId: string, searchParams: Record<string, string> = {}): NextRequest {
  const url = new URL(`http://localhost/api/orders/${orderId}/status`);
  for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const MOCK_ORDER_ROW = {
  counter_number: null,
  token_number: '42',
  table_number: null,
  payment_status: 'paid',
  payment_method: 'online',
  status: 'pending',
  order_number: '1234567',
  items: [{ name: 'Dosa', qty: 2, price: 80 }],
  subtotal: 160,
  customer_name: 'Priya',
};

function mockFetch(rows: object[], ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: vi.fn().mockResolvedValue(rows),
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/orders/[id]/status — signed token validation', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('410: expired/invalid signed token returns 410 Gone', async () => {
    vi.mocked(verifyOrderToken).mockReturnValue(null); // expired or invalid

    const res = await GET(makeGet(ORDER_ID, { t: 'expired-or-invalid-token' }), {
      params: { id: ORDER_ID },
    });
    expect(res.status).toBe(410);
    expect((await res.json()).error).toMatch(/expired|invalid/i);
  });

  it('410: token is valid but refers to a different order ID (mismatch)', async () => {
    vi.mocked(verifyOrderToken).mockReturnValue('different-order-id'); // valid sig, wrong order

    const res = await GET(makeGet(ORDER_ID, { t: 'mismatched-token' }), {
      params: { id: ORDER_ID },
    });
    expect(res.status).toBe(410);
  });

  it('410: tampered token (verifyOrderToken returns null)', async () => {
    vi.mocked(verifyOrderToken).mockReturnValue(null);

    const res = await GET(makeGet(ORDER_ID, { t: 'tampered.token.here' }), {
      params: { id: ORDER_ID },
    });
    expect(res.status).toBe(410);
  });

  it('proceeds without calling verifyOrderToken when no ?t param', async () => {
    mockFetch([MOCK_ORDER_ROW]);

    const res = await GET(makeGet(ORDER_ID), { params: { id: ORDER_ID } });
    expect(verifyOrderToken).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('200: valid signed token matching the order ID', async () => {
    vi.mocked(verifyOrderToken).mockReturnValue(ORDER_ID); // matches
    mockFetch([MOCK_ORDER_ROW]);

    const res = await GET(makeGet(ORDER_ID, { t: 'valid-signed-token' }), {
      params: { id: ORDER_ID },
    });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/orders/[id]/status — order not found', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('404: Supabase returns non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: vi.fn() }));

    const res = await GET(makeGet(ORDER_ID), { params: { id: ORDER_ID } });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/order not found/i);
  });

  it('404: Supabase returns empty rows array', async () => {
    mockFetch([]); // no matching order

    const res = await GET(makeGet(ORDER_ID), { params: { id: ORDER_ID } });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/order not found/i);
  });
});

describe('GET /api/orders/[id]/status — happy path (no signed token)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('200: returns all expected fields for a token order', async () => {
    mockFetch([MOCK_ORDER_ROW]);

    const res = await GET(makeGet(ORDER_ID), { params: { id: ORDER_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token_number).toBe('42');
    expect(body.payment_status).toBe('paid');
    expect(body.payment_method).toBe('online');
    expect(body.status).toBe('pending');
    expect(body.order_number).toBe('1234567');
    expect(body.subtotal).toBe(160);
    expect(body.customer_name).toBe('Priya');
    expect(body.items).toBeDefined();
  });

  it('200: counter order returns counter_number correctly', async () => {
    mockFetch([{
      ...MOCK_ORDER_ROW,
      counter_number: 'C03',
      token_number: null,
    }]);

    const res = await GET(makeGet(ORDER_ID), { params: { id: ORDER_ID } });
    const body = await res.json();
    expect(body.counter_number).toBe('C03');
    expect(body.token_number).toBeNull();
  });

  it('200: table order returns table_number correctly', async () => {
    mockFetch([{
      ...MOCK_ORDER_ROW,
      table_number: '4',
      token_number: null,
    }]);

    const res = await GET(makeGet(ORDER_ID), { params: { id: ORDER_ID } });
    const body = await res.json();
    expect(body.table_number).toBe('4');
  });

  it('200: completed order shows status "completed"', async () => {
    mockFetch([{ ...MOCK_ORDER_ROW, status: 'completed' }]);

    const res = await GET(makeGet(ORDER_ID), { params: { id: ORDER_ID } });
    const body = await res.json();
    expect(body.status).toBe('completed');
  });
});

describe('GET /api/orders/[id]/status — response headers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('response includes Cache-Control: no-store', async () => {
    vi.clearAllMocks();
    mockFetch([MOCK_ORDER_ROW]);

    const res = await GET(makeGet(ORDER_ID), { params: { id: ORDER_ID } });
    expect(res.status).toBe(200);
    const cacheControl = res.headers.get('Cache-Control') ?? '';
    expect(cacheControl).toContain('no-store');
  });
});

describe('GET /api/orders/[id]/status — Supabase fetch URL correctness', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls Supabase REST with the correct URL structure', async () => {
    vi.clearAllMocks();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([MOCK_ORDER_ROW]),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await GET(makeGet(ORDER_ID), { params: { id: ORDER_ID } });

    const calledUrl: string = fetchSpy.mock.calls[0][0];
    expect(calledUrl).toContain('/rest/v1/orders');
    expect(calledUrl).toContain(`id=eq.${ORDER_ID}`);
    expect(calledUrl).toContain('counter_number');
    expect(calledUrl).toContain('token_number');
    expect(calledUrl).toContain('payment_status');
  });

  it('passes service-role key as both apikey and Authorization header', async () => {
    vi.clearAllMocks();
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([MOCK_ORDER_ROW]),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await GET(makeGet(ORDER_ID), { params: { id: ORDER_ID } });

    const calledOptions = fetchSpy.mock.calls[0][1];
    expect(calledOptions.headers.apikey).toBe(process.env.SUPABASE_SERVICE_ROLE_KEY);
    expect(calledOptions.headers.Authorization).toContain(process.env.SUPABASE_SERVICE_ROLE_KEY);
    expect(calledOptions.cache).toBe('no-store');
  });
});

describe('GET /api/orders/[id]/status — env misconfiguration', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it('500: when NEXT_PUBLIC_SUPABASE_URL is not set', async () => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const res = await GET(makeGet(ORDER_ID), { params: { id: ORDER_ID } });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/misconfiguration/i);
  });

  it('500: when SUPABASE_SERVICE_ROLE_KEY is not set', async () => {
    vi.clearAllMocks();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await GET(makeGet(ORDER_ID), { params: { id: ORDER_ID } });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/misconfiguration/i);
  });
});
