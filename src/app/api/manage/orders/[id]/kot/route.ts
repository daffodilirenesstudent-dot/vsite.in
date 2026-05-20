// PATCH /api/manage/orders/[id]/kot
// Advances a 'received' order to 'preparing' (KOT sent to kitchen).
// Idempotent: if already 'preparing', returns success silently.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { audit } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

async function authenticate(request: NextRequest) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyFirebaseToken(auth.replace('Bearer ', ''));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await authenticate(request);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orderId = params.id;

  // Verify the order exists and belongs to a site owned by this user
  const { data: order, error: fetchErr } = await supabaseServer
    .from('orders')
    .select('id, status, site_id')
    .eq('id', orderId)
    .single();

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Verify site ownership
  const { data: site, error: siteErr } = await supabaseServer
    .from('sites')
    .select('id')
    .eq('id', order.site_id)
    .eq('user_id', userId)
    .single();

  if (siteErr || !site) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (order.status === 'preparing' || order.status === 'completed') {
    return NextResponse.json({ success: true, already_advanced: true });
  }

  if (order.status !== 'received') {
    return NextResponse.json({ error: 'Order is not in received status' }, { status: 409 });
  }

  // Atomic advance: only succeeds if still 'received'
  const { data: updated, error: updateErr } = await supabaseServer
    .from('orders')
    .update({ status: 'preparing', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'received')
    .select('id');

  if (updateErr) {
    console.error('[PATCH kot] update error:', updateErr);
    return NextResponse.json({ error: 'Failed to advance order' }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    // Another device already advanced it
    return NextResponse.json({ success: true, already_advanced: true });
  }

  audit({
    userId, siteId: order.site_id, action: 'order_kot_sent',
    targetId: orderId,
    details: { before: 'received', after: 'preparing' },
    request,
  });

  return NextResponse.json({ success: true });
}
