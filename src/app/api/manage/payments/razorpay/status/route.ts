// GET /api/manage/payments/razorpay/status?siteId=…
//
// Returns connection status for the Settings UI. Never returns secrets.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
    .select('account_id, mode, expires_at, status, scope, created_at')
    .eq('site_id', siteId)
    .eq('provider', 'razorpay')
    .maybeSingle();

  if (!data || data.status !== 'active') {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    accountId: data.account_id,
    mode:      data.mode,
    scope:     data.scope,
    expiresAt: data.expires_at,
    connectedAt: data.created_at,
  });
}
