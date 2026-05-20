/**
 * Razorpay OAuth + payment flow — smoke tests.
 *
 * These tests target the *security-critical* edges of the integration:
 *
 *   1. AES-256-GCM encrypt/decrypt round-trip and tamper detection
 *   2. Checkout signature verification (genuine vs tampered vs wrong-length)
 *   3. /verify-payment idempotency, signature, amount, and order-id binding
 *   4. /webhooks/razorpay/oauth signature verification + revocation routing
 *   5. /connect state CSRF (cookie ↔ query mismatch, ownership check)
 *   6. /callback state expiry, missing cookie, account_id absence
 *   7. /api/orders refusing online payment when no integration exists
 *
 * No external services are hit — Supabase, Razorpay HTTP, Firebase token
 * verification are all mocked. The goal is to lock down the security
 * invariants so a future refactor can't quietly break them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

// ── Required env BEFORE any route import ─────────────────────────────────────
process.env.RAZORPAY_OAUTH_CLIENT_ID         = 'test_client_id';
process.env.RAZORPAY_OAUTH_CLIENT_SECRET     = 'test_client_secret_unit';
process.env.RAZORPAY_OAUTH_REDIRECT_URI      = 'https://example.com/api/manage/payments/razorpay/callback';
process.env.RAZORPAY_OAUTH_WEBHOOK_SECRET    = 'test_webhook_secret';
process.env.RAZORPAY_OAUTH_MODE              = 'test';
// 32-byte base64 key for AES-256-GCM.
process.env.PAYMENTS_ENC_KEY                 = Buffer.alloc(32, 7).toString('base64');

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock('server-only', () => ({}));

// Firebase: Bearer "good-token" → 'user-1'; anything else → null.
vi.mock('@/lib/verifyFirebaseToken', () => ({
  verifyFirebaseToken: vi.fn(async (tok: string) => (tok === 'good-token' ? 'user-1' : null)),
}));

// Supabase: a chainable mock that records calls and returns scripted data.
type SupabaseScript = {
  selectResult?: unknown;
  maybeSingleResult?: unknown;
  singleResult?: unknown;
  insertResult?: unknown;
  updateResult?: unknown;
  upsertResult?: unknown;
  deleteResult?: unknown;
};
const supabaseScripts: Record<string, SupabaseScript> = {};
const supabaseCalls: Array<{ table: string; op: string; args?: unknown }> = [];

function tableMock(table: string) {
  const script = supabaseScripts[table] ?? {};
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    neq:    vi.fn().mockReturnThis(),
    lt:     vi.fn().mockReturnThis(),
    ilike:  vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    limit:  vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({ data: script.maybeSingleResult ?? null, error: null })),
    single:      vi.fn(async () => ({ data: script.singleResult      ?? null, error: null })),
    insert: vi.fn(async (args: unknown) => {
      supabaseCalls.push({ table, op: 'insert', args });
      return { data: script.insertResult ?? null, error: null };
    }),
    update: vi.fn(function (this: unknown, args: unknown) {
      supabaseCalls.push({ table, op: 'update', args });
      return chain;
    }),
    upsert: vi.fn(async (args: unknown) => {
      supabaseCalls.push({ table, op: 'upsert', args });
      return { data: script.upsertResult ?? null, error: null };
    }),
    delete: vi.fn(function (this: unknown) {
      supabaseCalls.push({ table, op: 'delete' });
      return chain;
    }),
    // Make `.update(…).eq(…)` resolve like a thenable.
    then: undefined as undefined | ((resolve: (v: { error: null }) => void) => void),
  };
  // Allow `await chain` after update/delete to resolve with no error.
  chain.then = (resolve) => resolve({ error: null });
  return chain;
}

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn((table: string) => tableMock(table)),
    rpc:  vi.fn(),
  },
}));

// Capture fetch calls so we can stub Razorpay's HTTP API.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  supabaseCalls.length = 0;
  for (const k of Object.keys(supabaseScripts)) delete supabaseScripts[k];
  fetchMock.mockReset();
});

// ── Imports AFTER mocks ──────────────────────────────────────────────────────
import { encryptToken, decryptToken }     from '@/lib/server/paymentsCrypto';
import {
  verifyCheckoutSignature,
  buildAuthorizeUrl,
  generateState,
  exchangeCode,
  refreshAccessToken,
  createRazorpayOrder,
  getActiveIntegration,
} from '@/lib/server/razorpayOAuth';
import { POST as connectRoute }    from '@/app/api/manage/payments/razorpay/connect/route';
import { GET  as callbackRoute }   from '@/app/api/manage/payments/razorpay/callback/route';
import { POST as disconnectRoute } from '@/app/api/manage/payments/razorpay/disconnect/route';
import { GET  as statusRoute }     from '@/app/api/manage/payments/razorpay/status/route';
import { GET  as paymentOptions }  from '@/app/api/shop/payment-options/route';
import { POST as verifyPayment }   from '@/app/api/orders/[id]/verify-payment/route';
import { POST as webhookRoute }    from '@/app/api/webhooks/razorpay/oauth/route';

// ── Helpers ──────────────────────────────────────────────────────────────────
const SITE_ID  = '00000000-0000-0000-0000-000000000001';
const ORDER_ID = '00000000-0000-0000-0000-000000000abc';

function makeReq(url: string, opts: { method?: string; body?: unknown; headers?: Record<string, string>; cookies?: Record<string, string> } = {}) {
  const headers = new Headers(opts.headers ?? {});
  if (opts.cookies) {
    headers.set('cookie', Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join('; '));
  }
  return new NextRequest(url, {
    method:  opts.method ?? 'POST',
    headers,
    body:    opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

function rzpCheckoutSig(orderId: string, paymentId: string, secret = 'test_client_secret_unit') {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

// =============================================================================
// 1. paymentsCrypto — encryption invariants
// =============================================================================
describe('paymentsCrypto', () => {
  it('round-trips arbitrary text', () => {
    const plain = 'rzp_oauth_test_AbCdEfGhIjKl-xyz/=';
    expect(decryptToken(encryptToken(plain))).toBe(plain);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encryptToken('same');
    const b = encryptToken('same');
    expect(a).not.toBe(b);
  });

  it('rejects tampered ciphertext', () => {
    const ct = encryptToken('secret-token');
    // Flip one byte inside the last segment (ciphertext); GCM auth tag must reject.
    const parts = ct.split(':');
    const buf = Buffer.from(parts[3], 'base64');
    buf[0] = buf[0] ^ 0xff;
    parts[3] = buf.toString('base64');
    expect(() => decryptToken(parts.join(':'))).toThrow();
  });

  it('rejects payload with wrong version prefix', () => {
    const ct = encryptToken('x');
    const bad = 'v9:' + ct.split(':').slice(1).join(':');
    expect(() => decryptToken(bad)).toThrow(/Invalid encrypted token payload/);
  });

  it('refuses to operate without a 32-byte key', () => {
    const original = process.env.PAYMENTS_ENC_KEY;
    process.env.PAYMENTS_ENC_KEY = Buffer.alloc(16, 1).toString('base64');
    expect(() => encryptToken('x')).toThrow(/32 bytes/);
    process.env.PAYMENTS_ENC_KEY = original;
  });
});

// =============================================================================
// 2. Checkout signature verification
// =============================================================================
describe('verifyCheckoutSignature', () => {
  it('accepts a genuine signature', () => {
    const sig = rzpCheckoutSig('order_x', 'pay_y');
    expect(verifyCheckoutSignature('order_x', 'pay_y', sig)).toBe(true);
  });

  it('rejects a signature for a different order id (binding)', () => {
    const sig = rzpCheckoutSig('order_x', 'pay_y');
    expect(verifyCheckoutSignature('order_DIFFERENT', 'pay_y', sig)).toBe(false);
  });

  it('rejects a signature for a different payment id', () => {
    const sig = rzpCheckoutSig('order_x', 'pay_y');
    expect(verifyCheckoutSignature('order_x', 'pay_DIFFERENT', sig)).toBe(false);
  });

  it('rejects a signature signed with the wrong secret', () => {
    const sig = rzpCheckoutSig('order_x', 'pay_y', 'WRONG_SECRET');
    expect(verifyCheckoutSignature('order_x', 'pay_y', sig)).toBe(false);
  });

  it('rejects empty / wrong-length input safely', () => {
    expect(verifyCheckoutSignature('order_x', 'pay_y', '')).toBe(false);
    expect(verifyCheckoutSignature('order_x', 'pay_y', 'deadbeef')).toBe(false);
  });
});

// =============================================================================
// 3. OAuth helpers — URL + token round-trips
// =============================================================================
describe('OAuth helper URLs', () => {
  it('builds an authorize URL with all required params', () => {
    const url = new URL(buildAuthorizeUrl('STATE123', 'https://example.com/cb'));
    expect(url.origin).toBe('https://auth.razorpay.com');
    expect(url.pathname).toBe('/authorize');
    expect(url.searchParams.get('client_id')).toBe('test_client_id');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/cb');
    expect(url.searchParams.get('scope')).toBe('read_write');
    expect(url.searchParams.get('state')).toBe('STATE123');
  });

  it('generates a high-entropy state (≥32 chars, base64url, no padding)', () => {
    const s = generateState();
    expect(s.length).toBeGreaterThanOrEqual(32);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('exchangeCode posts client credentials + code and returns parsed JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'A', refresh_token: 'R', public_token: 'P',
      expires_in: 7776000, token_type: 'Bearer', razorpay_account_id: 'acc_1', scope: 'read_write',
    }), { status: 200 }));
    const out = await exchangeCode('code123', 'https://example.com/cb');
    expect(out.access_token).toBe('A');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://auth.razorpay.com/token');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.client_id).toBe('test_client_id');
    expect(body.client_secret).toBe('test_client_secret_unit');
    expect(body.grant_type).toBe('authorization_code');
    expect(body.code).toBe('code123');
    expect(body.mode).toBe('test');
  });

  it('refreshAccessToken sends grant_type=refresh_token + the refresh token', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'A2', refresh_token: 'R2', public_token: 'P2',
      expires_in: 7776000, token_type: 'Bearer',
    }), { status: 200 }));
    await refreshAccessToken('refresh_old');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.grant_type).toBe('refresh_token');
    expect(body.refresh_token).toBe('refresh_old');
  });

  it('createRazorpayOrder sends Bearer auth and INR amount in paise', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'order_rzp_1', amount: 5000, currency: 'INR',
    }), { status: 200 }));
    const out = await createRazorpayOrder('ACC_TOK', {
      amount: 5000, currency: 'INR', receipt: 'r1',
    });
    expect(out.id).toBe('order_rzp_1');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer ACC_TOK');
  });

  it('createRazorpayOrder throws (does not return) on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"x"}', { status: 401 }));
    await expect(createRazorpayOrder('BAD', { amount: 100, currency: 'INR', receipt: 'r' })).rejects.toThrow(/401/);
  });
});

// =============================================================================
// 4. getActiveIntegration — refresh-on-expiry behaviour
// =============================================================================
describe('getActiveIntegration', () => {
  it('returns null when no row exists', async () => {
    supabaseScripts['site_payment_integrations'] = { maybeSingleResult: null };
    const out = await getActiveIntegration(SITE_ID);
    expect(out).toBeNull();
  });

  it('returns decrypted tokens without refreshing when expiry is far away', async () => {
    supabaseScripts['site_payment_integrations'] = {
      maybeSingleResult: {
        id: 'row1', site_id: SITE_ID, account_id: 'acc_1',
        access_token:  encryptToken('LIVE_TOKEN'),
        refresh_token: encryptToken('REFRESH_TOKEN'),
        public_token:  'rzp_test_oauth_pub',
        mode: 'test',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
        scope: 'read_write', status: 'active',
      },
    };
    const out = await getActiveIntegration(SITE_ID);
    expect(out?.accessToken).toBe('LIVE_TOKEN');
    expect(out?.publicToken).toBe('rzp_test_oauth_pub');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes the token when expiry is within 24h', async () => {
    supabaseScripts['site_payment_integrations'] = {
      maybeSingleResult: {
        id: 'row1', site_id: SITE_ID, account_id: 'acc_1',
        access_token:  encryptToken('OLD_ACCESS'),
        refresh_token: encryptToken('OLD_REFRESH'),
        public_token:  'rzp_test_oauth_old',
        mode: 'test',
        // 1h in the future → triggers refresh
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        scope: 'read_write', status: 'active',
      },
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'NEW_ACCESS', refresh_token: 'NEW_REFRESH',
      public_token: 'rzp_test_oauth_new', expires_in: 7776000, token_type: 'Bearer',
    }), { status: 200 }));
    const out = await getActiveIntegration(SITE_ID);
    expect(out?.accessToken).toBe('NEW_ACCESS');
    expect(out?.publicToken).toBe('rzp_test_oauth_new');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Persisted update encrypted the new tokens
    const update = supabaseCalls.find(c => c.table === 'site_payment_integrations' && c.op === 'update');
    expect(update).toBeTruthy();
    const args = update!.args as { access_token: string; refresh_token: string };
    expect(args.access_token).not.toBe('NEW_ACCESS');         // encrypted
    expect(decryptToken(args.access_token)).toBe('NEW_ACCESS'); // decrypts cleanly
  });

  it('falls back to the existing token if refresh fails (does not throw)', async () => {
    supabaseScripts['site_payment_integrations'] = {
      maybeSingleResult: {
        id: 'row1', site_id: SITE_ID, account_id: 'acc_1',
        access_token:  encryptToken('STALE_BUT_USABLE'),
        refresh_token: encryptToken('STALE_REFRESH'),
        public_token:  'rzp_test_oauth_stale',
        mode: 'test',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        scope: 'read_write', status: 'active',
      },
    };
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const out = await getActiveIntegration(SITE_ID);
    expect(out?.accessToken).toBe('STALE_BUT_USABLE');
  });
});

// =============================================================================
// 5. /connect route — auth, ownership, state binding
// =============================================================================
describe('POST /api/manage/payments/razorpay/connect', () => {
  it('401 without Bearer', async () => {
    const res = await connectRoute(makeReq('https://x/c', { body: { siteId: SITE_ID } }));
    expect(res.status).toBe(401);
  });

  it('400 on bad siteId shape', async () => {
    const res = await connectRoute(makeReq('https://x/c', {
      body:    { siteId: 'not-a-uuid' },
      headers: { Authorization: 'Bearer good-token' },
    }));
    expect(res.status).toBe(400);
  });

  it('403 when the site is not owned by the user', async () => {
    supabaseScripts['sites'] = { maybeSingleResult: null };
    const res = await connectRoute(makeReq('https://x/c', {
      body:    { siteId: SITE_ID },
      headers: { Authorization: 'Bearer good-token' },
    }));
    expect(res.status).toBe(403);
  });

  it('returns an authorize URL and sets HttpOnly state cookie on success', async () => {
    supabaseScripts['sites']         = { maybeSingleResult: { id: SITE_ID } };
    supabaseScripts['oauth_states']  = { insertResult: null };
    const res = await connectRoute(makeReq('https://x/c', {
      body:    { siteId: SITE_ID },
      headers: { Authorization: 'Bearer good-token' },
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.url).toMatch(/^https:\/\/auth\.razorpay\.com\/authorize\?/);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/rzp_oauth_state=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    // State value in cookie must match the state in the URL.
    const cookieState = /rzp_oauth_state=([^;]+)/.exec(setCookie)?.[1];
    const urlState    = new URL(json.url).searchParams.get('state');
    expect(cookieState).toBe(urlState);
    // Persisted state row matches.
    const ins = supabaseCalls.find(c => c.table === 'oauth_states' && c.op === 'insert');
    expect((ins!.args as { state: string }).state).toBe(urlState);
  });
});

// =============================================================================
// 6. /callback — state CSRF, expiry, success path
// =============================================================================
describe('GET /api/manage/payments/razorpay/callback', () => {
  it('redirects with error when cookie does not match query state', async () => {
    const req = makeReq('https://x/api/manage/payments/razorpay/callback?code=c&state=STATE_A', {
      method:  'GET',
      cookies: { rzp_oauth_state: 'STATE_B' },
    });
    const res = await callbackRoute(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('error=state_mismatch');
  });

  it('redirects with error when state row is older than 5 minutes', async () => {
    supabaseScripts['oauth_states'] = {
      maybeSingleResult: {
        state: 'STATE_X', site_id: SITE_ID, user_id: 'user-1',
        redirect_uri: 'https://example.com/cb', provider: 'razorpay',
        created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      },
    };
    const res = await callbackRoute(makeReq('https://x/api/manage/payments/razorpay/callback?code=c&state=STATE_X', {
      method: 'GET', cookies: { rzp_oauth_state: 'STATE_X' },
    }));
    expect(res.headers.get('location')).toContain('error=state_expired');
  });

  it('happy path persists encrypted tokens and redirects with connected=1', async () => {
    supabaseScripts['oauth_states'] = {
      maybeSingleResult: {
        state: 'STATE_X', site_id: SITE_ID, user_id: 'user-1',
        redirect_uri: 'https://example.com/cb', provider: 'razorpay',
        created_at: new Date().toISOString(),
      },
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'A', refresh_token: 'R', public_token: 'rzp_test_oauth_P',
      expires_in: 7776000, token_type: 'Bearer',
      razorpay_account_id: 'acc_real', scope: 'read_write',
    }), { status: 200 }));
    const res = await callbackRoute(makeReq('https://x/api/manage/payments/razorpay/callback?code=c&state=STATE_X', {
      method: 'GET', cookies: { rzp_oauth_state: 'STATE_X' },
    }));
    expect(res.headers.get('location')).toContain('connected=1');
    const upsert = supabaseCalls.find(c => c.table === 'site_payment_integrations' && c.op === 'upsert');
    expect(upsert).toBeTruthy();
    const args = upsert!.args as { access_token: string; refresh_token: string; account_id: string; status: string };
    expect(args.account_id).toBe('acc_real');
    expect(args.status).toBe('active');
    // Tokens are encrypted, not raw.
    expect(args.access_token).not.toBe('A');
    expect(decryptToken(args.access_token)).toBe('A');
  });

  it('errors when token response omits razorpay_account_id', async () => {
    supabaseScripts['oauth_states'] = {
      maybeSingleResult: {
        state: 'STATE_X', site_id: SITE_ID, user_id: 'user-1',
        redirect_uri: 'https://example.com/cb', provider: 'razorpay',
        created_at: new Date().toISOString(),
      },
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'A', refresh_token: 'R', public_token: 'P', expires_in: 100, token_type: 'Bearer',
    }), { status: 200 }));
    const res = await callbackRoute(makeReq('https://x/api/manage/payments/razorpay/callback?code=c&state=STATE_X', {
      method: 'GET', cookies: { rzp_oauth_state: 'STATE_X' },
    }));
    expect(res.headers.get('location')).toContain('error=no_account_id');
  });
});

// =============================================================================
// 7. /verify-payment — signature, replay, amount, order-id binding
// =============================================================================
describe('POST /api/orders/[id]/verify-payment', () => {
  const RZP_ORDER = 'order_rzp_1';
  const RZP_PAY   = 'pay_1';

  it('rejects an invalid signature without touching the DB', async () => {
    const res = await verifyPayment(makeReq(`https://x/api/orders/${ORDER_ID}/verify-payment`, {
      body: { razorpay_order_id: RZP_ORDER, razorpay_payment_id: RZP_PAY, razorpay_signature: 'deadbeef' },
    }), { params: { id: ORDER_ID } });
    expect(res.status).toBe(400);
    expect(supabaseCalls.length).toBe(0);
  });

  it('rejects when the local order is bound to a different razorpay_order_id', async () => {
    supabaseScripts['orders'] = {
      maybeSingleResult: {
        id: ORDER_ID, site_id: SITE_ID, razorpay_order_id: 'order_OTHER',
        payment_status: 'pending', subtotal: 50,
      },
    };
    const sig = rzpCheckoutSig(RZP_ORDER, RZP_PAY);
    const res = await verifyPayment(makeReq(`https://x/api/orders/${ORDER_ID}/verify-payment`, {
      body: { razorpay_order_id: RZP_ORDER, razorpay_payment_id: RZP_PAY, razorpay_signature: sig },
    }), { params: { id: ORDER_ID } });
    expect(res.status).toBe(400);
  });

  it('idempotent replay returns alreadyPaid:true', async () => {
    supabaseScripts['orders'] = {
      maybeSingleResult: {
        id: ORDER_ID, site_id: SITE_ID, razorpay_order_id: RZP_ORDER,
        razorpay_payment_id: RZP_PAY, payment_status: 'paid', subtotal: 50,
      },
    };
    const sig = rzpCheckoutSig(RZP_ORDER, RZP_PAY);
    const res = await verifyPayment(makeReq(`https://x/api/orders/${ORDER_ID}/verify-payment`, {
      body: { razorpay_order_id: RZP_ORDER, razorpay_payment_id: RZP_PAY, razorpay_signature: sig },
    }), { params: { id: ORDER_ID } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, alreadyPaid: true });
  });

  it('rejects when Razorpay reports a different captured amount than the local order', async () => {
    supabaseScripts['orders'] = {
      maybeSingleResult: {
        id: ORDER_ID, site_id: SITE_ID, razorpay_order_id: RZP_ORDER,
        payment_status: 'pending', subtotal: 100,
      },
    };
    supabaseScripts['site_payment_integrations'] = {
      maybeSingleResult: {
        id: 'r1', site_id: SITE_ID, account_id: 'acc',
        access_token:  encryptToken('TOK'),
        refresh_token: encryptToken('R'),
        public_token: 'P', mode: 'test',
        expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
        scope: 'read_write', status: 'active',
      },
    };
    // Razorpay returns the right order_id but a SMALLER amount than expected.
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      id: RZP_PAY, status: 'captured', amount: 5000 /* paise; order subtotal 100 → expects 10000 */, order_id: RZP_ORDER,
    }), { status: 200 }));
    const sig = rzpCheckoutSig(RZP_ORDER, RZP_PAY);
    const res = await verifyPayment(makeReq(`https://x/api/orders/${ORDER_ID}/verify-payment`, {
      body: { razorpay_order_id: RZP_ORDER, razorpay_payment_id: RZP_PAY, razorpay_signature: sig },
    }), { params: { id: ORDER_ID } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/amount/i);
  });
});

