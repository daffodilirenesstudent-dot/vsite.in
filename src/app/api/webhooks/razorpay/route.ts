import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabase-server';

// Razorpay retries on non-2xx. Always return 200 after signature check.
// Only 400 for invalid signatures (stop retrying garbage requests).

type WebhookEvent = {
    event: string;
    payload: {
        subscription: { entity: { id: string; status: string } };
        payment?: { entity: { id: string; amount: number; currency: string } };
    };
};

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return expected === signature;
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const signature = request.headers.get('x-razorpay-signature') ?? '';
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';

    if (!signature || !verifySignature(rawBody, signature, secret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    let event: WebhookEvent;
    try {
        event = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ ok: true }); // malformed JSON after valid sig — ignore
    }

    const subscriptionId = event.payload?.subscription?.entity?.id;
    const paymentEntity = event.payload?.payment?.entity;

    switch (event.event) {
        case 'subscription.activated':
            await handleActivated(subscriptionId, paymentEntity);
            break;
        case 'subscription.charged':
            await handleCharged(subscriptionId, paymentEntity);
            break;
        case 'subscription.halted':
        case 'subscription.cancelled':
            await handleDeactivated(subscriptionId, event.event);
            break;
        default:
            console.log(`[razorpay-webhook] unhandled event: ${event.event}`);
    }

    return NextResponse.json({ ok: true });
}

async function findSiteBySubscriptionId(subscriptionId: string) {
    const { data, error } = await supabaseServer
        .from('site_subscriptions')
        .select('site_id, user_id')
        .eq('razorpay_subscription_id', subscriptionId)
        .single();

    if (error || !data) {
        console.error('[razorpay-webhook] site not found for subscription:', subscriptionId);
        return null;
    }
    return data;
}

async function handleActivated(
    subscriptionId: string,
    payment?: { id: string; amount: number; currency: string }
) {
    const site = await findSiteBySubscriptionId(subscriptionId);
    if (!site) return;

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabaseServer.from('site_subscriptions').upsert(
        {
            site_id: site.site_id,
            user_id: site.user_id,
            store_plan: 'qr_menu',
            store_expires_at: expiresAt,
            razorpay_subscription_id: subscriptionId,
            razorpay_status: 'active',
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'site_id' }
    );

    if (payment) {
        await supabaseServer.from('billing_history').insert({
            user_id: site.user_id,
            plan_name: 'Smart QR Menu — Setup + First Month',
            amount: Math.round(payment.amount / 100),
            currency: payment.currency,
            status: 'Success',
            razorpay_payment_id: payment.id,
        });
    }
}

async function handleCharged(
    subscriptionId: string,
    payment?: { id: string; amount: number; currency: string }
) {
    const site = await findSiteBySubscriptionId(subscriptionId);
    if (!site) return;

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabaseServer.from('site_subscriptions').upsert(
        {
            site_id: site.site_id,
            user_id: site.user_id,
            store_expires_at: expiresAt,
            razorpay_subscription_id: subscriptionId,
            razorpay_status: 'active',
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'site_id' }
    );

    if (payment) {
        await supabaseServer.from('billing_history').insert({
            user_id: site.user_id,
            plan_name: 'Smart QR Menu — Monthly Renewal',
            amount: Math.round(payment.amount / 100),
            currency: payment.currency,
            status: 'Success',
            razorpay_payment_id: payment.id,
        });
    }
}

async function handleDeactivated(subscriptionId: string, eventName: string) {
    const site = await findSiteBySubscriptionId(subscriptionId);
    if (!site) return;

    const status = eventName === 'subscription.halted' ? 'halted' : 'cancelled';

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
