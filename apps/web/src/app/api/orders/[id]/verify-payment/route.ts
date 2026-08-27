// POST /api/orders/[id]/verify-payment
//
// Public endpoint. Called by the customer's browser after Razorpay Checkout
// resolves successfully. Verifies the signature, double-checks with Razorpay's
// API (defence in depth — webhooks may not have arrived yet), and marks the
// local order as paid.
//
// Idempotent: re-posting the same payment id is a no-op success.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import {
  verifyCheckoutSignature,
  getActiveIntegration,
  fetchRazorpayPayment,
} from '@/lib/server/razorpayOAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const orderId = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  let body: { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;
  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 });
  }

  // Signature first — cheap and catches tampering before any DB work.
  if (!verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
  }

  // Look up local order. Must match the razorpay_order_id we issued.
  const { data: order } = await supabaseServer
    .from('orders')
    .select('id, site_id, razorpay_order_id, razorpay_payment_id, payment_status, subtotal, total_amount')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.razorpay_order_id !== razorpay_order_id) {
    return NextResponse.json({ error: 'Order mismatch' }, { status: 400 });
  }

  // Idempotent replay — same payment id, already marked paid.
  if (order.payment_status === 'paid' && order.razorpay_payment_id === razorpay_payment_id) {
    return NextResponse.json({ success: true, alreadyPaid: true });
  }

  // Defence in depth: fetch the payment from Razorpay (using the *site's*
  // access token) and confirm it's actually captured for the right order/amount.
  const integration = await getActiveIntegration(order.site_id as string);
  if (!integration) {
    // The integration was revoked between order creation and payment. The
    // payment may still have gone through on Razorpay's side — flag for
    // manual review but don't mark paid.
    console.error('[verify-payment] integration missing for site', order.site_id, 'order', orderId);
    return NextResponse.json({ error: 'Payment configuration unavailable' }, { status: 500 });
  }

  let payment;
  try {
    payment = await fetchRazorpayPayment(integration.accessToken, razorpay_payment_id);
  } catch (err) {
    console.error('[verify-payment] fetch payment failed:', err);
    return NextResponse.json({ error: 'Could not verify with Razorpay' }, { status: 502 });
  }
  if (payment.order_id !== razorpay_order_id) {
    return NextResponse.json({ error: 'Payment/order mismatch' }, { status: 400 });
  }
  if (payment.status !== 'captured' && payment.status !== 'authorized') {
    return NextResponse.json(
      { error: `Payment not completed (status: ${payment.status})` },
      { status: 400 },
    );
  }
  // Razorpay was charged the full amount (subtotal + tax). Compare against
  // total_amount; fall back to subtotal for legacy orders pre-GST.
  const expectedAmount = Math.round(Number(order.total_amount ?? order.subtotal) * 100);
  if (Number(payment.amount) !== expectedAmount) {
    console.error('[verify-payment] amount mismatch', { expected: expectedAmount, actual: payment.amount });
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  const { error: updErr } = await supabaseServer
    .from('orders')
    .update({
      razorpay_payment_id,
      payment_status: 'paid',
    })
    .eq('id', orderId);
  if (updErr) {
    // Unique-violation on razorpay_payment_id → another request beat us to it.
    if ((updErr as { code?: string }).code === '23505') {
      return NextResponse.json({ success: true, alreadyPaid: true });
    }
    console.error('[verify-payment] order update failed:', updErr);
    return NextResponse.json({ error: 'Failed to mark order paid' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
