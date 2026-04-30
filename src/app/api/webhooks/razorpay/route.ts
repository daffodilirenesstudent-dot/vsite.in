// /api/webhooks/razorpay
//
// Razorpay webhook listener for ORDER-based payments (manual, no autopay).
// This is a fallback — `verify-payment` is the primary activation path.
//
// Handles:
//   - order.paid: Order fully paid → activate/extend plan
//   - payment.captured: Payment captured → activate/extend plan
//
// Must be:
//   - Signature-verified (timing-safe HMAC of the raw body)
//   - Idempotent (Razorpay retries on non-2xx)

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase-server';

export const maxDuration = 15;
export const runtime = 'nodejs';

type PaymentEntity = {
    id: string;
    amount: number;
    currency: string;
    order_id?: string;
    status?: string;
};

type WebhookEvent = {
    event: string;
    payload: {
        payment?: { entity: PaymentEntity };
        order?: { entity: { id: string; amount: number; status: string } };
    };
};

function timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    } catch {
        return false;
    }
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return timingSafeEqualHex(expected, signature);
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature') ?? '';
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
        console.error('[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not set');
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    if (!signature || !verifySignature(rawBody, signature, secret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    let event: WebhookEvent;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ ok: true });
    }

    const paymentEntity = event.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id ?? event.payload?.order?.entity?.id;

    if (!orderId) {
        return NextResponse.json({ ok: true });
    }

    try {
        switch (event.event) {
            case 'order.paid':
            case 'payment.captured':
                await handlePaymentSuccess(orderId, paymentEntity);
                break;
            default:
                console.log(`[razorpay-webhook] unhandled event: ${event.event}`);
        }
    } catch (err) {
        console.error(`[razorpay-webhook] handler error for ${event.event}:`, err);
    }

    return NextResponse.json({ ok: true });
}

async function findSiteByOrderId(orderId: string) {
    // razorpay_subscription_id column is reused to store the order_id
    const { data, error } = await supabaseServer
        .from('site_subscriptions')
        .select('site_id, user_id')
        .eq('razorpay_subscription_id', orderId)
        .maybeSingle();

    if (error) {
        console.error('[razorpay-webhook] site lookup error:', error);
        return null;
    }
    if (!data) {
        console.warn('[razorpay-webhook] no site for order:', orderId);
        return null;
    }
    return data;
}

async function handlePaymentSuccess(orderId: string, payment?: PaymentEntity) {
    const site = await findSiteByOrderId(orderId);
    if (!site) return;

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabaseServer.from('site_subscriptions').upsert(
        {
            site_id: site.site_id,
            user_id: site.user_id,
            store_plan: 'qr_menu',
            store_expires_at: expiresAt,
            razorpay_subscription_id: orderId,
            razorpay_status: 'active',
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'site_id' }
    );

    if (payment) {
        // Deduplicate by checking first
        const { count } = await supabaseServer
            .from('billing_history')
            .select('*', { count: 'exact', head: true })
            .eq('razorpay_payment_id', payment.id);

        if (!count || count === 0) {
            const amountInr = Math.round(payment.amount / 100);
            const { error } = await supabaseServer.from('billing_history').insert({
                user_id: site.user_id,
                plan_name: `Smart QR Menu — Payment (webhook)`,
                amount: amountInr,
                currency: payment.currency,
                status: 'Success',
                razorpay_payment_id: payment.id,
            });

            if (error && error.code !== '23505') {
                console.error('[razorpay-webhook] billing insert failed:', error);
            }
        }
    }
}
