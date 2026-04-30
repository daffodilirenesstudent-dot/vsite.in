// /api/webhooks/razorpay
//
// Razorpay event listener. This is a fallback and reconciliation path —
// `verify-payment` is the primary activation path. Webhooks must be:
//   - Signature-verified (timing-safe HMAC of the raw body)
//   - Idempotent (Razorpay retries on non-2xx and may redeliver after 2xx too)
//   - Resilient to events arriving out of order or for unknown subscriptions
//
// Razorpay retries on non-2xx. We return 200 after a valid signature; only
// invalid signatures return 4xx (so Razorpay stops retrying garbage).

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase-server';

// Razorpay retries on non-2xx; long timeouts cascade. Keep tight.
export const maxDuration = 15;
export const runtime = 'nodejs';

type PaymentEntity = { id: string; amount: number; currency: string };

type WebhookEvent = {
    event: string;
    payload: {
        subscription: { entity: { id: string; status: string; current_end?: number } };
        payment?: { entity: PaymentEntity };
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

function periodEndIso(currentEnd: number | undefined): string {
    if (currentEnd && currentEnd > 0) return new Date(currentEnd * 1000).toISOString();
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature') ?? '';
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Hard-fail when the secret is missing. An empty fallback would let an
    // attacker forge events by computing HMAC with an empty key.
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
        return NextResponse.json({ ok: true }); // malformed JSON after valid sig — ignore
    }

    const subscriptionEntity = event.payload?.subscription?.entity;
    const subscriptionId = subscriptionEntity?.id;
    const currentEnd = subscriptionEntity?.current_end;
    const paymentEntity = event.payload?.payment?.entity;

    if (!subscriptionId) {
        // Subscription-less event (or wrong shape) — ack and ignore.
        return NextResponse.json({ ok: true });
    }

    try {
        switch (event.event) {
            case 'subscription.activated':
                await handleActivated(subscriptionId, currentEnd, paymentEntity);
                break;
            case 'subscription.charged':
                await handleCharged(subscriptionId, currentEnd, paymentEntity);
                break;
            case 'subscription.halted':
            case 'subscription.cancelled':
            case 'subscription.paused':
                await handleDeactivated(subscriptionId, event.event);
                break;
            default:
                console.log(`[razorpay-webhook] unhandled event: ${event.event}`);
        }
    } catch (err) {
        // Log and still ack — surfacing 5xx triggers Razorpay retries which
        // for already-applied state-changes would just churn. Reconciliation
        // can be done from billing_history audit if needed.
        console.error(`[razorpay-webhook] handler error for ${event.event}:`, err);
    }

    return NextResponse.json({ ok: true });
}

async function findSiteBySubscriptionId(subscriptionId: string) {
    const { data, error } = await supabaseServer
        .from('site_subscriptions')
        .select('site_id, user_id')
        .eq('razorpay_subscription_id', subscriptionId)
        .maybeSingle();

    if (error) {
        console.error('[razorpay-webhook] site lookup error:', error);
        return null;
    }
    if (!data) {
        console.warn('[razorpay-webhook] no site for subscription:', subscriptionId);
        return null;
    }
    return data;
}

async function recordBillingIfNew(
    userId: string,
    payment: PaymentEntity,
    planLabel: string,
) {
    // Defence in depth: also pre-checked, but UNIQUE(razorpay_payment_id) is
    // the real guard against duplicates from concurrent webhook redeliveries.
    const { count } = await supabaseServer
        .from('billing_history')
        .select('*', { count: 'exact', head: true })
        .eq('razorpay_payment_id', payment.id);

    if (count && count > 0) return;

    const { error } = await supabaseServer.from('billing_history').insert({
        user_id: userId,
        plan_name: planLabel,
        amount: Math.round(payment.amount / 100),
        currency: payment.currency,
        status: 'Success',
        razorpay_payment_id: payment.id,
    });

    if (error && error.code !== '23505') {
        console.error('[razorpay-webhook] billing insert failed:', error);
    }
}

async function handleActivated(
    subscriptionId: string,
    currentEnd: number | undefined,
    payment?: PaymentEntity,
) {
    const site = await findSiteBySubscriptionId(subscriptionId);
    if (!site) return;

    await supabaseServer.from('site_subscriptions').upsert(
        {
            site_id: site.site_id,
            user_id: site.user_id,
            store_plan: 'qr_menu',
            store_expires_at: periodEndIso(currentEnd),
            razorpay_subscription_id: subscriptionId,
            razorpay_status: 'active',
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'site_id' }
    );

    if (payment) {
        await recordBillingIfNew(site.user_id, payment, 'Smart QR Menu — Setup + First Month');
    }
}

async function handleCharged(
    subscriptionId: string,
    currentEnd: number | undefined,
    payment?: PaymentEntity,
) {
    const site = await findSiteBySubscriptionId(subscriptionId);
    if (!site) return;

    await supabaseServer.from('site_subscriptions').upsert(
        {
            site_id: site.site_id,
            user_id: site.user_id,
            store_plan: 'qr_menu',
            store_expires_at: periodEndIso(currentEnd),
            razorpay_subscription_id: subscriptionId,
            razorpay_status: 'active',
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'site_id' }
    );

    if (payment) {
        await recordBillingIfNew(site.user_id, payment, 'Smart QR Menu — Monthly Renewal');
    }
}

async function handleDeactivated(subscriptionId: string, eventName: string) {
    const site = await findSiteBySubscriptionId(subscriptionId);
    if (!site) return;

    const status =
        eventName === 'subscription.halted' ? 'halted'
        : eventName === 'subscription.paused' ? 'paused'
        : 'cancelled';

    await supabaseServer.from('site_subscriptions').upsert(
        {
            site_id: site.site_id,
            user_id: site.user_id,
            store_expires_at: null,
            razorpay_subscription_id: subscriptionId,
            razorpay_status: status,
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'site_id' }
    );
}
