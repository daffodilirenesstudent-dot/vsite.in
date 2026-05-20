// POST /api/manage/payments/razorpay/disconnect
//
// Revokes the stored Razorpay OAuth tokens and marks the integration row
// as 'revoked'. Idempotent — calling on an already-revoked integration is a
// no-op success.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { decryptToken } from '@/lib/server/paymentsCrypto';
import { revokeToken } from '@/lib/server/razorpayOAuth';
import { notify } from '@/lib/notify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

  // Ownership check + fetch tokens in one query.
  const { data: row } = await supabaseServer
    .from('site_payment_integrations')
    .select('id, access_token, refresh_token, site_id, sites:sites!inner(user_id)')
    .eq('site_id', siteId)
    .eq('provider', 'razorpay')
    .maybeSingle();

  if (!row) {
    // Nothing to disconnect — treat as success.
    return NextResponse.json({ success: true, alreadyDisconnected: true });
  }

  const siteOwner = (row as unknown as { sites: { user_id: string } }).sites?.user_id;
  if (siteOwner !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Best-effort revoke; failures don't block the local state change.
  try {
    const refresh = decryptToken(row.refresh_token);
    await revokeToken(refresh, 'refresh_token');
  } catch (err) {
    console.warn('[razorpay/disconnect] revoke failed (continuing):', err);
  }

  const { error: updErr } = await supabaseServer
    .from('site_payment_integrations')
    .update({ status: 'revoked' })
    .eq('id', row.id);

  if (updErr) {
    console.error('[razorpay/disconnect] update failed:', updErr);
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  notify({
    userId,
    siteId,
    type:   'razorpay_revoked',
    title:  'Razorpay account disconnected',
    body:   'Online payment has been turned off for this store. Reconnect anytime from Settings.',
    link:   '/manage/settings',
  });

  return NextResponse.json({ success: true });
}
