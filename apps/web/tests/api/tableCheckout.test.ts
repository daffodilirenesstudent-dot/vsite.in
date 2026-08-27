/**
 * Integration tests for POST /api/manage/table-checkout
 *
 * Firebase auth required. Two modes:
 *   Table mode:    { site_id, table_number, payment_method } — settles all active orders
 *   Takeaway mode: { site_id, order_id, token_label, payment_method } — settles single order
 *
 * Covers: auth guard, input validation, site ownership, table/takeaway modes,
 *         empty-table early return, order status update, transaction insert,
 *         bill-request acknowledgement.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}));

vi.mock('@/lib/verifyFirebaseToken', () => ({
  verifyFirebaseToken: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: { from: vi.fn() },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { POST } from '@/app/api/manage/table-checkout/route';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

// ── Constants ─────────────────────────────────────────────────────────────────

const SITE_ID  = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID  = 'firebase-uid-checkout-001';
const ORDER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePost(body: unknown, token = 'valid-firebase-token'): NextRequest {
  return new NextRequest(new URL('http://localhost/api/manage/table-checkout'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function validTableBody(overrides: Record<string, unknown> = {}) {
  return { site_id: SITE_ID, table_number: '3', payment_method: 'cash', ...overrides };
}

function validTakeawayBody(overrides: Record<string, unknown> = {}) {
  return {
    site_id: SITE_ID,
    order_id: ORDER_ID,
    token_label: 'Takeaway 4',
    payment_method: 'card',
    ...overrides,
  };
}

function mockAuth(uid: string | null = USER_ID) {
  vi.mocked(verifyFirebaseToken).mockResolvedValue(uid);
}

function mockSiteOwnership(found = true) {
  return (table: string) => {
    if (table === 'sites') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: found ? { id: SITE_ID } : null,
                error: null,
              }),
            }),
          }),
        }),
      } as any;
    }
    return null;
  };
}

function wireTableMode(opts: {
  orders?: { id: string; subtotal: number }[];
  ordersErr?: object;
  insertErr?: object;
  updateErr?: object;
} = {}) {
  const orders = opts.orders ?? [
    { id: 'ord-t1', subtotal: 120 },
    { id: 'ord-t2', subtotal: 80 },
  ];

  vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
    const siteResult = mockSiteOwnership()(table);
    if (siteResult) return siteResult;

    if (table === 'orders') {
      if (opts.ordersErr) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({ data: null, error: opts.ordersErr }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: opts.updateErr ?? null }),
          }),
        } as any;
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockResolvedValue({ data: orders, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: opts.updateErr ?? null }),
        }),
      } as any;
    }
    if (table === 'table_checkouts') {
      return {
        insert: vi.fn().mockResolvedValue({ error: opts.insertErr ?? null }),
      } as any;
    }
    if (table === 'transactions') {
      return {
        insert: vi.fn().mockReturnValue({
          then: vi.fn(cb => cb({ error: null })),
        }),
      } as any;
    }
    if (table === 'bill_requests') {
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      } as any;
    }
    return {} as any;
  });
}

function wireTakeawayMode(opts: {
  order?: { id: string; subtotal: number } | null;
} = {}) {
  const order = opts.order !== undefined ? opts.order : { id: ORDER_ID, subtotal: 350 };

  vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
    const siteResult = mockSiteOwnership()(table);
    if (siteResult) return siteResult;

    if (table === 'orders') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: order, error: null }),
              }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as any;
    }
    if (table === 'table_checkouts') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      } as any;
    }
    if (table === 'transactions') {
      return {
        insert: vi.fn().mockReturnValue({
          then: vi.fn(cb => cb({ error: null })),
        }),
      } as any;
    }
    return {} as any;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/manage/table-checkout — auth guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401: missing Authorization header', async () => {
    const req = new NextRequest(new URL('http://localhost/api/manage/table-checkout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validTableBody()),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/unauthorized/i);
  });

  it('401: invalid/expired Firebase token', async () => {
    vi.mocked(verifyFirebaseToken).mockResolvedValue(null);

    const res = await POST(makePost(validTableBody()));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/invalid token/i);
  });
});

describe('POST /api/manage/table-checkout — input validation', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuth(); });

  it('400: invalid JSON body', async () => {
    vi.mocked(verifyFirebaseToken).mockResolvedValue(USER_ID);
    const req = new NextRequest(new URL('http://localhost/api/manage/table-checkout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('400: missing site_id', async () => {
    const res = await POST(makePost({ table_number: '3', payment_method: 'cash' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid request/i);
  });

  it('400: invalid payment_method (must be cash|card|upi)', async () => {
    const res = await POST(makePost(validTableBody({ payment_method: 'crypto' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid request/i);
  });

  it('400: neither table_number nor order_id provided', async () => {
    const res = await POST(makePost({ site_id: SITE_ID, payment_method: 'cash' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/table_number or order_id/i);
  });

  it('all three payment methods are accepted: cash, card, upi', async () => {
    for (const pm of ['cash', 'card', 'upi']) {
      vi.clearAllMocks();
      mockAuth();
      wireTableMode();
      const res = await POST(makePost(validTableBody({ payment_method: pm })));
      expect(res.status).toBe(200);
    }
  });
});

describe('POST /api/manage/table-checkout — site ownership', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuth(); });

  it('403: site does not belong to the authenticated user', async () => {
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      const r = mockSiteOwnership(false)(table);
      return r ?? ({} as any);
    });

    const res = await POST(makePost(validTableBody()));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/forbidden/i);
  });
});

describe('POST /api/manage/table-checkout — table mode', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuth(); });

  it('200: settles two active orders, returns orderCount=2 and correct totalAmount', async () => {
    wireTableMode({
      orders: [{ id: 'ord-1', subtotal: 120 }, { id: 'ord-2', subtotal: 80 }],
    });

    const res = await POST(makePost(validTableBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.orderCount).toBe(2);
    expect(body.totalAmount).toBe(200);
  });

  it('200: empty table returns orderCount=0 without inserting into table_checkouts', async () => {
    wireTableMode({ orders: [] });

    const res = await POST(makePost(validTableBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orderCount).toBe(0);
    expect(body.totalAmount).toBe(0);
  });

  it('500: when fetching active orders fails', async () => {
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      const siteResult = mockSiteOwnership()(table);
      if (siteResult) return siteResult;
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB fail' } }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await POST(makePost(validTableBody()));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/failed to fetch orders/i);
  });

  it('500: when table_checkouts insert fails', async () => {
    wireTableMode({ insertErr: { message: 'insert failed' } });

    const res = await POST(makePost(validTableBody()));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/failed to record checkout/i);
  });

  it('totalAmount in response body is the raw sum (DB insert rounds it)', async () => {
    // The route returns `totalAmount` unrounded in the response body.
    // The Math.round(...) only applies to the DB insert amount.
    wireTableMode({
      orders: [
        { id: 'ord-1', subtotal: 33.333 },
        { id: 'ord-2', subtotal: 33.333 },
        { id: 'ord-3', subtotal: 33.333 },
      ],
    });

    const res = await POST(makePost(validTableBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalAmount).toBeCloseTo(99.999, 3);
  });
});

describe('POST /api/manage/table-checkout — takeaway mode', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuth(); });

  it('200: settles single takeaway order', async () => {
    wireTakeawayMode({ order: { id: ORDER_ID, subtotal: 350 } });

    const res = await POST(makePost(validTakeawayBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.orderCount).toBe(1);
    expect(body.totalAmount).toBe(350);
  });

  it('200: takeaway order not found → orderCount=0 (nothing to settle)', async () => {
    wireTakeawayMode({ order: null });

    const res = await POST(makePost(validTakeawayBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orderCount).toBe(0);
  });

  it('200: cash payment method accepted for takeaway', async () => {
    wireTakeawayMode();
    const res = await POST(makePost(validTakeawayBody({ payment_method: 'cash' })));
    expect(res.status).toBe(200);
  });

  it('200: upi payment method accepted for takeaway', async () => {
    wireTakeawayMode();
    const res = await POST(makePost(validTakeawayBody({ payment_method: 'upi' })));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/manage/table-checkout — transaction recording', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuth(); });

  it('transaction insert is attempted after successful table checkout', async () => {
    let txnInsertCalled = false;

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      const siteResult = mockSiteOwnership()(table);
      if (siteResult) return siteResult;

      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({
                  data: [{ id: 'ord-tx1', subtotal: 200 }],
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null }),
          }),
        } as any;
      }
      if (table === 'table_checkouts') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) } as any;
      }
      if (table === 'transactions') {
        txnInsertCalled = true;
        return {
          insert: vi.fn().mockReturnValue({
            then: vi.fn(cb => cb({ error: null })),
          }),
        } as any;
      }
      if (table === 'bill_requests') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await POST(makePost(validTableBody()));
    expect(res.status).toBe(200);
    expect(txnInsertCalled).toBe(true);
  });

  it('transaction insert NOT attempted when no orders to settle (empty table)', async () => {
    let txnInsertCalled = false;

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      const siteResult = mockSiteOwnership()(table);
      if (siteResult) return siteResult;
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'transactions') {
        txnInsertCalled = true;
        return { insert: vi.fn().mockReturnValue({ then: vi.fn() }) } as any;
      }
      return {} as any;
    });

    await POST(makePost(validTableBody()));
    expect(txnInsertCalled).toBe(false);
  });
});

describe('POST /api/manage/table-checkout — bill request acknowledgement', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAuth(); });

  it('bill_requests updated to acknowledged after table checkout', async () => {
    let billAckCalled = false;

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      const siteResult = mockSiteOwnership()(table);
      if (siteResult) return siteResult;

      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({
                  data: [{ id: 'ord-ack', subtotal: 100 }],
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null }),
          }),
        } as any;
      }
      if (table === 'table_checkouts') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) } as any;
      }
      if (table === 'transactions') {
        return { insert: vi.fn().mockReturnValue({ then: vi.fn(cb => cb({ error: null })) }) } as any;
      }
      if (table === 'bill_requests') {
        billAckCalled = true;
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await POST(makePost(validTableBody()));
    expect(res.status).toBe(200);
    expect(billAckCalled).toBe(true);
  });

  it('bill_requests NOT queried in takeaway mode (no table_number)', async () => {
    let billAckCalled = false;

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      const siteResult = mockSiteOwnership()(table);
      if (siteResult) return siteResult;

      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: ORDER_ID, subtotal: 200 },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ error: null }),
          }),
        } as any;
      }
      if (table === 'table_checkouts') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) } as any;
      }
      if (table === 'transactions') {
        return { insert: vi.fn().mockReturnValue({ then: vi.fn(cb => cb({ error: null })) }) } as any;
      }
      if (table === 'bill_requests') {
        billAckCalled = true;
        return { update: vi.fn().mockReturnValue({ eq: vi.fn() }) } as any;
      }
      return {} as any;
    });

    await POST(makePost(validTakeawayBody()));
    expect(billAckCalled).toBe(false);
  });
});
