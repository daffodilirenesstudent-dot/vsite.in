// PATCH /api/orders/[id]
// Admin-only. Firebase auth required.
//
// Actions:
//   { status, expected_status? }         — advance order status with optimistic locking
//   { action: 'confirm_counter_payment' } — confirm cash payment, allocate token, enqueue email
//
// Optimistic locking on status:
//   Client sends expected_status = the status it read from the server.
//   Server updates only WHERE status = expected_status.
//   If 0 rows matched (another tab already advanced it), returns 409 with current status.
//   This makes admin double-clicks and network retries completely safe.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { buildOrderConfirmationEmail, sendEmailDirect } from '@/lib/orderEmail';
import { audit } from '@/lib/auditLog';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';

type OrderStatus = 'preparing' | 'ready' | 'completed';
const VALID_STATUSES = new Set<OrderStatus>(['preparing', 'ready', 'completed']);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const orderId = params.id;
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
    }

    let body: { status?: string; expected_status?: string; action?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // ── Verify ownership: order must belong to a site this user owns ──────────
    const { data: order, error: orderErr } = await supabaseServer
      .from('orders')
      .select('id, site_id, status, payment_status, payment_method, customer_name, customer_email, order_number, items, subtotal, tax_amount, cgst_amount, sgst_amount, gst_rate_pct, gstin_snapshot, total_amount')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { data: site, error: siteErr } = await supabaseServer
      .from('sites')
      .select('id, slug, name')
      .eq('id', order.site_id)
      .eq('user_id', userId)
      .single();

    if (siteErr || !site) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Action: confirm counter payment + allocate token ──────────────────────
    if (body.action === 'confirm_counter_payment') {
      if (order.payment_method !== 'counter') {
        return NextResponse.json({ error: 'Not a counter order' }, { status: 400 });
      }

      // Single atomic DB function: locks the order row, checks payment_status,
      // allocates a token, and updates — all in one transaction.
      // Eliminates the phantom-token race where concurrent confirms each called
      // allocate_token() independently before the idempotency check could fire.
      // H2: bind to site_id so the RPC double-checks the order belongs to
      // the verified-owner site, defense-in-depth against future grant slips.
      const { data: rows, error: rpcErr } = await supabaseServer
        .rpc('confirm_counter_payment_atomic', { p_order_id: orderId, p_site_id: order.site_id });

      if (rpcErr) {
        if (rpcErr.message?.includes('order_not_found')) {
          return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }
        if (rpcErr.message?.includes('not_a_counter_order')) {
          return NextResponse.json({ error: 'Not a pending counter order' }, { status: 400 });
        }
        console.error('[PATCH /api/orders/[id]] confirm_counter_payment_atomic:', rpcErr);
        return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 500 });
      }

      const result = (rows as { token_number: string; replayed: boolean }[] | null)?.[0];
      if (!result) {
        return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 500 });
      }

      const tokenNumber = result.token_number;

      // Audit BEFORE returning. Replay = no-op for ledger but still records who
      // tried (could indicate double-confirm attempt or honest double-click).
      audit({
        userId, siteId: order.site_id, action: 'confirm_counter_payment',
        targetId: orderId,
        details: {
          amount: Number(order.subtotal),
          token_allocated: tokenNumber,
          replayed: !!result.replayed,
        },
        request,
      });

      if (result.replayed) {
        return NextResponse.json({ success: true, tokenNumber, replayed: true });
      }

      // Update transaction to Success (non-fatal)
      supabaseServer.from('transactions')
        .update({ status: 'Success', payment_mode: 'Cash' })
        .eq('order_id', orderId)
        .then(({ error }) => { if (error) console.error('[PATCH] txn update:', error); });

      // Enqueue confirmation email to reliable queue
      try {
        const itemsArr = Array.isArray(order.items)
          ? (order.items as { name: string; qty: number; price: number; variantSize?: string }[])
          : [];
        const ord = order as typeof order & {
          tax_amount?: number | null; cgst_amount?: number | null; sgst_amount?: number | null;
          gst_rate_pct?: number | null; gstin_snapshot?: string | null; total_amount?: number | null;
        };
        const { subject, htmlbody } = buildOrderConfirmationEmail({
          customerName:  order.customer_name,
          orderNumber:   order.order_number,
          orderId,
          tokenNumber,
          shopSlug:      site.slug ?? order.site_id,
          shopName:      site.name ?? 'Your Store',
          subtotal:      Number(order.subtotal),
          gstRatePct:    Number(ord.gst_rate_pct ?? 0),
          taxAmount:     Number(ord.tax_amount   ?? 0),
          cgstAmount:    Number(ord.cgst_amount  ?? 0),
          sgstAmount:    Number(ord.sgst_amount  ?? 0),
          totalAmount:   Number(ord.total_amount ?? ord.subtotal),
          gstinSnapshot: ord.gstin_snapshot ?? null,
          paymentMethod: 'counter',
          items:         itemsArr.map(i => ({ name: i.name, qty: i.qty, price: i.price, variantSize: i.variantSize })),
        });
        // Direct send for instant delivery; queue is the failure fallback so the
        // cron can retry (dev never runs Vercel cron — queue-only would never send).
        const toEmail = order.customer_email;
        if (toEmail) {
          sendEmailDirect({ to: toEmail, customerName: order.customer_name ?? '', subject, htmlbody })
            .catch((sendErr) => {
              console.error('[PATCH] direct send failed, queueing for retry:', sendErr);
              supabaseServer.from('email_queue').insert({ to_email: toEmail, subject, htmlbody })
                .then(({ error }) => { if (error) console.error('[PATCH] email enqueue fallback:', error); });
            });
        }
      } catch (emailErr) {
        console.error('[PATCH] email build:', emailErr);
      }

      return NextResponse.json({ success: true, tokenNumber });
    }

    // ── Action: advance order status (with optimistic locking) ────────────────
    const newStatus = body.status as OrderStatus | undefined;
    if (!newStatus || !VALID_STATUSES.has(newStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${Array.from(VALID_STATUSES).join(', ')}` },
        { status: 400 },
      );
    }

    // ── Flow guard (M7): block received → * via this route.
    // 'received' orders must transition via PATCH /api/manage/orders/[id]/kot,
    // which ensures the KOT slip is actually generated. Skipping that endpoint
    // would advance status without printing — kitchen never sees the order.
    if (order.status === 'received') {
      return NextResponse.json(
        { error: 'Use the KOT endpoint to advance a received order — POST /api/manage/orders/[id]/kot' },
        { status: 409 },
      );
    }

    // ── Payment guard (C4): block → completed for unpaid counter orders.
    // Marking a counter order completed without confirming payment breaks the
    // ledger (order done, no transaction marked Success). Force confirm-payment
    // first, OR use the table-checkout endpoint which records payment.
    if (
      newStatus === 'completed' &&
      order.payment_method === 'counter' &&
      order.payment_status !== 'paid'
    ) {
      return NextResponse.json(
        { error: 'Confirm counter payment before completing this order' },
        { status: 409 },
      );
    }

    // expected_status: the status the client read before clicking. Required —
    // without it the WHERE clause is just `id = orderId` and a stale tab can
    // force-jump statuses (H3 hardening). The KOT endpoint handles the
    // received → preparing transition and does not come through here.
    const expectedStatus = body.expected_status as OrderStatus | undefined;
    if (!expectedStatus || !VALID_STATUSES.has(expectedStatus)) {
      return NextResponse.json(
        { error: 'expected_status is required (send the status you last read from the server)' },
        { status: 400 },
      );
    }

    const { data: rows, error: updateErr } = await supabaseServer
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', expectedStatus)
      .select('id, status')
      .maybeSingle();

    if (updateErr) {
      console.error('[PATCH /api/orders/[id]] status update:', updateErr);
      return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 });
    }

    if (!rows) {
      // Optimistic lock miss: order was already at a different status.
      // Return current status so client can re-sync without a full refetch.
      const { data: current } = await supabaseServer
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();
      return NextResponse.json(
        { error: 'Status conflict', currentStatus: current?.status ?? order.status },
        { status: 409 },
      );
    }

    audit({
      userId, siteId: order.site_id, action: 'order_status_change',
      targetId: orderId,
      details: { before: order.status, after: newStatus, order_number: order.order_number },
      request,
    });

    return NextResponse.json({ success: true, status: newStatus });
  } catch (err) {
    console.error('[PATCH /api/orders/[id]] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
