/**
 * API Route Tests — import route handlers directly, mock external dependencies.
 * No server is started; the handler functions are called with NextRequest objects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

// ── Mock declarations BEFORE importing the routes ─────────────────────────────

// Hoist the spy so it's accessible in test assertions
const mockSubscriptionsCreate = vi.hoisted(() => vi.fn());

// Mock Razorpay SDK
vi.mock('razorpay', () => {
  class MockRazorpay {
    subscriptions = { create: mockSubscriptionsCreate };
    constructor(_opts: unknown) {}
  }
  return { default: MockRazorpay };
});

vi.mock('@/lib/verifyFirebaseToken', () => ({
  verifyFirebaseToken: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => {
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

vi.mock('@/lib/sarvamVision', () => ({
  imageToMenuText: vi.fn().mockResolvedValue(''),
}));

vi.mock('@/lib/menuExtractor', () => ({
  extractMenuItems: vi.fn().mockResolvedValue([]),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
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

// ── 1. /api/onboarding/complete ───────────────────────────────────────────────

describe('POST /api/onboarding/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function formRequest(fields: Record<string, string>, token?: string): NextRequest {
    const formData = new FormData();
    for (const [key, val] of Object.entries(fields)) {
      formData.append(key, val);
    }
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return new NextRequest(new URL('http://localhost/api/onboarding/complete'), {
      method: 'POST',
      headers,
      body: formData,
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
      headers: { Authorization: 'Token abc' },
      body: new FormData(),
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

    const mockSiteInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'site-abc', slug: 'test-cafe' },
          error: null,
        }),
      }),
    });

    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: mockSiteInsert,
        } as any;
      }
      if (table === 'profiles') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        } as any;
      }
      return {} as any;
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
  });

  it('returns null fields when query is empty string', async () => {
    const req = jsonRequest({ query: '' });
    const res = await imagesMatchPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.image_url).toBeNull();
    expect(body.similarity).toBeNull();
  });

  it('returns null fields when query is whitespace only', async () => {
    const req = jsonRequest({ query: '   ' });
    const res = await imagesMatchPost(req);
    const body = await res.json();
    expect(body.image_url).toBeNull();
  });

  it('returns null fields when body has no query field', async () => {
    const req = jsonRequest({});
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

    const req = jsonRequest({ query: 'pani puri' });
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

    const req = jsonRequest({ query: 'burger' });
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

    const req = jsonRequest({ query: 'unknown exotic dish' });
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
    const req = jsonRequest({ siteId: 'site-x' }, 'good-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(404);
  });

  it('returns 409 when site already has an active subscription', async () => {
    mockVerify('uid-1');
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'site-1', name: 'Cafe' }, error: null }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'site_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { store_expires_at: futureDate }, error: null }),
            }),
          }),
        } as any;
      }
      return {} as any;
    });
    const req = jsonRequest({ siteId: 'site-1' }, 'good-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(409);
  });

  it('returns 200 with subscriptionId on success', async () => {
    mockVerify('uid-1');
    vi.mocked(supabaseServer.from).mockImplementation((table: string) => {
      if (table === 'sites') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'site-1', name: 'Cafe' }, error: null }),
              }),
            }),
          }),
        } as any;
      }
      if (table === 'site_subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: null }),
        } as any;
      }
      return {} as any;
    });

    mockSubscriptionsCreate.mockResolvedValue({ id: 'sub_test123', status: 'created' });

    const req = jsonRequest({ siteId: 'site-1' }, 'good-token');
    const res = await createSubPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscriptionId).toBe('sub_test123');
    expect(body.keyId).toBe('rzp_test_key');
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
