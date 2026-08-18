import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-server', () => ({ supabaseServer: {} }));
vi.mock('@/lib/rateLimit', () => ({ rateLimit: () => ({ allowed: true, retryAfterMs: 0 }) }));
vi.mock('@/lib/verifyFirebaseToken', () => ({ verifyFirebaseToken: async () => 'u1' }));

import { NextRequest } from 'next/server';

const mk = (url: string, body?: unknown) =>
  new NextRequest(new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
    body: JSON.stringify(body ?? {}),
  }));

describe('frozen ordering routes return 403', () => {
  it('POST /api/orders', async () => {
    const { POST } = await import('@/app/api/orders/route');
    const res = await POST(mk('http://localhost/api/orders', { siteId: 's' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FEATURE_FROZEN');
  });

  it('POST /api/orders/whatsapp', async () => {
    const { POST } = await import('@/app/api/orders/whatsapp/route');
    expect((await POST(mk('http://localhost/api/orders/whatsapp'))).status).toBe(403);
  });

  it('POST /api/bill-request', async () => {
    const { POST } = await import('@/app/api/bill-request/route');
    expect((await POST(mk('http://localhost/api/bill-request'))).status).toBe(403);
  });

  it('GET /api/manage/orders', async () => {
    const { GET } = await import('@/app/api/manage/orders/route');
    expect((await GET(mk('http://localhost/api/manage/orders'))).status).toBe(403);
  });
});

describe('billing stays live', () => {
  it('refuses to sell a frozen plan', async () => {
    process.env.RAZORPAY_KEY_ID = 'k';
    process.env.RAZORPAY_KEY_SECRET = 's';
    const { POST } = await import('@/app/api/subscription/create-subscription/route');
    const res = await POST(mk('http://localhost/api/subscription/create-subscription',
      { siteId: 'site-1', plan: 'qr_order' }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PLAN_NOT_SELLABLE');
  });
});
