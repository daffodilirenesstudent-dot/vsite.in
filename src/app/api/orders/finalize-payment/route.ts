// POST /api/orders/finalize-payment
//
// Public endpoint. Customer's browser calls this after Razorpay Checkout
// returns a successful capture. We then — and ONLY then — actually create
// the order in the database.
//
// Inputs (all required):
//   razorpay_order_id    — the order id we stored in pending_online_orders
//   razorpay_payment_id  — Razorpay's capture id, used to fetch + verify
//   razorpay_signature   — HMAC the Checkout JS gives us
//
// Flow:
//   1. Verify the checkout signature (rejects forged callers).
//   2. Look up the matching `pending_online_orders` row.
//      • If it's already been consumed but an `orders` row exists with this
//        razorpay_order_id → idempotent success.
//   3. Fetch the payment from Razorpay using the merchant's bearer token.
//      • Confirm status == captured/authorized, amount matches, order id binds.
//   4. Call `process_order_v2` to ATOMICALLY create the real `orders` row
//      (with token allocation, transaction insert, etc.). Items are pre-
//      validated so we pass them straight through.
//   5. Stamp the new order with razorpay_order_id + razorpay_payment_id +
//      payment_status='paid'.
//   6. Delete the pending row.
//   7. Return order id / order number / token number to the client.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import {
  verifyCheckoutSignature,
  getActiveIntegration,
  fetchRazorpayPayment,
} from '@/lib/server/razorpayOAuth';
import { buildOrderConfirmationEmail, sendEmailDirect } from '@/lib/orderEmail';
import crypto from 'crypto';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const runtime    = 'nodejs';

function sha256Short(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 40);
}

interface PendingRow {
  id:                string;
  razorpay_order_id: string;
  site_id:           string;
  customer_name:     string;
  customer_email:    string | null;
  customer_phone:    string | null;
  items:             Array<{ id: string; name: string; qty: number; price: number; variantSize: string | null }>;
  subtotal:          number;
  tax_amount:        number | null;
  total_amount:      number | null;
  gst_rate_pct:      number | null;
  gstin_snapshot:    string | null;
  table_number:      number | null;
  idempotency_key:   string | null;
  client_ip_hash:    string | null;
}

