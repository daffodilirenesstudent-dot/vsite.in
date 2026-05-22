// POST /api/orders/whatsapp
//
// Public endpoint for the WhatsApp-ordering flow (qr_order plan + the
// "WhatsApp order taking" toggle in store settings).
//
// Flow:
//   1. Validate items + prices server-side (same defence-in-depth as the
//      main order route — we never trust the client's prices).
//   2. Compute GST snapshot from the store's current rate.
//   3. Insert the order with payment_method='no_payment', payment_status='paid',
//      status='completed', is_whatsapp_order=TRUE. No token / counter / KOT —
//      the restaurant fulfils via the WhatsApp chat the customer is about to open.
//   4. Insert a transactions row with payment_mode='Manual Pay' so insights
//      and the admin transactions page count the order without misclaiming
//      a real payment method.
//   5. Build a wa.me URL with a prefilled message and return it.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { currencySymbol } from '@/lib/currency';
import crypto from 'crypto';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const runtime    = 'nodejs';

const MAX_ITEMS       = 50;
const MAX_NAME_LEN    = 80;
const MAX_PHONE_LEN   = 20;
const MAX_QTY         = 99;

function sanitizeName(s: string, max: number): string {
    return s.replace(/[\x00-\x1F\x7F-\x9F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

interface IncomingItem {
    id: string;
    qty: number;
    variantSize?: string;
}

interface VerifiedItem {
    product_id:   string;
    product_name: string;
    variant_name: string;
    quantity:     number;
    unit_price:   number;
    subtotal:     number;
}

function buildPrefilledMessage(opts: {
    siteName: string;
    customerName: string;
    items: VerifiedItem[];
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    currency: string;
    orderNumber: string;
}): string {
    const sym = currencySymbol(opts.currency);
    const lines: string[] = [];
    lines.push(`Hi ${opts.siteName}, I'd like to place an order:`);
    lines.push('');
    lines.push(`Name: ${opts.customerName}`);
    lines.push(`Order #${opts.orderNumber}`);
    lines.push('');
    opts.items.forEach((it, idx) => {
        const variant = it.variant_name ? ` (${it.variant_name})` : '';
        lines.push(`${idx + 1}) ${it.product_name}${variant} x ${it.quantity} — ${sym}${(it.unit_price * it.quantity).toFixed(2)}`);
    });
    lines.push('');
    if (opts.taxAmount > 0) {
        lines.push(`Subtotal: ${sym}${opts.subtotal.toFixed(2)}`);
        lines.push(`GST: ${sym}${opts.taxAmount.toFixed(2)}`);
    }
    lines.push(`Total: ${sym}${opts.totalAmount.toFixed(2)}`);
    return lines.join('\n');
}

export async function POST(request: NextRequest) {
    let body: {
        siteId?: string;
        customerName?: string;
        customerPhone?: string;
        items?: IncomingItem[];
        tableNumber?: number;
    };
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const { siteId, customerName, customerPhone, items, tableNumber } = body;

    // ── Validate input ──────────────────────────────────────────────────────
    if (!siteId || !/^[0-9a-f-]{36}$/i.test(siteId)) {
        return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 });
    }
    const cleanName = sanitizeName(customerName ?? '', MAX_NAME_LEN);
    if (!cleanName) return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    const cleanPhone = (customerPhone ?? '').trim().slice(0, MAX_PHONE_LEN);
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
        return NextResponse.json({ error: `Order must have 1-${MAX_ITEMS} items` }, { status: 400 });
    }
    for (const it of items) {
        if (!it?.id || !/^[0-9a-f-]{36}$/i.test(it.id))           return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
        if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAX_QTY) return NextResponse.json({ error: 'Invalid item qty' }, { status: 400 });
    }

    // ── Site lookup ─────────────────────────────────────────────────────────
    const { data: site } = await supabaseServer
        .from('sites')
        .select('id, name, slug, is_live, is_open, whatsapp_order_taking, whatsapp_order_number, gst_status, gst_rate_pct, gstin, currency_code')
        .eq('id', siteId)
        .maybeSingle();
    if (!site)                  return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    if (site.is_live === false) return NextResponse.json({ error: 'This store is currently offline' }, { status: 403 });
    if (site.is_open === false) return NextResponse.json({ error: 'This store is currently closed' }, { status: 403 });
    if (!site.whatsapp_order_taking || !site.whatsapp_order_number) {
        return NextResponse.json({ error: 'WhatsApp ordering is not enabled for this store' }, { status: 409 });
    }

    // ── Validate items + compute subtotal against the products table ───────
    const productIds = items.map(i => i.id);
    const { data: products } = await supabaseServer
        .from('products')
        .select('id, name, selling_price, is_live, metadata')
        .in('id', productIds)
        .eq('site_id', siteId);
    if (!products || products.length === 0) {
        return NextResponse.json({ error: 'No menu items found' }, { status: 400 });
    }
    const productMap = new Map(products.map(p => [p.id as string, p]));

    const verifiedItems: VerifiedItem[] = [];
    const displayItems: Array<{ name: string; qty: number; price: number; variantSize?: string }> = [];
    let subtotal = 0;
    for (const it of items) {
        const product = productMap.get(it.id);
        if (!product)                                             return NextResponse.json({ error: 'An item in your cart is no longer available.' }, { status: 400 });
        if ((product as { is_live?: boolean }).is_live === false) return NextResponse.json({ error: `${product.name} is currently unavailable.` }, { status: 400 });

        let unitPrice = Number(product.selling_price);
        if (it.variantSize) {
            const meta = (product as { metadata?: Record<string, unknown> }).metadata ?? {};
            const variants = Array.isArray((meta as { variants?: unknown }).variants)
                ? (meta as { variants: Array<{ size?: string; price?: number | string }> }).variants
                : [];
            const v = variants.find(x => x.size === it.variantSize);
            if (!v || v.price === undefined) {
                return NextResponse.json({ error: `Variant '${it.variantSize}' not available for ${product.name}.` }, { status: 400 });
            }
            unitPrice = Number(v.price);
        }
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            return NextResponse.json({ error: `Invalid price for ${product.name}.` }, { status: 500 });
        }
        const lineSubtotal = Math.round(unitPrice * it.qty * 100) / 100;
        subtotal += lineSubtotal;
        verifiedItems.push({
            product_id:   it.id,
            product_name: product.name,
            variant_name: it.variantSize ?? '',
            quantity:     it.qty,
            unit_price:   unitPrice,
            subtotal:     lineSubtotal,
        });
        displayItems.push({ name: product.name, qty: it.qty, price: unitPrice, variantSize: it.variantSize });
    }
    subtotal = Math.round(subtotal * 100) / 100;
    if (subtotal <= 0) return NextResponse.json({ error: 'Invalid order total' }, { status: 400 });

    // ── GST snapshot (same rule as the main flow: only when registered) ────
    const gstRatePct: number = (site.gst_status === 'registered' && site.gst_rate_pct) ? Number(site.gst_rate_pct) : 0;
    const taxAmount  = Math.round(subtotal * gstRatePct) / 100;
    const cgstAmount = Math.round(taxAmount * 50) / 100;
    const sgstAmount = Math.round((taxAmount - cgstAmount) * 100) / 100;
    const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
    const gstinSnapshot = gstRatePct > 0 ? (site.gstin ?? null) : null;
    const currency = site.currency_code ?? 'INR';

    // ── Insert order row directly (no RPC — WhatsApp flow skips token/counter) ─
    const orderNumber = ((Math.floor(Math.random() * 9_000_000) + 1_000_000)).toString();
    const { data: inserted, error: insErr } = await supabaseServer
        .from('orders')
        .insert({
            site_id:           siteId,
            order_number:      orderNumber,
            customer_name:     cleanName,
            customer_email:    null,
            customer_phone:    cleanPhone || null,
            payment_method:    'no_payment',
            payment_status:    'paid',
            status:            'completed',
            items:             displayItems,
            subtotal,
            total_amount:      totalAmount,
            tax_amount:        taxAmount,
            cgst_amount:       cgstAmount,
            sgst_amount:       sgstAmount,
            gst_rate_pct:      gstRatePct,
            gstin_snapshot:    gstinSnapshot,
            is_whatsapp_order: true,
            currency_code:     currency,
            table_number:      tableNumber != null ? String(tableNumber) : null,
            token_number:      null,
            counter_number:    null,
        })
        .select('id')
        .single();

    if (insErr || !inserted) {
        console.error('[POST /orders/whatsapp] insert failed:', insErr);
        return NextResponse.json({ error: 'Failed to record order' }, { status: 500 });
    }

    // Order items + transaction (fire-and-forget for items, awaited for txn).
    const orderItemsRows = verifiedItems.map(v => ({
        order_id:     inserted.id,
        product_id:   v.product_id,
        product_name: v.product_name,
        variant_name: v.variant_name,
        quantity:     v.quantity,
        unit_price:   v.unit_price,
        subtotal:     v.subtotal,
    }));
    await supabaseServer.from('order_items').insert(orderItemsRows);

    const txnId = 'TXN' + Date.now().toString() + crypto.randomBytes(2).toString('hex').toUpperCase();
    await supabaseServer.from('transactions').insert({
        site_id:        siteId,
        order_id:       inserted.id,
        txn_id:         txnId,
        customer_email: null,
        amount:         totalAmount,
        currency:       currency,
        status:         'Success',
        payment_mode:   'Manual Pay',
        gateway_ref:    null,
    });

    // ── Build the wa.me redirect URL with prefilled message ────────────────
    const prefilled = buildPrefilledMessage({
        siteName:    site.name,
        customerName: cleanName,
        items:       verifiedItems,
        subtotal,
        taxAmount,
        totalAmount,
        currency,
        orderNumber,
    });
    // Strip the leading + and any non-digits — wa.me needs bare digits.
    const phoneDigits = (site.whatsapp_order_number ?? '').replace(/[^\d]/g, '');
    const whatsappUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(prefilled)}`;

    return NextResponse.json({
        success:     true,
        orderId:     inserted.id,
        orderNumber,
        whatsappUrl,
        prefilledMessage: prefilled,
    });
}
