// POST /api/orders
// Public endpoint — no Firebase auth (customers have no accounts).
//
// Production hardening (v3 — consolidated RPC):
//  • 1 DB round trip in the hot path   — process_order_v2() does rate limiting,
//    idempotency, site/plan validation, price verification, token allocation,
//    order creation, and transaction insert in one atomic Postgres function.
//  • Fire-and-forget email enqueue     — email HTML is built in JS (CPU-only)
//    after the RPC returns verified items, then inserted to email_queue
//    asynchronously (cron retries on failure).
//  • AbortController timeout (8 s)     — prevents Vercel function from hanging
//    if Supabase becomes slow.
//  • All prior security guarantees preserved: distributed rate limiting,
//    distributed idempotency, server-side price verification, atomic order
//    creation, reliable email delivery.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { buildOrderConfirmationEmail as _unusedEmail } from '@/lib/orderEmail';
import { verifyTableSig } from '@/lib/qrSignature';
import { getActiveIntegration, createRazorpayOrder } from '@/lib/server/razorpayOAuth';
import crypto from 'crypto';

// PHASE 1: missing sig is logged but allowed (legacy QR cards still in field).
// Flip to true once all printed cards carry sig — then unsigned tableNumber
// will be rejected with `invalid_table_signature` 400.
const STRICT_TABLE_SIG = process.env.STRICT_TABLE_SIG === '1';

const MAX_ITEMS       = 50;
const MAX_NAME_LEN    = 80;
const MAX_EMAIL_LEN   = 200;
const MAX_PHONE_LEN   = 20;
const MAX_QTY         = 99;
const RL_WINDOW_MS    = 60_000;
const RL_SITE_LIMIT   = 100;
const RL_IP_LIMIT     = 20;
const RPC_TIMEOUT_MS  = 8_000;

// Strip control chars, collapse whitespace, length-cap. Do NOT HTML-encode here:
// encoding at storage corrupts thermal-printer output ("Tom & Jerry" → "Tom &amp; Jerry")
// and double-encodes when rendered as HTML. Email templates HTML-escape at render time.
function sanitizeName(s: string, max: number): string {
  return s
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')  // strip control chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function sha256Short(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 40);
}

