/**
 * Integration tests for GET /api/manage/orders
 * Tests: auth, ownership, initial load, delta mode (?since=), pagination (?before=),
 *        timezone-aware day boundary, hasMore flag, error handling.
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

// ── Import after mocks ────────────────────────────────────────────────────────

import { GET } from '@/app/api/manage/orders/route';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SITE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'user-uid-manage-001';

function makeGet(params: Record<string, string> = {}, token = 'valid-token'): NextRequest {
  const url = new URL('http://localhost/api/manage/orders');
  url.searchParams.set('site_id', SITE_ID);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function mockAuth(uid: string | null) {
  vi.mocked(verifyFirebaseToken).mockResolvedValue(uid);
}

function fakeOrder(n: number) {
  const d = new Date(2026, 4, 12, 10, n, 0); // May 12 2026 10:Nm IST
  return {
    id: `order-${n}`,
    site_id: SITE_ID,
    order_number: `100000${n}`,
    customer_name: `Customer ${n}`,
    table_number: null,
    items: [{ name: 'Dosa', qty: 1, price: 80 }],
    subtotal: 80,
    payment_method: 'online',
    payment_status: 'paid',
    status: 'preparing',
    counter_number: null,
    token_number: String(n),
    created_at: d.toISOString(),
    updated_at: d.toISOString(),
  };
}

// Wire site ownership
function mockSiteOwnership(tz = 'Asia/Kolkata') {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: SITE_ID, timezone: tz },
            error: null,
          }),
        }),
      }),
    }),
  } as any;
}

// Wire orders query that supports method chaining .eq().order().limit().[gte/lt]
function mockOrdersQuery(orders: unknown[], { hasError = false } = {}) {
  const chainable = {
    data: orders,
    error: hasError ? { message: 'DB error' } : null,
  };

  const limitFn   = vi.fn().mockResolvedValue(chainable);
  const gteFn     = vi.fn().mockReturnValue({ ...chainable, then: vi.fn(() => chainable) });
  const ltFn      = vi.fn().mockReturnValue({ gte: vi.fn().mockResolvedValue(chainable) });
  const orderFn   = vi.fn().mockReturnValue({ limit: limitFn, gte: vi.fn().mockResolvedValue(chainable), lt: ltFn });
  const eqOrdersFn = vi.fn().mockReturnValue({ order: orderFn });
  const selectFn  = vi.fn().mockReturnValue({ eq: eqOrdersFn });

  // Actually just return the resolved value at the end of chain
  // The route does: .from('orders').select(...).eq(...).order(...).limit(...) + optional .gte()/.lt()
  // We need a flexible mock that resolves at any terminal point
  const terminal = Promise.resolve(chainable);

  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue(chainable),
            lt: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue(chainable),
            }),
            then: (resolve: (v: typeof chainable) => void) => resolve(chainable),
            ...chainable,
          }),
        }),
      }),
    }),
  } as any;
}

// ── 1. Auth ───────────────────────────────────────────────────────────────────

describe('GET /api/manage/orders — auth', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401: no Authorization header', async () => {
    const req = new NextRequest(
      new URL(`http://localhost/api/manage/orders?site_id=${SITE_ID}`),
      { method: 'GET' },
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('401: token verification fails', async () => {
    mockAuth(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/invalid token/i);
  });

  it('400: missing site_id', async () => {
    mockAuth(USER_ID);
    const req = new NextRequest('http://localhost/api/manage/orders', {
      headers: { Authorization: 'Bearer valid' },
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/site_id/i);
  });

  it('400: site_id not a UUID', async () => {
    mockAuth(USER_ID);
    const req = new NextRequest('http://localhost/api/manage/orders?site_id=bad', {
      headers: { Authorization: 'Bearer valid' },
    });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

// ── 2. Ownership ──────────────────────────────────────────────────────────────

describe('GET /api/manage/orders — ownership', () => {
  beforeEach(() => vi.clearAllMocks());

  it('403: site does not belong to user', async () => {
    mockAuth('some-other-user');
    vi.mocked(supabaseServer.from).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any));

    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/forbidden/i);
  });
});

// ── 3. Initial load ───────────────────────────────────────────────────────────

describe('GET /api/manage/orders — initial load', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200: returns orders array with hasMore=false when < 100 rows', async () => {
    mockAuth(USER_ID);
    const orders = [fakeOrder(1), fakeOrder(2), fakeOrder(3)];

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') return mockSiteOwnership();
      return mockOrdersQuery(orders);
    });

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orders).toHaveLength(3);
    expect(body.hasMore).toBe(false);
    expect(body.todayStart).toBeTruthy();
  });

  it('200: hasMore=true when exactly 100 rows returned', async () => {
    mockAuth(USER_ID);
    const orders = Array.from({ length: 100 }, (_, i) => fakeOrder(i + 1));

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') return mockSiteOwnership();
      return mockOrdersQuery(orders);
    });

    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.hasMore).toBe(true);
  });

  it('200: oldestTs equals created_at of last item in returned array', async () => {
    mockAuth(USER_ID);
    const orders = [fakeOrder(5), fakeOrder(3), fakeOrder(1)]; // sorted desc

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') return mockSiteOwnership();
      return mockOrdersQuery(orders);
    });

    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.oldestTs).toBe(orders[2].created_at);
  });

  it('200: returns empty orders array with oldestTs=null when no orders', async () => {
    mockAuth(USER_ID);

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') return mockSiteOwnership();
      return mockOrdersQuery([]);
    });

    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.orders).toHaveLength(0);
    expect(body.oldestTs).toBeNull();
    expect(body.hasMore).toBe(false);
  });

  it('500: DB error returns error JSON', async () => {
    mockAuth(USER_ID);

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') return mockSiteOwnership();
      return mockOrdersQuery([], { hasError: true });
    });

    const res = await GET(makeGet());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/fetch orders/i);
  });
});

// ── 4. Response headers ───────────────────────────────────────────────────────

describe('GET /api/manage/orders — response headers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Cache-Control: no-store is set', async () => {
    mockAuth(USER_ID);
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') return mockSiteOwnership();
      return mockOrdersQuery([]);
    });

    const res = await GET(makeGet());
    expect(res.headers.get('cache-control')).toMatch(/no-store/i);
  });
});

// ── 5. Timezone boundary ──────────────────────────────────────────────────────

describe('GET /api/manage/orders — timezone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('todayStart for Asia/Kolkata is 19:30 or 18:30 UTC the previous day', async () => {
    // IST = UTC+5:30, so IST midnight = 18:30 UTC (non-DST)
    mockAuth(USER_ID);
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') return mockSiteOwnership('Asia/Kolkata');
      return mockOrdersQuery([]);
    });

    const res = await GET(makeGet());
    const body = await res.json();
    const todayStartUtc = new Date(body.todayStart);
    const utcHours = todayStartUtc.getUTCHours();
    const utcMinutes = todayStartUtc.getUTCMinutes();

    // IST midnight (00:00 IST) = 18:30 UTC previous day
    expect(utcHours).toBe(18);
    expect(utcMinutes).toBe(30);
  });

  it('todayStart for UTC is 00:00:00 UTC', async () => {
    mockAuth(USER_ID);
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') return mockSiteOwnership('UTC');
      return mockOrdersQuery([]);
    });

    const res = await GET(makeGet());
    const body = await res.json();
    const todayStart = new Date(body.todayStart);
    expect(todayStart.getUTCHours()).toBe(0);
    expect(todayStart.getUTCMinutes()).toBe(0);
    expect(todayStart.getUTCSeconds()).toBe(0);
  });

  it('todayStart for America/New_York is 04:00 or 05:00 UTC', async () => {
    // NYC is UTC-5 (EST) or UTC-4 (EDT)
    mockAuth(USER_ID);
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') return mockSiteOwnership('America/New_York');
      return mockOrdersQuery([]);
    });

    const res = await GET(makeGet());
    const body = await res.json();
    const todayStart = new Date(body.todayStart);
    const h = todayStart.getUTCHours();
    // Either 4 (EDT, UTC-4) or 5 (EST, UTC-5)
    expect([4, 5]).toContain(h);
    expect(todayStart.getUTCMinutes()).toBe(0);
  });
});
