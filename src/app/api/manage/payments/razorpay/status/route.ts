// GET /api/manage/payments/razorpay/status?siteId=…
//
// Live health snapshot for the Settings UI. Returns a single `health` field
// the UI can switch on plus extra info for richer display. Never returns
// access/refresh tokens.
//
//   health = 'not_connected'   — no row at all
//          | 'active'          — status=active and token valid + healthy
//          | 'expiring_soon'   — status=active, token expires in ≤ 7 days
//          | 'expired'         — status=active but expires_at is past
//          | 'revoked'         — status='revoked' (user-disconnect OR Razorpay-revoke)
//
// `connected` is a single boolean for code-paths that just want yes/no.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

const EXPIRING_SOON_DAYS = 7;

export async function GET(request: NextRequest) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await verifyFirebaseToken(auth.replace('Bearer ', ''));
  if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const siteId = request.nextUrl.searchParams.get('siteId');
  if (!siteId || !/^[0-9a-f-]{36}$/i.test(siteId)) {
    return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 });
  }

  // Ownership check.
  const { data: site } = await supabaseServer
    .from('sites').select('id').eq('id', siteId).eq('user_id', userId).maybeSingle();
  if (!site) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data } = await supabaseServer
    .from('site_payment_integrations')
    .select('account_id, mode, expires_at, status, scope, created_at, updated_at')
    .eq('site_id', siteId)
    .eq('provider', 'razorpay')
    .maybeSingle();

  if (!data) {
    return NextResponse.json({
      connected: false,
      health:    'not_connected',
      checkedAt: new Date().toISOString(),
    });
  }

  const now = Date.now();
  const expiresAtMs = new Date(data.expires_at).getTime();
  const remainingMs = expiresAtMs - now;
  const expiresInDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60_000)));

  let health: 'active' | 'expiring_soon' | 'expired' | 'revoked';
  if (data.status === 'revoked') health = 'revoked';
  else if (remainingMs <= 0)     health = 'expired';
  else if (remainingMs < EXPIRING_SOON_DAYS * 24 * 60 * 60_000) health = 'expiring_soon';
  else                           health = 'active';

  return NextResponse.json({
    connected:     health === 'active' || health === 'expiring_soon',
    health,
    accountId:     data.account_id,
    mode:          data.mode,
    scope:         data.scope,
    expiresAt:     data.expires_at,
    expiresInDays,
    connectedAt:   data.created_at,
    lastUpdatedAt: data.updated_at,
    checkedAt:     new Date().toISOString(),
  });
}