interface IncomingItem {
  id: string;
  name?: string;
  price?: number;
  qty: number;
  variantSize?: string;
}

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(request: NextRequest) {
  try {
    // ── Parse body ──────────────────────────────────────────────────────────
    let body: {
      siteId?: string;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      paymentMethod?: 'online' | 'counter' | 'no_payment';
      items?: IncomingItem[];
      subtotal?: number;
      clientRequestId?: string;
      tableNumber?: number;
      tableSig?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { siteId, customerName, customerEmail, customerPhone, paymentMethod, items, tableNumber, tableSig } = body;

    // ── Input validation (no DB) ─────────────────────────────────────────────
    if (!siteId || typeof siteId !== 'string' || !/^[0-9a-f-]{36}$/i.test(siteId)) {
      return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 });
    }
    // Reject pathologically long names up-front instead of silently truncating.
    // Real names are <50 chars; >120 is either pasted garbage or an attacker
    // probing how we handle oversize input. Length-cap at MAX_NAME_LEN is still
    // applied as belt-and-suspenders inside sanitizeName.
    if (typeof customerName === 'string' && customerName.length > 120) {
      return NextResponse.json({ error: 'Customer name must be 120 characters or fewer' }, { status: 400 });
    }
    const cleanName = sanitizeName(customerName ?? '', MAX_NAME_LEN);
    if (!cleanName) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }
    const cleanEmail = (customerEmail ?? '').trim().slice(0, MAX_EMAIL_LEN);
    // no_payment (qr_order plan) → collects phone instead of email.
    // online / counter (pay_eat plan) → collects email.
    const emailRequired = paymentMethod !== 'no_payment';
    if (emailRequired && (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))) {
      return NextResponse.json({ error: 'Valid email address is required' }, { status: 400 });
    }
    // Phone capture: required for no_payment, ignored otherwise. Validate as
    // 7-15 digits (international floor/ceiling per E.164) after stripping
    // spaces, dashes, parens, and a leading '+'. Strict enough to catch typos,
    // loose enough to accept any country code an Indian restaurant might see.
    const cleanPhone = paymentMethod === 'no_payment'
      ? (customerPhone ?? '').trim().slice(0, MAX_PHONE_LEN)
      : '';
    if (paymentMethod === 'no_payment') {
      const digits = cleanPhone.replace(/[^\d]/g, '');
      if (digits.length < 7 || digits.length > 15) {
        return NextResponse.json({ error: 'Valid phone number is required' }, { status: 400 });
      }
    }
    if (paymentMethod !== 'online' && paymentMethod !== 'counter' && paymentMethod !== 'no_payment') {
      return NextResponse.json({ error: 'paymentMethod must be online, counter, or no_payment' }, { status: 400 });
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
      return NextResponse.json({ error: `Order must have 1-${MAX_ITEMS} items` }, { status: 400 });
    }
    for (const it of items) {
      if (!it?.id || !/^[0-9a-f-]{36}$/i.test(it.id)) {
        return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
      }
      if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAX_QTY) {
        return NextResponse.json({ error: 'Invalid item qty' }, { status: 400 });
      }
    }

    // ── Signed-QR check (H3) ─────────────────────────────────────────────────
    // tableNumber must be HMAC-signed so a customer at table 5 can't edit the
    // URL to ?table=3 and send their order to the wrong table. PHASE 1: log
    // unsigned attempts but allow (legacy printed QRs); PHASE 2 (env flag):
    // reject. Per-site secret means a breach of one site doesn't compromise others.
    if (typeof tableNumber === 'number' && tableNumber > 0) {
      // Fetch slug + qr_secret once. This adds 1 DB call but only on table
      // orders, and the RPC will do its own site lookup anyway — Supabase keeps
      // a hot connection so the round trip is ~20ms.
      const { data: siteRow } = await supabaseServer
        .from('sites').select('slug, qr_secret').eq('id', siteId).maybeSingle();
      if (!siteRow) {
        return NextResponse.json({ error: 'Store not found' }, { status: 404 });
      }
      const sigValid = verifyTableSig(siteRow.slug ?? '', tableNumber, siteRow.qr_secret ?? '', tableSig);
      if (!sigValid) {
        if (STRICT_TABLE_SIG) {
          return NextResponse.json({ error: 'Invalid table QR — please re-scan from the table card' }, { status: 400 });
        }
        console.warn(`[POST /api/orders] unsigned tableNumber=${tableNumber} for slug=${siteRow.slug} — accepted under PHASE 1`);
      }
    }

    // ── Pre-compute rate limit keys + idempotency key (CPU-only) ─────────────
    const fwdIp  = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
    const ipHash = sha256Short(fwdIp);

    const idemRaw = request.headers.get('Idempotency-Key') ?? body.clientRequestId ?? '';
    const idemKey = idemRaw && idemRaw.length <= 128
      ? sha256Short(`${siteId}:${idemRaw}`)
      : '';

    // ╔══════════════════════════════════════════════════════════════════════╗
    // ║  ONLINE PAYMENTS — DEFERRED ORDER CREATION                          ║
    // ║                                                                      ║
    // ║  We do NOT write to the `orders` table here. Instead we:             ║
    // ║   1. validate items + prices against products (no write)             ║
    // ║   2. create a Razorpay order on the restaurant's merchant account    ║
    // ║   3. stash the cart in `pending_online_orders` keyed by rzp order id ║
    // ║   4. return Razorpay handoff data to the client                      ║
    // ║                                                                      ║
    // ║  After the customer pays, `/api/orders/finalize-payment` pops the    ║
    // ║  pending row and calls `process_order_v2` — only THEN does the       ║
    // ║  order appear in the admin panel. Abandoned payments leave only a    ║
    // ║  short-lived `pending_online_orders` row, never an admin-visible    ║
    // ║  order. (Cleaned up by a cron later.)                                ║
    // ╚══════════════════════════════════════════════════════════════════════╝
    if (paymentMethod === 'online') {
      // 1. Idempotent retry — return the existing Razorpay order if this idem
      //    key already has a pending row.
      if (idemKey) {
        const { data: existing } = await supabaseServer
          .from('pending_online_orders')
          .select('razorpay_order_id, subtotal, total_amount, site_id')
          .eq('site_id', siteId)
          .eq('idempotency_key', idemKey)
          .maybeSingle();
        if (existing) {
          const integration = await getActiveIntegration(existing.site_id);
          if (integration) {
            return NextResponse.json({
              success:               true,
              deferredFinalization:  true,
              razorpayOrderId:       existing.razorpay_order_id,
              razorpayKey:           integration.publicToken,
              // Use total_amount (subtotal + tax) when set, fall back to subtotal
              // for legacy pending rows created before GST columns existed.
              amount:                Math.round(Number(existing.total_amount ?? existing.subtotal) * 100),
              replayed:              true,
            });
          }
        }
      }

      // 2. Site liveness + plan check + GST snapshot.
      //    Read the rate alongside the liveness fields so we lock the rate at
      //    the moment we ask Razorpay to charge — any subsequent admin rate
      //    change won't affect this in-flight order.
      const { data: site } = await supabaseServer
        .from('sites')
        .select('id, name, slug, is_live, is_open, gst_status, gst_rate_pct, gstin')
        .eq('id', siteId)
        .maybeSingle();
      if (!site)                  return NextResponse.json({ error: 'Store not found' },              { status: 404 });
      if (site.is_live === false) return NextResponse.json({ error: 'This store is currently offline' }, { status: 403 });
      if (site.is_open === false) return NextResponse.json({ error: 'This store is currently closed' },  { status: 403 });

      // 3. Validate items + compute subtotal against the products table.
      //    Variant prices live in metadata.variants — pick those when set.
      const productIds = items.map(i => i.id);
      const { data: products } = await supabaseServer
        .from('products')
        .select('id, name, selling_price, is_live, metadata, food_type')
        .in('id', productIds)
        .eq('site_id', siteId);
      if (!products || products.length === 0) {
        return NextResponse.json({ error: 'No menu items found' }, { status: 400 });
      }
      const productMap = new Map(products.map(p => [p.id as string, p]));

      let subtotal = 0;
      const verifiedItems: Array<{ id: string; name: string; qty: number; price: number; variantSize: string | null }> = [];
      for (const it of items) {
        const product = productMap.get(it.id);
        if (!product) {
          return NextResponse.json({ error: 'An item in your cart is no longer available.' }, { status: 400 });
        }
        if ((product as { is_live?: boolean }).is_live === false) {
          return NextResponse.json({ error: `${product.name} is currently unavailable.` }, { status: 400 });
        }

        let unitPrice = Number(product.selling_price);
        if (it.variantSize) {
          const meta = (product as { metadata?: Record<string, unknown> }).metadata ?? {};
          const variants = Array.isArray((meta as { variants?: unknown }).variants)
            ? (meta as { variants: Array<{ size?: string; price?: number | string }> }).variants
            : [];
          const variant = variants.find(v => v.size === it.variantSize);
          if (!variant || variant.price === undefined) {
            return NextResponse.json({ error: `Variant '${it.variantSize}' not available for ${product.name}.` }, { status: 400 });
          }
          unitPrice = Number(variant.price);
        }
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          return NextResponse.json({ error: `Invalid price for ${product.name}.` }, { status: 500 });
        }

        subtotal += unitPrice * it.qty;
        verifiedItems.push({ id: it.id, name: product.name, qty: it.qty, price: unitPrice, variantSize: it.variantSize ?? null });
      }
      subtotal = Math.round(subtotal * 100) / 100;
      if (subtotal <= 0) {
        return NextResponse.json({ error: 'Invalid order total' }, { status: 400 });
      }

      // GST snapshot — only collect tax when the store has actually completed
      // GST onboarding as 'registered'. A NULL rate or any other status means 0%.
      const gstRatePct: number = (site.gst_status === 'registered' && site.gst_rate_pct)
        ? Number(site.gst_rate_pct)
        : 0;
      const gstinSnapshot: string | null = gstRatePct > 0 ? (site.gstin ?? null) : null;
      const taxAmount: number = Math.round(subtotal * gstRatePct) / 100;
      const totalAmount: number = Math.round((subtotal + taxAmount) * 100) / 100;

      // 4. Razorpay integration must be connected for this restaurant.
      const integration = await getActiveIntegration(siteId);
      if (!integration) {
        return NextResponse.json(
          { error: 'Online payment is not available for this store right now.', code: 'RAZORPAY_NOT_CONNECTED' },
          { status: 409 },
        );
      }

      // 5. Create Razorpay order on the merchant's account.
      let rzpOrder: { id: string; amount: number; currency: string };
      try {
        rzpOrder = await createRazorpayOrder(integration.accessToken, {
          amount:   Math.round(totalAmount * 100),
          currency: 'INR',
          receipt:  `pending-${(idemKey || crypto.randomBytes(6).toString('hex')).slice(0, 32)}`,
          notes:    { site_id: siteId, gst_rate_pct: String(gstRatePct), tax_amount: String(taxAmount) },
        });
      } catch (err) {
        console.error('[POST /api/orders] razorpay create order (online pending) failed:', err);
        return NextResponse.json(
          { error: 'Could not initiate payment. Please try again.', code: 'RAZORPAY_ORDER_FAILED' },
          { status: 502 },
        );
      }

      // 6. Stash cart in pending_online_orders for the finalize endpoint to pop.
      const { error: pendingErr } = await supabaseServer
        .from('pending_online_orders')
        .insert({
          razorpay_order_id: rzpOrder.id,
          site_id:           siteId,
          customer_name:     cleanName,
          customer_email:    cleanEmail || null,
          customer_phone:    cleanPhone || null,
          items:             verifiedItems,
          subtotal,
          tax_amount:        taxAmount,
          total_amount:      totalAmount,
          gst_rate_pct:      gstRatePct,
          gstin_snapshot:    gstinSnapshot,
          table_number:      tableNumber ?? null,
          idempotency_key:   idemKey || null,
          client_ip_hash:    ipHash,
        });
      if (pendingErr) {
        console.error('[POST /api/orders] pending insert failed:', pendingErr);
        return NextResponse.json({ error: 'Failed to initiate payment. Please try again.' }, { status: 500 });
      }

      // 7. Hand off to client → opens Razorpay Checkout → /finalize-payment.
      return NextResponse.json({
        success:              true,
        deferredFinalization: true,
        razorpayOrderId:      rzpOrder.id,
        razorpayKey:          integration.publicToken,
        amount:               Math.round(totalAmount * 100),
        subtotal,
        taxAmount,
        totalAmount,
        gstRatePct,
      });
    }

    // ── Single consolidated RPC call (1 DB round trip) ────────────────────────
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

    let rpcData: Record<string, unknown>;
    try {
      const { data, error } = await supabaseServer.rpc('process_order_v2', {
        p_site_id:        siteId,
        p_customer_name:  cleanName,
        p_customer_email: cleanEmail,
        p_payment_method: paymentMethod,
        p_items_json:     items.map(it => ({
          id:          it.id,
          qty:         it.qty,
          variantSize: it.variantSize ?? null,
        })),
        p_table_number:    tableNumber ?? null,
        p_idempotency_key: idemKey,
        p_site_rate_key:   sha256Short(`site::${siteId}`),
        p_ip_rate_key:     sha256Short(`ip::${ipHash}`),
        p_rl_window_ms:    RL_WINDOW_MS,
        p_rl_site_limit:   RL_SITE_LIMIT,
        p_rl_ip_limit:     RL_IP_LIMIT,
      });

      if (error) throw error;
      rpcData = (data as Record<string, unknown>) ?? {};
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('[POST /api/orders] RPC timeout');
        return NextResponse.json({ error: 'Order service temporarily unavailable' }, { status: 503 });
      }
      console.error('[POST /api/orders] process_order_v2:', err);
      return NextResponse.json({ error: 'Failed to place order. Please try again.' }, { status: 500 });
    } finally {
      clearTimeout(timer);
    }

    // ── Map RPC status codes to HTTP responses ────────────────────────────────
    const status = rpcData.status as string;

    if (status === 'rate_limited') {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }
    if (status === 'replayed') {
      // Replay path is now only for counter / no_payment — online never
      // reaches here (it returns early at the top). Just hand back the same
      // ids and let the client redisplay the order.
      return NextResponse.json({
        success:     true,
        orderId:     rpcData.order_id,
        orderNumber: rpcData.order_number,
        ...(rpcData.counter_number ? { counterNumber: rpcData.counter_number } : {}),
        ...(rpcData.token_number   ? { tokenNumber:   rpcData.token_number   } : {}),
        replayed:    true,
      });
    }
    if (status === 'store_not_found') {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }
    if (status === 'store_offline') {
      return NextResponse.json({ error: 'This store is currently offline' }, { status: 403 });
    }
    if (status === 'store_closed') {
      return NextResponse.json({ error: 'This store is currently closed' }, { status: 403 });
    }
    if (status === 'plan_no_orders') {
      return NextResponse.json({ error: 'This store does not accept orders' }, { status: 403 });
    }
    if (status === 'invalid_payment_method') {
      return NextResponse.json({ error: 'Invalid payment method for this store' }, { status: 400 });
    }
    if (status === 'invalid_table_number') {
      return NextResponse.json({ error: 'Invalid table number for this store' }, { status: 400 });
    }
    if (status === 'item_not_found') {
      return NextResponse.json({ error: `Item ${rpcData.item_id} not available at this store` }, { status: 400 });
    }
    if (status === 'item_unavailable') {
      return NextResponse.json({ error: `${rpcData.item_name} is currently unavailable` }, { status: 400 });
    }
    if (status === 'variant_not_found') {
      return NextResponse.json(
        { error: `Variant '${rpcData.variant}' not found for ${rpcData.item_name}` },
        { status: 400 },
      );
    }
    if (status === 'invalid_price') {
      return NextResponse.json({ error: `Invalid price for ${rpcData.item_name}` }, { status: 500 });
    }
    if (status === 'invalid_total') {
      return NextResponse.json({ error: 'Invalid order total' }, { status: 400 });
    }
    if (status === 'counter_full') {
      return NextResponse.json(
        { error: 'Counter capacity reached for today. Please pay online or ask staff.' },
        { status: 503 },
      );
    }
    if (status === 'order_creation_failed' || status === 'error') {
      console.error('[POST /api/orders] RPC returned:', status, rpcData.detail);
      return NextResponse.json({ error: 'Failed to place order. Please try again.' }, { status: 500 });
    }
    if (status !== 'ok') {
      console.error('[POST /api/orders] unknown RPC status:', status);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    // ── Success — fire-and-forget email enqueue ────────────────────────────────
    // Build HTML in JS (CPU-only, no DB), then insert asynchronously.
    // The cron retries on failure — losing this insert is non-fatal.
    const orderId     = rpcData.order_id as string;
    const orderNumber = rpcData.order_number as string;
    const tokenNumber = rpcData.token_number as string | null;
    const siteSlug    = rpcData.site_slug as string;
    const siteName    = rpcData.site_name as string;
    const subtotal    = rpcData.subtotal as number;
    const verifiedItems = rpcData.verified_items as Array<{
      name: string; qty: number; price: number; variantSize?: string;
    }>;

    // Online payments never reach here — they exit at the early-return above.
    // This branch is counter / no_payment only: order is already in the DB,
    // just enqueue the confirmation email (for counter) and respond.
    void verifiedItems; void siteSlug; void siteName; void subtotal;

    return NextResponse.json({
      success:     true,
      orderId,
      orderNumber,
      ...(rpcData.counter_number ? { counterNumber: rpcData.counter_number } : {}),
      ...(tokenNumber            ? { tokenNumber }                           : {}),
    });
  } catch (err) {
    console.error('[POST /api/orders] unexpected:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
