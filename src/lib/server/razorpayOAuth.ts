import 'server-only';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase-server';
import { encryptToken, decryptToken } from './paymentsCrypto';

// Razorpay OAuth (Partner Connect) helpers.
// Docs: https://razorpay.com/docs/partners/technology-partners/onboard-businesses/integrate-oauth/integration-steps/

const AUTH_BASE  = 'https://auth.razorpay.com';
const API_BASE   = 'https://api.razorpay.com';

// Scope required to create orders, accept payments, and issue refunds on
// behalf of the sub-merchant. Razorpay only supports a single scope per app.
export const RAZORPAY_SCOPE = 'read_write';

// Refresh proactively if the token expires within this many seconds. Tokens
// have a 90-day life so a 24h buffer is comfortable.
const REFRESH_BUFFER_SEC = 24 * 60 * 60;

interface TokenResponse {
  access_token: string;
  public_token: string;
  refresh_token: string;
  expires_in: number;           // seconds
  razorpay_account_id?: string; // present on initial exchange
  token_type: string;
  scope?: string;
}

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function getMode(): 'test' | 'live' {
  const m = (process.env.RAZORPAY_OAUTH_MODE ?? 'test').toLowerCase();
  return m === 'live' ? 'live' : 'test';
}

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id:     envOrThrow('RAZORPAY_OAUTH_CLIENT_ID'),
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         RAZORPAY_SCOPE,
    state,
  });
  return `${AUTH_BASE}/authorize?${params.toString()}`;
}

export function generateState(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     envOrThrow('RAZORPAY_OAUTH_CLIENT_ID'),
      client_secret: envOrThrow('RAZORPAY_OAUTH_CLIENT_SECRET'),
      grant_type:    'authorization_code',
      redirect_uri:  redirectUri,
      code,
      mode:          getMode(),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Razorpay token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     envOrThrow('RAZORPAY_OAUTH_CLIENT_ID'),
      client_secret: envOrThrow('RAZORPAY_OAUTH_CLIENT_SECRET'),
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Razorpay refresh failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function revokeToken(token: string, hint: 'access_token' | 'refresh_token'): Promise<void> {
  // Revoke is best-effort; Razorpay returns 200 with empty body on success.
  await fetch(`${AUTH_BASE}/revoke`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:       envOrThrow('RAZORPAY_OAUTH_CLIENT_ID'),
      client_secret:   envOrThrow('RAZORPAY_OAUTH_CLIENT_SECRET'),
      token_type_hint: hint,
      token,
    }),
  }).catch(() => { /* swallow — caller still marks row revoked */ });
}

export interface IntegrationRow {
  id:             string;
  site_id:        string;
  account_id:     string;
  access_token:   string;   // encrypted
  refresh_token:  string;   // encrypted
  public_token:   string;
  mode:           'test' | 'live';
  expires_at:     string;
  scope:          string;
  status:         'active' | 'revoked' | 'expired';
}

// Returns the active Razorpay integration for a site, refreshing tokens if
// they're about to expire. Returns null if no active integration exists.
export async function getActiveIntegration(siteId: string): Promise<{
  accessToken: string;
  publicToken: string;
  accountId:   string;
  mode:        'test' | 'live';
} | null> {
  const { data } = await supabaseServer
    .from('site_payment_integrations')
    .select('*')
    .eq('site_id', siteId)
    .eq('provider', 'razorpay')
    .eq('status', 'active')
    .maybeSingle();

  if (!data) return null;
  const row = data as IntegrationRow;

  const expiresAt = new Date(row.expires_at).getTime();
  const now = Date.now();

  let accessTokenPlain = decryptToken(row.access_token);
  let publicToken      = row.public_token;

  if (expiresAt - now < REFRESH_BUFFER_SEC * 1000) {
    try {
      const refreshTokenPlain = decryptToken(row.refresh_token);
      const fresh = await refreshAccessToken(refreshTokenPlain);
      const newExpires = new Date(Date.now() + fresh.expires_in * 1000).toISOString();
      await supabaseServer
        .from('site_payment_integrations')
        .update({
          access_token:  encryptToken(fresh.access_token),
          refresh_token: encryptToken(fresh.refresh_token),
          public_token:  fresh.public_token,
          expires_at:    newExpires,
          scope:         fresh.scope ?? row.scope,
        })
        .eq('id', row.id);
      accessTokenPlain = fresh.access_token;
      publicToken      = fresh.public_token;
    } catch (err) {
      console.error('[razorpayOAuth] refresh failed for site', siteId, err);
      // Fall through with the existing (potentially soon-to-expire) token —
      // a 401 from Razorpay will surface to the caller.
    }
  }

  return {
    accessToken: accessTokenPlain,
    publicToken,
    accountId:   row.account_id,
    mode:        row.mode,
  };
}

// Create a Razorpay order on the sub-merchant's account.
export interface CreatedRzpOrder { id: string; amount: number; currency: string; }

export async function createRazorpayOrder(
  accessToken: string,
  body: { amount: number; currency: string; receipt: string; notes?: Record<string, string> },
): Promise<CreatedRzpOrder> {
  const res = await fetch(`${API_BASE}/v1/orders`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Razorpay create order failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Fetch a single payment as a fallback verification step.
export async function fetchRazorpayPayment(
  accessToken: string,
  paymentId: string,
): Promise<{ id: string; status: string; amount: number; currency: string; order_id: string }> {
  const res = await fetch(`${API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Razorpay fetch payment failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Signature verification.
// For OAuth integrations, the Checkout SDK returns a signature that is the
// HMAC-SHA256 of `${order_id}|${payment_id}` with the *partner's*
// client_secret as the key (NOT the sub-merchant's key, which we don't hold).
export function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const secret = envOrThrow('RAZORPAY_OAUTH_CLIENT_SECRET');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}