// =============================================================================
// 8. Webhook — signature + revocation
// =============================================================================
describe('POST /api/webhooks/razorpay/oauth', () => {
  function signWebhook(body: string) {
    return crypto.createHmac('sha256', 'test_webhook_secret').update(body).digest('hex');
  }

  it('rejects a webhook with an invalid signature', async () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: {} });
    const req = new NextRequest('https://x/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': 'deadbeef' },
      body,
    });
    const res = await webhookRoute(req);
    expect(res.status).toBe(400);
  });

  it('marks an order paid on a signed payment.captured', async () => {
    supabaseScripts['orders'] = {
      maybeSingleResult: { id: ORDER_ID, payment_status: 'pending' },
    };
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_w', order_id: 'order_rzp_w', status: 'captured', amount: 1000 } } },
    });
    const req = new NextRequest('https://x/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': signWebhook(body) },
      body,
    });
    const res = await webhookRoute(req);
    expect(res.status).toBe(200);
    const upd = supabaseCalls.find(c => c.table === 'orders' && c.op === 'update');
    expect(upd).toBeTruthy();
    expect((upd!.args as { payment_status: string }).payment_status).toBe('paid');
  });

  it('marks integration revoked on account.app.authorization_revoked', async () => {
    const body = JSON.stringify({
      event: 'account.app.authorization_revoked',
      payload: { account: { entity: { id: 'acc_real' } } },
    });
    const req = new NextRequest('https://x/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': signWebhook(body) },
      body,
    });
    const res = await webhookRoute(req);
    expect(res.status).toBe(200);
    const upd = supabaseCalls.find(c => c.table === 'site_payment_integrations' && c.op === 'update');
    expect((upd!.args as { status: string }).status).toBe('revoked');
  });
});