export async function POST(request: NextRequest) {
  let body: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: 'Missing payment fields' }, { status: 400 });
  }

  // 1. Signature check first — cheap and rejects forged callers before any DB work.
  if (!verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
  }

  // 2. Look up pending row.
  const { data: pending } = await supabaseServer
    .from('pending_online_orders')
    .select('*')
    .eq('razorpay_order_id', razorpay_order_id)
    .maybeSingle<PendingRow>();

  if (!pending) {
    // Idempotent retry — maybe finalize already ran and we already have an
    // orders row for this razorpay_order_id. If so, return its info.
    const { data: existing } = await supabaseServer
      .from('orders')
      .select('id, order_number, token_number, payment_status')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();
    // C4 hardening: only report success when the order is actually marked
    // paid. Row existence alone isn't enough — a prior finalize that crashed
    // between order insert and the paid-link UPDATE could leave an unpaid
    // row here, and reporting "success" would print a token without the
    // customer ever being charged.
    if (existing && existing.payment_status === 'paid') {
      return NextResponse.json({
        success:      true,
        alreadyPaid:  true,
        orderId:      existing.id,
        orderNumber:  existing.order_number,
        tokenNumber:  existing.token_number,
      });
    }
    if (existing) {
      console.error('[finalize-payment] orphan order without paid status', { orderId: existing.id, razorpay_order_id });
      return NextResponse.json(
        { error: 'Order found but payment not confirmed. Contact the store with your payment id.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'No pending order found for this payment' }, { status: 404 });
  }

  // 3. Confirm the payment with Razorpay using the merchant's bearer token.
  const integration = await getActiveIntegration(pending.site_id);
  if (!integration) {
    console.error('[finalize-payment] integration missing for site', pending.site_id);
    return NextResponse.json({ error: 'Payment configuration unavailable. Contact the store.' }, { status: 500 });
  }

  let payment;
  try {
    payment = await fetchRazorpayPayment(integration.accessToken, razorpay_payment_id);
  } catch (err) {
    console.error('[finalize-payment] fetchRazorpayPayment failed:', err);
    return NextResponse.json({ error: 'Could not verify with Razorpay' }, { status: 502 });
  }
  if (payment.order_id !== razorpay_order_id) {
    return NextResponse.json({ error: 'Payment / order mismatch' }, { status: 400 });
  }
  if (payment.status !== 'captured' && payment.status !== 'authorized') {
    return NextResponse.json({ error: `Payment not completed (status: ${payment.status})` }, { status: 400 });
  }
  // C5: assert currency. The amount field is integer minor-units regardless
  // of currency, so a numeric-only match would accept a captured-in-IDR
  // payment as equivalent to INR. INR-only today; pin it so the moment
  // multi-currency capture lands this check still holds.
  if (payment.currency !== 'INR') {
    console.error('[finalize-payment] currency mismatch', { expected: 'INR', actual: payment.currency });
    return NextResponse.json({ error: 'Currency mismatch' }, { status: 400 });
  }
  // Razorpay was asked to charge subtotal + GST. Legacy pending rows (created
  // before migration 046) have null total_amount — fall back to subtotal.
  const expectedRupees  = pending.total_amount ?? pending.subtotal;
  const expectedAmount  = Math.round(Number(expectedRupees) * 100);
  if (Number(payment.amount) !== expectedAmount) {
    console.error('[finalize-payment] amount mismatch', { expected: expectedAmount, actual: payment.amount });
    return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
  }

  // 4. Create the real order via process_order_v2. Pre-validated items, so
  //    the RPC's own re-validation should be a no-op. Rate limits are
  //    bypassed (the customer already paid — we MUST honour it).
  const items = pending.items.map(it => ({ id: it.id, qty: it.qty, variantSize: it.variantSize ?? null }));

  let rpcData: Record<string, unknown>;
  try {
    const { data, error } = await supabaseServer.rpc('process_order_v2', {
      p_site_id:         pending.site_id,
      p_customer_name:   pending.customer_name,
      p_customer_email:  pending.customer_email ?? '',
      p_customer_phone:  pending.customer_phone ?? null,
      p_payment_method:  'online',
      p_items_json:      items,
      p_table_number:    pending.table_number ?? null,
      p_idempotency_key: pending.idempotency_key
        ? sha256Short(`${pending.site_id}:finalize:${pending.idempotency_key}`)
        : sha256Short(`finalize:${razorpay_order_id}`),
      p_site_rate_key:   sha256Short(`finalize-site::${pending.site_id}`),
      p_ip_rate_key:     sha256Short(`finalize-ip::${pending.client_ip_hash ?? 'na'}`),
      p_rl_window_ms:    60_000,
      p_rl_site_limit:   999_999, // bypass — customer has already paid
      p_rl_ip_limit:     999_999,
      // Lock the tax to the rate that was active when Razorpay was charged.
      // If admin changes the store's rate between Razorpay redirect and capture,
      // we must still snapshot the *original* rate so the recorded tax matches
      // what the customer actually paid.
      p_gst_rate_override: pending.gst_rate_pct ?? 0,
      p_gstin_override:    pending.gstin_snapshot,
    });
    if (error) throw error;
    rpcData = (data as Record<string, unknown>) ?? {};
  } catch (err) {
    console.error('[finalize-payment] process_order_v2 RPC failed:', err);
    // H4: customer has paid but the order failed to materialize. Drop a row
    // into payment_reconciliation so an admin / cron can settle it instead of
    // relying on the customer reading the error message and emailing support.
    await supabaseServer.from('payment_reconciliation').upsert({
      site_id: pending.site_id, razorpay_order_id, razorpay_payment_id,
      amount: expectedAmount, currency: payment.currency,
      pending_id: pending.id, reason: 'rpc_threw',
      detail: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
    }, { onConflict: 'razorpay_payment_id' }).then(({ error }) => { if (error) console.error('[finalize-payment] reconciliation upsert failed:', error); });
    return NextResponse.json(
      { error: 'Payment confirmed but order could not be created. Contact the store with your payment id.', razorpay_payment_id },
      { status: 500 },
    );
  }

  if (rpcData.status !== 'ok' && rpcData.status !== 'replayed') {
    console.error('[finalize-payment] process_order_v2 returned non-ok status:', rpcData);
    await supabaseServer.from('payment_reconciliation').upsert({
      site_id: pending.site_id, razorpay_order_id, razorpay_payment_id,
      amount: expectedAmount, currency: payment.currency,
      pending_id: pending.id, reason: 'rpc_status_' + String(rpcData.status).slice(0, 40),
      detail: JSON.stringify(rpcData).slice(0, 1000),
    }, { onConflict: 'razorpay_payment_id' }).then(({ error }) => { if (error) console.error('[finalize-payment] reconciliation upsert failed:', error); });
    return NextResponse.json(
      { error: 'Payment confirmed but order could not be created. Contact the store with your payment id.', razorpay_payment_id, status: rpcData.status },
      { status: 500 },
    );
  }

  const orderId      = rpcData.order_id as string;
  const orderNumber  = rpcData.order_number as string;
  const tokenNumber  = (rpcData.token_number as string | null) ?? null;
  const siteSlug     = (rpcData.site_slug as string | undefined) ?? '';
  const siteName     = (rpcData.site_name as string | undefined) ?? 'Your Store';

  // 5. Mark the order paid + link to Razorpay ids, and flip the txn to
  //    Success with the real gateway_ref. process_order_v2 now writes the
  //    txn as Pending with NULL gateway_ref (C3 hardening) — this step is
  //    what actually records the money as collected. If either update fails
  //    the books are inconsistent, so log loudly and surface a 500 so the
  //    client retries (idempotent via razorpay_order_id lookup at step 2).
  const { error: linkErr } = await supabaseServer
    .from('orders')
    .update({
      razorpay_order_id,
      razorpay_payment_id,
      payment_status: 'paid',
    })
    .eq('id', orderId);
  if (linkErr) {
    console.error('[finalize-payment] order update (paid) failed:', linkErr);
    return NextResponse.json(
      { error: 'Payment confirmed but order link failed. Contact the store with your payment id.', razorpay_payment_id },
      { status: 500 },
    );
  }

  const { error: txnErr } = await supabaseServer
    .from('transactions')
    .update({ status: 'Success', payment_mode: 'UPI', gateway_ref: razorpay_payment_id })
    .eq('order_id', orderId);
  if (txnErr) {
    console.error('[finalize-payment] transaction settle failed:', txnErr);
    // Order is paid + linked; ledger row is still Pending. Surface so a
    // retry / admin reconciliation can flip it — better than silently
    // diverging order.payment_status from transaction.status.
    return NextResponse.json(
      { error: 'Payment confirmed but ledger settle failed. Contact the store with your payment id.', razorpay_payment_id },
      { status: 500 },
    );
  }

  // 6. Consume the pending row.
  await supabaseServer
    .from('pending_online_orders')
    .delete()
    .eq('razorpay_order_id', razorpay_order_id);

  // 7. Fire-and-forget confirmation email (best-effort).
  if (pending.customer_email) {
    try {
      const { subject, htmlbody } = buildOrderConfirmationEmail({
        customerName:  pending.customer_name,
        orderNumber,
        orderId,
        tokenNumber,
        shopSlug:      siteSlug || pending.site_id,
        shopName:      siteName,
        subtotal:      Number(pending.subtotal),
        gstRatePct:    Number(pending.gst_rate_pct ?? 0),
        taxAmount:     Number(pending.tax_amount   ?? 0),
        totalAmount:   Number(pending.total_amount ?? pending.subtotal),
        gstinSnapshot: pending.gstin_snapshot,
        paymentMethod: 'online',
        items:         pending.items.map(it => ({
          name: it.name, qty: it.qty, price: it.price, variantSize: it.variantSize ?? undefined,
        })),
      });
      // Send the email directly in fire-and-forget mode so it arrives instantly
      // (Vercel cron only fires in production — dev would never drain a queue-
      // only email). On failure, fall back to the queue so the cron retries.
      const toEmail = pending.customer_email;
      sendEmailDirect({ to: toEmail, customerName: pending.customer_name, subject, htmlbody })
        .catch((sendErr) => {
          console.error('[finalize-payment] direct send failed, queueing for retry:', sendErr);
          supabaseServer
            .from('email_queue')
            .insert({ to_email: toEmail, subject, htmlbody })
            .then(({ error }) => { if (error) console.error('[finalize-payment] email enqueue fallback failed:', error); });
        });
    } catch (emailErr) {
      console.error('[finalize-payment] email build failed:', emailErr);
    }
  }

  return NextResponse.json({
    success:      true,
    orderId,
    orderNumber,
    tokenNumber,
  });
}
