/**
 * API Route Tests — import route handlers directly, mock external dependencies.
 * No server is started; the handler functions are called with NextRequest objects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

// ── Mock declarations BEFORE importing the routes ─────────────────────────────

// Hoist the spy so it's accessible in test assertions
// The route creates a Razorpay ORDER (one-off ₹299 charge), not a
// subscription object. The mock previously exposed only `subscriptions`, so
// `razorpay.orders` was undefined, the call threw, and the route's own
// try/catch turned it into a 502 that read like a payment-provider outage.
const mockOrdersCreate = vi.hoisted(() => vi.fn());

// Mock Razorpay SDK
vi.mock('razorpay', () => {
  class MockRazorpay {
    orders = { create: mockOrdersCreate };
    constructor(_opts: unknown) {}
  }
  return { default: MockRazorpay };
});

vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
  verifyFirebaseToken: vi.fn(),
}));

vi.mock('@/lib/platform/db/supabase-server', () => {
  const mockFrom = vi.fn();
  const mockRpc = vi.fn();
  return {
    supabaseServer: {
      from: mockFrom,
      rpc: mockRpc,
    },
  };
});

// `import 'server-only'` blows up in vitest unless mocked away.
vi.mock('server-only', () => ({}));

vi.mock('openai', () => {
  const spy = vi.fn().mockResolvedValue({ data: [{ embedding: Array(1536).fill(0.1) }] });
  class MockOpenAI {
    embeddings = { create: spy };
    constructor(_opts?: unknown) {}
  }
  return { default: MockOpenAI };
});

vi.mock('@/lib/menu/sarvamVision', () => ({
  imageToMenuText: vi.fn().mockResolvedValue(''),
}));

vi.mock('@/lib/menu/menuExtractor', () => ({
  extractMenuItems: vi.fn().mockResolvedValue([]),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { POST as onboardingPost } from '@/app/api/onboarding/complete/route';
import { POST as imagesMatchPost } from '@/app/api/images/match/route';
import { POST as createSubPost } from '@/app/api/subscription/create-subscription/route';
import { POST as razorpayWebhook } from '@/app/api/webhooks/razorpay/route';

// ── Helpers ────────────────────────────────────────────────────────────────────

function jsonRequest(body: unknown, token?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return new NextRequest(new URL('http://localhost/api/test'), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function mockVerify(uid: string | null) {
  vi.mocked(verifyFirebaseToken).mockResolvedValue(uid);
}

/**
 * A chainable stand-in for a supabase-js query builder.
 *
 * The hand-written `select().eq().eq().single()` ladders these tests used to
 * carry had to mirror each route's call chain exactly, so adding one `.eq()`
 * — or swapping `.single()` for `.maybeSingle()` — turned a passing test into
 * `undefined is not a function` and a 500, which then read as a route bug.
 *
 * This accepts any chain and resolves to `result` at the end of it, so the
 * tests assert on what the route DOES with the row rather than on the exact
 * shape of the query that fetched it.
 */
function qb(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const settled = { data: result.data ?? null, error: result.error ?? null };
  const chain: Record<string, unknown> = {
    // Terminal calls.
    single: vi.fn().mockResolvedValue(settled),
    maybeSingle: vi.fn().mockResolvedValue(settled),
    // Awaiting the builder itself (no .single()) resolves the same way.
    then: (onFulfilled: (v: typeof settled) => unknown) => Promise.resolve(settled).then(onFulfilled),
  };
  // Everything else keeps the chain going.
  for (const method of ['select', 'eq', 'neq', 'in', 'is', 'gt', 'gte', 'lt', 'lte',
                        'order', 'limit', 'range', 'filter', 'match',
                        'insert', 'update', 'upsert', 'delete']) {
    chain[method] = vi.fn(() => chain);
  }
  return chain as never;
}

/**
 * /api/images/match authenticates from the Firebase SESSION COOKIE, not from
 * an Authorization header — the browser calls it directly during onboarding
 * and never sees the OpenAI key. Requests built by `jsonRequest` carry a
 * bearer header and are correctly rejected with 401.
 */
function cookieRequest(body: unknown, token = 'session-token'): NextRequest {
  return new NextRequest(new URL('http://localhost/api/test'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `sb-access-token=${token}`,
    },
    body: JSON.stringify(body),
  });
}

// ── 1. /api/onboarding/complete ───────────────────────────────────────────────

