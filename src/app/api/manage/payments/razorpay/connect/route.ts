// POST /api/manage/payments/razorpay/connect
//
// Starts the Razorpay OAuth flow for a site. Returns { url } that the client
// then navigates to. The client must be authenticated (Firebase Bearer) and
// must own the site.
//
// A random `state` is generated and persisted in `oauth_states` (keyed by
// state). On callback we look up the row, verify the site/user, and consume it.
// We also drop a short-lived HttpOnly cookie as a second factor of CSRF
// protection — both must match.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { buildAuthorizeUrl, generateState } from '@/lib/server/razorpayOAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STATE_COOKIE = 'rzp_oauth_state';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await verifyFirebaseToken(auth.replace('Bearer ', ''));
  if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  let body: { siteId?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { siteId } = body;
  if (!siteId || !/^[0-9a-f-]{36}$/i.test(siteId)) {
    return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 });
  }

  // Ownership check.
  const { data: site } = await supabaseServer
    .from('sites').select('id').eq('id', siteId).eq('user_id', userId).maybeSingle();
  if (!site) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const redirectUri = process.env.RAZORPAY_OAUTH_REDIRECT_URI;
  if (!redirectUri) {
    console.error('[razorpay/connect] RAZORPAY_OAUTH_REDIRECT_URI not set');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const state = generateState();

  const { error: insErr } = await supabaseServer.from('oauth_states').insert({
    state,
    site_id: siteId,
    user_id: userId,
    provider: 'razorpay',
    redirect_uri: redirectUri,
  });
  if (insErr) {
    console.error('[razorpay/connect] state insert failed:', insErr);
    return NextResponse.json({ error: 'Failed to start OAuth flow' }, { status: 500 });
  }

  // Best-effort cleanup of stale rows (>5 min old).
  supabaseServer
    .from('oauth_states')
    .delete()
    .lt('created_at', new Date(Date.now() - 5 * 60_000).toISOString())
    .then(({ error }) => { if (error) console.error('[razorpay/connect] cleanup:', error); });

  const url = buildAuthorizeUrl(state, redirectUri);

  const res = NextResponse.json({ url });
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   5 * 60,
  });
  return res;
}