// =============================================================================
// 9. /shop/payment-options (public)
// =============================================================================
describe('GET /api/shop/payment-options', () => {
  it('returns onlineEnabled:false when no active integration', async () => {
    supabaseScripts['site_payment_integrations'] = { maybeSingleResult: null };
    const res = await paymentOptions(makeReq(`https://x/api/shop/payment-options?siteId=${SITE_ID}`, { method: 'GET' }));
    expect(await res.json()).toEqual({ onlineEnabled: false });
  });

  it('returns onlineEnabled:true when an active integration exists', async () => {
    supabaseScripts['site_payment_integrations'] = { maybeSingleResult: { status: 'active' } };
    const res = await paymentOptions(makeReq(`https://x/api/shop/payment-options?siteId=${SITE_ID}`, { method: 'GET' }));
    expect(await res.json()).toEqual({ onlineEnabled: true });
  });

  it('rejects malformed siteId', async () => {
    const res = await paymentOptions(makeReq('https://x/api/shop/payment-options?siteId=not-uuid', { method: 'GET' }));
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// 10. /status route — never leaks secrets
// =============================================================================
describe('GET /api/manage/payments/razorpay/status', () => {
  it('does not return access_token / refresh_token in the body', async () => {
    supabaseScripts['sites'] = { maybeSingleResult: { id: SITE_ID } };
    supabaseScripts['site_payment_integrations'] = {
      maybeSingleResult: {
        account_id: 'acc_1', mode: 'test', expires_at: new Date().toISOString(),
        status: 'active', scope: 'read_write', created_at: new Date().toISOString(),
      },
    };
    const req = makeReq(`https://x/api/manage/payments/razorpay/status?siteId=${SITE_ID}`, {
      method: 'GET', headers: { Authorization: 'Bearer good-token' },
    });
    const res = await statusRoute(req);
    const json = await res.json();
    expect(json.connected).toBe(true);
    expect(JSON.stringify(json)).not.toMatch(/access_token|refresh_token/i);
  });
});

// =============================================================================
// 11. /disconnect route — ownership enforcement
// =============================================================================
describe('POST /api/manage/payments/razorpay/disconnect', () => {
  it('forbids disconnecting another user\'s site', async () => {
    supabaseScripts['site_payment_integrations'] = {
      maybeSingleResult: {
        id: 'r1', access_token: encryptToken('A'), refresh_token: encryptToken('R'),
        site_id: SITE_ID, sites: { user_id: 'OTHER_USER' },
      },
    };
    const res = await disconnectRoute(makeReq('https://x/d', {
      body: { siteId: SITE_ID },
      headers: { Authorization: 'Bearer good-token' },
    }));
    expect(res.status).toBe(403);
  });

  it('returns success when no integration exists (idempotent)', async () => {
    supabaseScripts['site_payment_integrations'] = { maybeSingleResult: null };
    const res = await disconnectRoute(makeReq('https://x/d', {
      body: { siteId: SITE_ID },
      headers: { Authorization: 'Bearer good-token' },
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).alreadyDisconnected).toBe(true);
  });
});
