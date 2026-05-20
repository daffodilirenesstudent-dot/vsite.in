/**
 * Integration tests for POST /api/bill-request
 *
 * Public endpoint — no auth.
 * Covers: input validation, site-online check, active-order check,
 *         rate-limit guard, success path, insert failure.
 *
 * Key regression: multiple active orders for a table must NOT fail.
 * Old bug: .maybeSingle() threw when >1 row matched, giving false 400.
 * Fix: .limit(1) + array-length check. This suite locks in the correct behaviour.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}));

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: { from: vi.fn() },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { POST } from '@/app/api/bill-request/route';
import { supabaseServer } from '@/lib/supabase-server';

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_SITE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePost(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/bill-request'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return { siteId: VALID_SITE_ID, tableNumber: 3, ...overrides };
}

/** Wire a happy-path sequence. Each table query in order: sites → orders → bill_requests → insert */
function mockHappyPath(opts: { activeOrders?: { id: string }[]; recentBillRequest?: object | null } = {}) {
  const { activeOrders = [{ id: 'ord-001' }], recentBillRequest = null } = opts;

  vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
    if (table === 'sites') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: VALID_SITE_ID, is_live: true },
              error: null,
            }),
          }),
        }),
      } as any;
    }
    if (table === 'orders') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: activeOrders, error: null }),
              }),
            }),
          }),
        }),
      } as any;
    }
    if (table === 'bill_requests') {
      let callCount = 0;
      return {
        // rate-limit check
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: recentBillRequest, error: null }),
                }),
              }),
            }),
          }),
        }),
        // insert
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'br-uuid-001' },
              error: null,
            }),
          }),
        }),
      } as any;
    }
    return {} as any;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/bill-request — input validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400: invalid JSON body', async () => {
    const req = new NextRequest(new URL('http://localhost/api/bill-request'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid json/i);
  });

  it('400: missing siteId', async () => {
    const res = await POST(makePost({ tableNumber: 3 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/siteid/i);
  });

  it('400: siteId that is not a valid UUID format', async () => {
    const res = await POST(makePost(validBody({ siteId: 'not-a-uuid' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/siteid/i);
  });

  it('400: missing tableNumber', async () => {
    const res = await POST(makePost({ siteId: VALID_SITE_ID }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/table/i);
  });

  it('400: tableNumber = 0 (falsy)', async () => {
    const res = await POST(makePost(validBody({ tableNumber: 0 })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/table/i);
  });
});

describe('POST /api/bill-request — site check', () => {
  beforeEach(() => vi.clearAllMocks());

  it('404: site not found (null data)', async () => {
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await POST(makePost(validBody()));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/store not found|offline/i);
  });

  it('404: site found but is_live=false (offline)', async () => {
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: VALID_SITE_ID, is_live: false },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await POST(makePost(validBody()));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/offline/i);
  });
});

describe('POST /api/bill-request — active order check', () => {
  beforeEach(() => vi.clearAllMocks());

  it('400: no active orders for this table', async () => {
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: VALID_SITE_ID, is_live: true },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await POST(makePost(validBody()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active orders/i);
  });

  /**
   * REGRESSION TEST — old maybeSingle() bug.
   * When a table had 2+ active orders (multiple rounds of ordering),
   * maybeSingle() threw PGRST116 and returned null data, causing a false 400.
   *
   * Fix: use limit(1) + array length check.
   * This test verifies the fix: multiple active orders → 200 success.
   */
  it('200: multiple active orders on same table (regression: not a false 400)', async () => {
    const twoOrders = [{ id: 'ord-001' }, { id: 'ord-002' }]; // two rounds
    mockHappyPath({ activeOrders: twoOrders });

    const res = await POST(makePost(validBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe('POST /api/bill-request — rate limiting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('429: pending bill request exists within last 5 minutes', async () => {
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: VALID_SITE_ID, is_live: true },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [{ id: 'ord-001' }], error: null }),
                }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'bill_requests') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gte: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'existing-br' }, // already pending
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await POST(makePost(validBody()));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/already requested|shortly/i);
  });
});

describe('POST /api/bill-request — success', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200: returns success and bill-request id', async () => {
    mockHappyPath();

    const res = await POST(makePost(validBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBe('br-uuid-001');
  });

  it('200: tableNumber can be sent as a string (coerced to string internally)', async () => {
    mockHappyPath();

    const res = await POST(makePost(validBody({ tableNumber: '5' })));
    expect(res.status).toBe(200);
  });

  it('200: first bill request after 5-min window is allowed (no recent pending)', async () => {
    mockHappyPath({ recentBillRequest: null });

    const res = await POST(makePost(validBody()));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/bill-request — insert failure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('500: when bill_request insert fails', async () => {
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: VALID_SITE_ID, is_live: true },
                error: null,
              }),
            }),
          }),
        } as any;
      }
      if (table === 'orders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [{ id: 'ord-001' }], error: null }),
                }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'bill_requests') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gte: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'DB error' },
              }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });

    const res = await POST(makePost(validBody()));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/failed to send/i);
  });
});
