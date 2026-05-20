/**
 * Integration tests for PATCH /api/orders/[id]
 * Tests: auth, status advance with optimistic locking, 409 conflict,
 *        confirm_counter_payment double-confirm guard, 403 ownership.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}));

vi.mock('@/lib/verifyFirebaseToken', () => ({
  verifyFirebaseToken: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/orderEmail', () => ({
  buildOrderConfirmationEmail: vi.fn(() => ({
    subject: 'Order confirmed',
    htmlbody: '<html></html>',
  })),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { PATCH } from '@/app/api/orders/[id]/route';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ORDER_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SITE_ID    = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID    = 'user-uid-001';

function makeRequest(orderId: string, body: unknown, token = 'valid-token'): NextRequest {
  return new NextRequest(new URL(`http://localhost/api/orders/${orderId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function mockAuth(uid: string | null) {
  vi.mocked(verifyFirebaseToken).mockResolvedValue(uid);
}

function mockOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    site_id: SITE_ID,
    status: 'preparing',
    payment_status: 'paid',
    payment_method: 'online',
    customer_name: 'Priya',
    customer_email: 'priya@example.com',
    order_number: '1234567',
    items: [{ name: 'Dosa', qty: 1, price: 80 }],
    subtotal: 80,
    ...overrides,
  };
}

function mockSite() {
  return { id: SITE_ID, slug: 'test-cafe', name: 'Test Cafe' };
}

// ── 1. Authentication ─────────────────────────────────────────────────────────

describe('PATCH /api/orders/[id] — auth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401: no Authorization header', async () => {
    const req = new NextRequest(new URL(`http://localhost/api/orders/${ORDER_ID}`), {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ready' }),
    });
    const res = await PATCH(req, { params: { id: ORDER_ID } });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/unauthorized/i);
  });

  it('401: token does not start with "Bearer "', async () => {
    const req = new NextRequest(new URL(`http://localhost/api/orders/${ORDER_ID}`), {
      method: 'PATCH',
      headers: { Authorization: 'Token abc' },
      body: JSON.stringify({ status: 'ready' }),
    });
    const res = await PATCH(req, { params: { id: ORDER_ID } });
    expect(res.status).toBe(401);
  });

  it('401: Firebase token verification fails', async () => {
    mockAuth(null);
    const res = await PATCH(makeRequest(ORDER_ID, { status: 'ready' }), { params: { id: ORDER_ID } });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/invalid token/i);
  });

  it('400: orderId is not a valid UUID', async () => {
    mockAuth(USER_ID);
    const res = await PATCH(makeRequest('not-a-uuid', { status: 'ready' }), { params: { id: 'not-a-uuid' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/order id/i);
  });
});

// ── 2. Ownership check ────────────────────────────────────────────────────────

describe('PATCH /api/orders/[id] — ownership', () => {
  beforeEach(() => vi.clearAllMocks());

  it('404: order not found', async () => {
    mockAuth(USER_ID);
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await PATCH(makeRequest(ORDER_ID, { status: 'ready' }), { params: { id: ORDER_ID } });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/i);
  });

  it('403: site belongs to different user', async () => {
    mockAuth('other-user');
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockOrder(), error: null }),
            }),
          }),
        } as any;
      }
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await PATCH(makeRequest(ORDER_ID, { status: 'ready' }), { params: { id: ORDER_ID } });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/forbidden/i);
  });
});

// ── 3. Status advance ─────────────────────────────────────────────────────────

describe('PATCH /api/orders/[id] — status advance', () => {
  beforeEach(() => vi.clearAllMocks());

  function wireOwnership() {
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockOrder(), error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: ORDER_ID, status: 'ready' },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockSite(), error: null }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });
  }

  it('200: advances status to "ready"', async () => {
    mockAuth(USER_ID);
    wireOwnership();

    const res = await PATCH(
      makeRequest(ORDER_ID, { status: 'ready', expected_status: 'preparing' }),
      { params: { id: ORDER_ID } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ready');
  });

  it('400: invalid status value', async () => {
    mockAuth(USER_ID);
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockOrder(), error: null }),
            }),
          }),
        } as any;
      }
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockSite(), error: null }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await PATCH(
      makeRequest(ORDER_ID, { status: 'cooked' }),
      { params: { id: ORDER_ID } },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/status must be/i);
  });

  it('409: optimistic lock miss returns currentStatus', async () => {
    mockAuth(USER_ID);

    // Track how many times orders.select is called
    let ordersSelectCount = 0;

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn().mockImplementation(() => {
            ordersSelectCount++;
            if (ordersSelectCount === 1) {
              // First call: ownership check — returns current order
              return {
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: mockOrder({ status: 'preparing' }),
                    error: null,
                  }),
                }),
              };
            }
            // Second call: re-fetch after lock miss — returns advanced status
            return {
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { status: 'ready' },
                  error: null,
                }),
              }),
            };
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockSite(), error: null }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await PATCH(
      makeRequest(ORDER_ID, { status: 'ready', expected_status: 'preparing' }),
      { params: { id: ORDER_ID } },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/conflict/i);
    expect(body.currentStatus).toBe('ready');
  });
});

// ── 4. confirm_counter_payment ────────────────────────────────────────────────

describe('PATCH /api/orders/[id] — confirm_counter_payment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400: not a counter order (payment_method = online)', async () => {
    mockAuth(USER_ID);
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockOrder({ payment_method: 'online', payment_status: 'paid' }),
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockSite(), error: null }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await PATCH(
      makeRequest(ORDER_ID, { action: 'confirm_counter_payment' }),
      { params: { id: ORDER_ID } },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not a pending counter/i);
  });

  it('400: already confirmed (payment_status = paid)', async () => {
    mockAuth(USER_ID);
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockOrder({ payment_method: 'counter', payment_status: 'paid' }),
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockSite(), error: null }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await PATCH(
      makeRequest(ORDER_ID, { action: 'confirm_counter_payment' }),
      { params: { id: ORDER_ID } },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not a pending counter/i);
  });

  it('200: success — returns tokenNumber', async () => {
    mockAuth(USER_ID);

    vi.mocked(supabaseServer.rpc).mockResolvedValue({ data: 7, error: null } as any);

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn()
            .mockReturnValueOnce({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockOrder({ payment_method: 'counter', payment_status: 'pending' }),
                  error: null,
                }),
              }),
            }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: ORDER_ID }, error: null }),
                }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockSite(), error: null }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'transactions') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ then: vi.fn() }),
          }),
        } as any;
      }
      if (table === 'email_queue') {
        return {
          insert: vi.fn().mockReturnValue({ then: vi.fn() }),
        } as any;
      }
      return {} as any;
    });

    const res = await PATCH(
      makeRequest(ORDER_ID, { action: 'confirm_counter_payment' }),
      { params: { id: ORDER_ID } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tokenNumber).toBe('7');
  });

  it('200 replayed=true when double-confirm (row already updated)', async () => {
    mockAuth(USER_ID);

    vi.mocked(supabaseServer.rpc).mockResolvedValue({ data: 8, error: null } as any);

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          select: vi.fn()
            .mockReturnValueOnce({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockOrder({ payment_method: 'counter', payment_status: 'pending' }),
                  error: null,
                }),
              }),
            })
            .mockReturnValueOnce({
              // Re-fetch after null update — returns current token
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { token_number: '8' },
                  error: null,
                }),
              }),
            }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // null = already confirmed
                }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockSite(), error: null }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await PATCH(
      makeRequest(ORDER_ID, { action: 'confirm_counter_payment' }),
      { params: { id: ORDER_ID } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.replayed).toBe(true);
    expect(body.tokenNumber).toBe('8');
  });
});
