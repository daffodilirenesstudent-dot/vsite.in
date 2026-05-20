// GET /api/manage/payments/razorpay/callback?code=…&state=…
//
// Razorpay redirects the admin's browser here after they approve the OAuth
// prompt. We exchange the code for tokens, encrypt them, and upsert into
// site_payment_integrations. Then redirect the browser back to the settings
// page with a status flag.
//
// CSRF protection: the `state` query param must match BOTH the row we stored
// in oauth_states AND the HttpOnly cookie we set on /connect.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { exchangeCode, getMode } from '@/lib/server/razorpayOAuth';
import { encryptToken } from '@/lib/server/paymentsCrypto';
import { notify } from '@/lib/notify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STATE_COOKIE = 'rzp_oauth_state';

function redirectWith(origin: string, params: Record<string, string>): NextResponse {
  const url = new URL('/manage/settings', origin);
  url.searchParams.set('tab', 'payments');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code   = request.nextUrl.searchParams.get('code');
  const state  = request.nextUrl.searchParams.get('state');
  const errorParam = request.nextUrl.searchParams.get('error');

  if (errorParam) {
    return redirectWith(origin, { error: errorParam.slice(0, 64) });
  }
  if (!code || !state) {
    return redirectWith(origin, { error: 'missing_code_or_state' });
  }

  const cookieState = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookieState || cookieState !== state) {
    return redirectWith(origin, { error: 'state_mismatch' });
  }

  // Consume the state row.
  const { data: stateRow } = await supabaseServer
    .from('oauth_states')
    .select('state, site_id, user_id, redirect_uri, provider, created_at')
    .eq('state', state)
    .maybeSingle();
  if (!stateRow) {
    return redirectWith(origin, { error: 'state_not_found' });
  }
  // Five-minute TTL.
  const ageMs = Date.now() - new Date(stateRow.created_at).getTime();
  if (ageMs > 5 * 60_000) {
    await supabaseServer.from('oauth_states').delete().eq('state', state);
    return redirectWith(origin, { error: 'state_expired' });
  }

  let tokens;
  try {
    tokens = await exchangeCode(code, stateRow.redirect_uri);
  } catch (err) {
    console.error('[razorpay/callback] exchange failed:', err);
    await supabaseServer.from('oauth_states').delete().eq('state', state);
    return redirectWith(origin, { error: 'token_exchange_failed' });
  }

  const accountId = tokens.razorpay_account_id;
  if (!accountId) {
    console.error('[razorpay/callback] missing razorpay_account_id in token response');
    await supabaseServer.from('oauth_states').delete().eq('state', state);
    return redirectWith(origin, { error: 'no_account_id' });
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: upsertErr } = await supabaseServer
    .from('site_payment_integrations')
    .upsert({
      site_id:       stateRow.site_id,
      provider:      'razorpay',
      account_id:    accountId,
      access_token:  encryptToken(tokens.access_token),
      refresh_token: encryptToken(tokens.refresh_token),
      public_token:  tokens.public_token,
      token_type:    tokens.token_type ?? 'Bearer',
      scope:         tokens.scope ?? 'read_write',
      mode:          getMode(),
      expires_at:    expiresAt,
      status:        'active',
      connected_by:  stateRow.user_id,
    }, { onConflict: 'site_id,provider' });

  // Consume state row regardless of upsert outcome.
  await supabaseServer.from('oauth_states').delete().eq('state', state);

  if (upsertErr) {
    console.error('[razorpay/callback] upsert failed:', upsertErr);
    return redirectWith(origin, { error: 'persist_failed' });
  }

  notify({
    userId: stateRow.user_id,
    siteId: stateRow.site_id,
    type:   'razorpay_connected',
    title:  'Razorpay account connected',
    body:   `Customers can now pay online (${getMode()} mode). Funds settle to ${accountId}.`,
    link:   '/manage/settings',
  });

  return redirectWith(origin, { connected: '1' });
}