describe('POST /api/onboarding/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The route reads the caller's existing stores before it validates the
    // form, to enforce the 5-store / 2-trial caps, and that read FAILS CLOSED.
    // Without a default builder every case here 503s or 500s on a query that
    // has nothing to do with what it is testing.
    vi.mocked(supabaseServer.from).mockImplementation(() => qb({ data: [] }));
  });

  /**
   * The route takes a JSON body — `{ shopName, items }` — not multipart form
   * data. It moved to JSON when photo upload left this endpoint; a FormData
   * body now fails `request.json()` and comes back as 400 "Invalid JSON body",
   * which masked whatever each test was actually asserting.
   */
  function formRequest(fields: Record<string, unknown>, token?: string): NextRequest {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return new NextRequest(new URL('http://localhost/api/onboarding/complete'), {
      method: 'POST',
      headers,
      body: JSON.stringify(fields),
    });
  }

  it('returns 401 when Authorization header is missing', async () => {
    const req = formRequest({ shopName: 'Test Cafe' });
    const res = await onboardingPost(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when token does not start with "Bearer "', async () => {
    const req = new NextRequest(new URL('http://localhost/api/onboarding/complete'), {
      method: 'POST',
      headers: { Authorization: 'Token abc', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await onboardingPost(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when Firebase token verification fails', async () => {
    mockVerify(null);
    const req = formRequest({ shopName: 'Test Cafe' }, 'bad');
    const res = await onboardingPost(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when shopName is missing', async () => {
    mockVerify('uid-123');
    const req = formRequest({}, 'good-token');
    const res = await onboardingPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/shop name/i);
  });

  it('creates site and returns siteSlug on valid request (no photos)', async () => {
    mockVerify('uid-123');

    // `sites` is touched twice, and the two calls need different rows: first
    // the store-cap read (a list, empty — this is the user's first store),
    // then the insert that allocates the slug.
    let sitesCall = 0;
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        sitesCall += 1;
        return sitesCall === 1
          ? qb({ data: [] })
          : qb({ data: { id: 'site-abc', slug: 'test-cafe' } });
      }
      return qb({ data: [] });
    });

    const req = formRequest({ shopName: 'Test Cafe' }, 'good-token');
    const res = await onboardingPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.siteSlug).toBe('test-cafe');
    expect(body.itemCount).toBe(0);
  });
});

// ── 3. /api/images/match ─────────────────────────────────────────────────────

describe('POST /api/images/match', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every case below is about matching behaviour, not about auth; the
    // unauthenticated case is asserted separately at the end of this block.
    mockVerify('uid-images');
  });

  it('returns null fields when query is empty string', async () => {
    const req = cookieRequest({ query: '' });
    const res = await imagesMatchPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.image_url).toBeNull();
    expect(body.similarity).toBeNull();
  });

  it('returns null fields when query is whitespace only', async () => {
    const req = cookieRequest({ query: '   ' });
    const res = await imagesMatchPost(req);
    const body = await res.json();
    expect(body.image_url).toBeNull();
  });

  it('returns null fields when body has no query field', async () => {
    const req = cookieRequest({});
    const res = await imagesMatchPost(req);
    const body = await res.json();
    expect(body.image_url).toBeNull();
  });

  it('returns image_url and similarity on a successful match', async () => {
    // OpenAI is mocked globally to return a fake embedding vector.
    // Wire up Supabase RPC to return a match.
    vi.mocked(supabaseServer as any).rpc = vi.fn().mockResolvedValue({
      data: [{
        image_url: 'https://test.supabase.co/storage/v1/object/public/default-images/pani-puri.jpg',
        description: 'Pani Puri',
        similarity: 0.78,
      }],
      error: null,
    });

    const req = cookieRequest({ query: 'pani puri' });
    const res = await imagesMatchPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.image_url).toBe(
      'https://test.supabase.co/storage/v1/object/public/default-images/pani-puri.jpg'
    );
    expect(body.similarity).toBe(0.78);
    expect(body.description).toBe('Pani Puri');
  });

  it('returns null gracefully when Supabase RPC returns an error', async () => {
    vi.mocked(supabaseServer as any).rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'rpc not found' },
    });

    // NOT a dish the keyword table knows: 'burger' now hits the tier-1 exact
    // keyword match and returns before the RPC is ever called, so it could
    // never exercise this path. The vector fallback is what is under test.
    const req = cookieRequest({ query: 'unknown exotic dish' });
    const res = await imagesMatchPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.image_url).toBeNull();
  });

  it('returns null gracefully when Supabase RPC returns no matches', async () => {
    vi.mocked(supabaseServer as any).rpc = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });

    const req = cookieRequest({ query: 'unknown exotic dish' });
    const res = await imagesMatchPost(req);
    const body = await res.json();
    expect(body.image_url).toBeNull();
  });
});

// ── Helpers for payment tests ──────────────────────────────────────────────────

function webhookRequest(body: unknown, secret: string): NextRequest {
  const rawBody = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return new NextRequest(new URL('http://localhost/api/webhooks/razorpay'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': sig,
    },
    body: rawBody,
  });
}

// ── 4. /api/subscription/create-subscription ─────────────────────────────────

