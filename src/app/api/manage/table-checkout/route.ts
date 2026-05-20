// POST /api/manage/table-checkout
// Firebase auth required.
// Two modes:
//   Table mode:    { site_id, table_number, payment_method } — settles all active orders for a table
//   Takeaway mode: { site_id, order_id, token_label, payment_method } — settles a single order
//
// All writes (checkout record, order status, bill-request ack, transaction)
// happen in a single atomic Postgres function — checkout_table_atomic().
// This eliminates the previous split-write bug where a Vercel timeout between
// step 1 (insert checkout) and step 2 (update orders) left orders stuck as
// active while the checkout was already recorded.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { audit } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
  if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const { site_id, table_number, order_id, token_label, payment_method } = body ?? {};

  if (!site_id || typeof site_id !== 'string' || !['cash', 'card', 'upi'].includes(payment_method)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!table_number && !order_id) {
    return NextResponse.json({ error: 'table_number or order_id required' }, { status: 400 });
  }

  // Verify site ownership
  const { data: site } = await supabaseServer
    .from('sites')
    .select('id')
    .eq('id', site_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // ── Payment guard (C4): block checkout if any counter order is unpaid.
  // Without this, the table's revenue gets recorded in transactions but the
  // unpaid counter orders' payment_status stays 'pending' — accounting drift.
  // Forces the admin to confirm counter payment first.
  {
    let q = supabaseServer
      .from('orders')
      .select('id, order_number, payment_method, payment_status, status')
      .eq('site_id', site_id)
      .eq('payment_method', 'counter')
      .eq('payment_status', 'pending')
      .neq('status', 'completed');

    if (order_id) q = q.eq('id', order_id);
    else          q = q.eq('table_number', String(table_number));

    const { data: unpaid } = await q.limit(1);
    if (unpaid && unpaid.length > 0) {
      return NextResponse.json(
        {
          error: `Confirm payment for counter order #${unpaid[0].order_number} before checking out`,
          unpaidOrderId: unpaid[0].id,
        },
        { status: 409 },
      );
    }
  }

  // Single atomic call — checkout record, order updates, bill-request ack,
  // and transaction insert all happen in one Postgres transaction.
  const { data, error } = await supabaseServer.rpc('checkout_table_atomic', {
    p_site_id:        site_id,
    p_table_number:   table_number ?? null,
    p_order_id:       order_id ?? null,
    p_token_label:    token_label ?? null,
    p_payment_method: payment_method,
  });

  if (error) {
    console.error('[table-checkout] checkout_table_atomic:', error);
    return NextResponse.json({ error: 'Failed to process checkout' }, { status: 500 });
  }

  const result = data as { order_count: number; total_amount: number; already_settled: boolean };

  audit({
    userId, siteId: site_id, action: 'table_checkout',
    targetId: order_id ?? `table:${table_number}`,
    details: {
      mode: order_id ? 'takeaway' : 'table',
      payment_method,
      order_count: result.order_count,
      total_amount: result.total_amount,
      already_settled: result.already_settled,
      ...(token_label ? { token_label } : {}),
    },
    request,
  });

  return NextResponse.json({
    success:        true,
    orderCount:     result.order_count,
    totalAmount:    result.total_amount,
    alreadySettled: result.already_settled,
  });
}