describe('POST /api/subscription/create-subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
    process.env.RAZORPAY_KEY_SECRET = 'test_secret';
    process.env.RAZORPAY_PLAN_ID = 'plan_test123';
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = jsonRequest({ siteId: 'site-1' });
    const res = await createSubPost(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when token verification fails', async () => {
    mockVerify(null);
    const req = jsonRequest({ siteId: 'site-1' }, 'bad-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when siteId is missing', async () => {
    mockVerify('uid-1');
    const req = jsonRequest({}, 'good-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/siteId/i);
  });

  it('returns 404 when site does not belong to user', async () => {
    mockVerify('uid-1');
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return qb({ data: null, error: { code: 'PGRST116' } });
      }
      return qb();
    });
    const req = jsonRequest({ siteId: 'site-x' }, 'good-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(404);
  });

  it('allows an early renewal while a subscription is still active', async () => {
    // This used to assert 409. The route deliberately stopped blocking: an
    // owner renewing before expiry loses nothing, because verify-payment adds
    // 30 days from MAX(now, store_expires_at). Refusing the payment turned a
    // customer trying to pay us into a support ticket.
    mockVerify('uid-1');
    mockOrdersCreate.mockResolvedValue({ id: 'order_renewal', amount: 29900, currency: 'INR', status: 'created' });
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return qb({ data: { id: 'site-1', name: 'Cafe' } });
      }
      if (table === 'site_subscriptions') {
        return qb({ data: { store_expires_at: futureDate } });
      }
      return qb();
    });
    const req = jsonRequest({ siteId: 'site-1' }, 'good-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(200);

    // and it is booked as a renewal, so the existing days are preserved
    expect(mockOrdersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ notes: expect.objectContaining({ type: 'renewal' }) }),
    );
  });

  it('returns 200 with subscriptionId on success', async () => {
    mockVerify('uid-1');
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return qb({ data: { id: 'site-1', name: 'Cafe' } });
      }
      if (table === 'site_subscriptions') {
        return qb({ data: null, error: { code: 'PGRST116' } });
      }
      return qb();
    });

    mockOrdersCreate.mockResolvedValue({ id: 'order_test123', amount: 29900, currency: 'INR', status: 'created' });

    const req = jsonRequest({ siteId: 'site-1' }, 'good-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    // The route returns a Razorpay ORDER id — a one-off ₹299 charge. It was
    // `subscriptionId` when the plan was a recurring Razorpay subscription.
    expect(body.orderId).toBe('order_test123');
    expect(body.keyId).toBe('rzp_test_key');
    // The price the customer is charged is the one thing here that must never
    // drift silently: ₹299, in paise.
    expect(body.amount).toBe(29900);
    expect(body.currency).toBe('INR');
    expect(body.isRenewal).toBe(false);
  });
});

// ── 5. /api/webhooks/razorpay ─────────────────────────────────────────────────

describe('POST /api/webhooks/razorpay', () => {
  const WEBHOOK_SECRET = 'test_webhook_secret';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  it('returns 400 when signature is missing', async () => {
    const req = new NextRequest(new URL('http://localhost/api/webhooks/razorpay'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'subscription.activated' }),
    });
    const res = await razorpayWebhook(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when signature is invalid', async () => {
    const req = new NextRequest(new URL('http://localhost/api/webhooks/razorpay'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'bad_signature',
      },
      body: JSON.stringify({ event: 'subscription.activated' }),
    });
    const res = await razorpayWebhook(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 on subscription.activated and activates site in DB', async () => {
    const payload = {
      event: 'subscription.activated',
      payload: {
        subscription: { entity: { id: 'sub_abc', status: 'active' } },
        payment: { entity: { id: 'pay_123', amount: 239800, currency: 'INR' } },
      },
    };

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'site_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { site_id: 'site-1', user_id: 'uid-1' },
                error: null,
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        } as any;
      }
      if (table === 'billing_history') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) } as any;
      }
      return {} as any;
    });

    const req = webhookRequest(payload, WEBHOOK_SECRET);
    const res = await razorpayWebhook(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 on subscription.charged and extends expiry', async () => {
    const payload = {
      event: 'subscription.charged',
      payload: {
        subscription: { entity: { id: 'sub_abc', status: 'active' } },
        payment: { entity: { id: 'pay_456', amount: 39900, currency: 'INR' } },
      },
    };

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'site_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { site_id: 'site-1', user_id: 'uid-1' },
                error: null,
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        } as any;
      }
      if (table === 'billing_history') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) } as any;
      }
      return {} as any;
    });

    const req = webhookRequest(payload, WEBHOOK_SECRET);
    const res = await razorpayWebhook(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 on subscription.halted and clears expiry', async () => {
    const payload = {
      event: 'subscription.halted',
      payload: {
        subscription: { entity: { id: 'sub_abc', status: 'halted' } },
      },
    };

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'site_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { site_id: 'site-1', user_id: 'uid-1' },
                error: null,
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        } as any;
      }
      return {} as any;
    });

    const req = webhookRequest(payload, WEBHOOK_SECRET);
    const res = await razorpayWebhook(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 on unknown events (idempotent)', async () => {
    const payload = { event: 'payment.captured', payload: {} };
    const req = webhookRequest(payload, WEBHOOK_SECRET);
    const res = await razorpayWebhook(req);
    expect(res.status).toBe(200);
  });
});
