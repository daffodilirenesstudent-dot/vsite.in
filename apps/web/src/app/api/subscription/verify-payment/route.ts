// /api/subscription/verify-payment
//
// Verifies a Razorpay ORDER payment and activates the plan.
// Uses Razorpay Orders API (manual payment) — NOT Subscriptions (autopay).
//
// Security model — every check must pass:
//   1. Firebase Bearer token → userId
//   2. Razorpay HMAC signature on (order_id|payment_id), timing-safe
//   3. Site belongs to the authenticated user
//   4. The order_id matches the one we issued for this site
//   5. Razorpay's API confirms the payment is `captured`, is bound to THIS
//      order, and covers at least the plan price
//   6. The activation UPDATE is conditional on razorpay_status='created', so a
//      replayed payload matches no row and adds no time
//   7. Period is set to 30 days from payment confirmation
//
// ─── WHY THE ACTIVATION IS A CONDITIONAL UPDATE ──────────────────────────────
// The Razorpay signature is a static HMAC over `order_id|payment_id`. It never
// expires, and Checkout hands it to the customer's own browser — so the caller
// permanently holds a payload that passes checks 1-5. The only thing standing
// between that and unlimited 30-day extensions is that the UPDATE below matches
// a row exactly once: it requires razorpay_status='created', and its own success
// sets the status to 'active'. Every subsequent replay matches zero rows.
//
// Do not "simplify" this into an unconditional update. It was one once, and one
// ₹299 payment bought an unlimited subscription (2026-09 assessment, Finding 1).
// `webhooks/razorpay/route.ts` carries the same guard for the same reason; the
// two must stay in step.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { rateLimit } from '@/lib/platform/rateLimit';
import { notify } from '@/lib/notifications/notify';
import { PLAN_PRICES_INR } from '@/lib/platform/productFlags';

import { logger } from '@/lib/platform/logger';
export const maxDuration = 30;
export const runtime = 'nodejs';

// Pricing is enforced upstream in create-subscription/route.ts. Here we just
// validate the plan name; the actual amount paid comes back from Razorpay
// (payment.amount) and is recorded as-is in billing_history.
const VALID_PLANS = new Set(['qr_menu', 'qr_order', 'pay_eat']);

function timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    } catch {
        return false;
    }
}

export async function POST(request: NextRequest) {
    try {
        // ── Auth ────────────────────────────────────────────────────────────
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
        if (!userId) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // ── Rate limit ──────────────────────────────────────────────────────
        const rl = rateLimit(`verify-payment:${userId}`, { limit: 10, windowMs: 60 * 60_000 });
        if (!rl.allowed) {
            return NextResponse.json(
                { error: 'Too many attempts. Please try again later.' },
                { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
            );
        }

        // ── Parse body ──────────────────────────────────────────────────────
        let body: {
            razorpay_payment_id?: string;
            razorpay_order_id?: string;
            razorpay_signature?: string;
            siteId?: string;
        };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, siteId } = body;
        if (
            !razorpay_payment_id || typeof razorpay_payment_id !== 'string' ||
            !razorpay_order_id || typeof razorpay_order_id !== 'string' ||
            !razorpay_signature || typeof razorpay_signature !== 'string' ||
            !siteId || typeof siteId !== 'string'
        ) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // ── Verify Razorpay signature (timing-safe) ──────────────────────────
        // For Orders: HMAC_SHA256(order_id + "|" + payment_id, key_secret)
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        const keyId = process.env.RAZORPAY_KEY_ID;
        if (!keySecret || !keyId) {
            console.error('[verify-payment] missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET');
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }

        const expectedSig = crypto
            .createHmac('sha256', keySecret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (!timingSafeEqualHex(expectedSig, razorpay_signature)) {
            return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
        }

        // A billing row alone is NOT proof of activation — the webhook may have
        // raced ahead and written one before the subscription flipped. So we
        // still fall through here; the conditional UPDATE further down is what
        // actually decides, and it is the only thing that can.

        // ── Verify site belongs to this user ────────────────────────────────
        const { data: site, error: siteError } = await supabaseServer
            .from('sites')
            .select('id')
            .eq('id', siteId)
            .eq('user_id', userId)
            .single();

        if (siteError || !site) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        // ── Load the subscription row ───────────────────────────────────────
        // razorpay_subscription_id column is reused to store the order_id.
        // razorpay_status is load-bearing twice below: once for the retry
        // short-circuit, once as the predicate on the activation UPDATE.
        const { data: existingSub } = await supabaseServer
            .from('site_subscriptions')
            .select('id, razorpay_subscription_id, store_expires_at, store_plan, pending_plan, razorpay_status')
            .eq('site_id', siteId)
            .single();

        if (!existingSub) {
            return NextResponse.json({ error: 'Order mismatch' }, { status: 400 });
        }

        // ── Idempotent short-circuit for an honest retry ─────────────────────
        // A double click, a flaky network, or a client retrying after the webhook
        // won the race all re-POST this exact body — against a row whose
        // razorpay_subscription_id the first successful call has since nulled.
        // Without this, the order-match check below answers "Order mismatch" to
        // someone whose money has already left, on the one route that must never
        // look broken.
        //
        // This does NOT weaken the replay guard: it only returns early when the
        // payment is ALREADY recorded against THIS site, which is the case where
        // the conditional UPDATE would have matched nothing anyway. It reports
        // the stored expiry and adds no time.
        if (existingSub.razorpay_status === 'active') {
            const { count: alreadyBilled } = await supabaseServer
                .from('billing_history')
                .select('id', { count: 'exact', head: true })
                .eq('razorpay_payment_id', razorpay_payment_id)
                .eq('site_id', siteId);

            if (alreadyBilled && alreadyBilled > 0) {
                logger.debug(`[verify-payment] retry of a completed payment for site=${siteId}`);
                return NextResponse.json({
                    success: true,
                    alreadyActive: true,
                    expiresAt: existingSub.store_expires_at ?? null,
                });
            }
        }

        // ── order_id must match the one we issued for this site ─────────────
        if (existingSub.razorpay_subscription_id !== razorpay_order_id) {
            return NextResponse.json({ error: 'Order mismatch' }, { status: 400 });
        }

        // ── Confirm with Razorpay that the money actually moved ─────────────
        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

        let payment: { status: string; amount: number; currency: string; orderId: string };
        try {
            const fetched = await razorpay.payments.fetch(razorpay_payment_id);
            payment = {
                status: String(fetched.status ?? ''),
                amount: typeof fetched.amount === 'number' ? fetched.amount : Number(fetched.amount ?? 0),
                currency: String(fetched.currency ?? ''),
                orderId: String(fetched.order_id ?? ''),
            };
        } catch (err) {
            console.error('[verify-payment] razorpay payments.fetch failed:', err);
            return NextResponse.json({ error: 'Could not verify payment with Razorpay' }, { status: 502 });
        }

        // Razorpay's own record of which order this payment settled must agree
        // with the order_id we were handed. The HMAC covers the pair, so forging
        // a mismatch needs the key secret — but this costs one comparison and
        // removes the need to reason about that.
        if (payment.orderId && payment.orderId !== razorpay_order_id) {
            console.error(
                `[verify-payment] payment/order mismatch: payment ${razorpay_payment_id} belongs to ${payment.orderId}, not ${razorpay_order_id}`,
            );
            return NextResponse.json({ error: 'Payment does not belong to this order' }, { status: 400 });
        }

        // `authorized` means the bank reserved the funds and Razorpay has NOT
        // taken them. Uncaptured authorizations auto-void (~5 days), so treating
        // one as paid hands out 30 days for money that never arrives. It is not
        // an error — the capture usually lands seconds later — so the client is
        // told to retry rather than shown a failure.
        if (payment.status === 'authorized') {
            return NextResponse.json(
                {
                    error: 'Payment is still being confirmed. This usually takes a few seconds.',
                    code: 'PAYMENT_PENDING',
                },
                { status: 202 },
            );
        }
        if (payment.status !== 'captured') {
            return NextResponse.json(
                { error: `Payment not completed (status: ${payment.status})` },
                { status: 400 }
            );
        }

        // ── Determine which plan was paid for ────────────────────────────────
        // create-subscription wrote the user's chosen plan to pending_plan on
        // the same row we're now updating. Reading from our own DB removes the
        // dependency on Razorpay's notes round-trip (which was unreliable in
        // testing — the wrong plan was being activated).
        const rawPlan = String(existingSub.pending_plan ?? existingSub.store_plan ?? 'qr_menu');
        const paidPlan = VALID_PLANS.has(rawPlan) ? rawPlan : 'qr_menu';

        // ── The money must actually cover the plan ───────────────────────────
        // Razorpay binds a payment's amount to its order, so this should never
        // fire in normal operation. It fires if the order was created against a
        // different price than the plan we are about to grant — a mismatch we
        // want to hear about rather than silently honour. Overpayment is allowed
        // through (refusing it would take the customer's money and give nothing)
        // but is logged.
        const expectedPaise = (PLAN_PRICES_INR[paidPlan] ?? PLAN_PRICES_INR.qr_menu) * 100;
        if (payment.amount < expectedPaise) {
            console.error(
                `[verify-payment] underpayment: ${payment.amount} paise received for ${paidPlan}, expected ${expectedPaise}`,
            );
            return NextResponse.json(
                { error: 'Payment amount does not cover the selected plan' },
                { status: 400 },
            );
        }
        if (payment.amount > expectedPaise) {
            console.warn(
                `[verify-payment] overpayment accepted: ${payment.amount} paise for ${paidPlan}, expected ${expectedPaise}`,
            );
        }

        // ── Calculate expiry ─────────────────────────────────────────────────
        // Upgrade (plan change): always start fresh from today — the old plan's
        // remaining days do not carry over to the new plan.
        // Renewal (same plan): carry over remaining days so early renewal
        // doesn't waste time the user already paid for.
        const isUpgrade = existingSub.store_plan && existingSub.store_plan !== paidPlan;
        const currentExpiryMs = existingSub.store_expires_at
            ? new Date(existingSub.store_expires_at).getTime()
            : 0;
        const baseMs = isUpgrade ? Date.now() : Math.max(Date.now(), currentExpiryMs);
        const expiresAt = new Date(baseMs + 30 * 24 * 60 * 60 * 1000).toISOString();
        logger.debug(`[verify-payment] activating plan=${paidPlan} (from pending_plan) for site=${siteId}`);
        const planLabel = paidPlan === 'qr_menu'  ? 'Smart QR Menu'
                        : paidPlan === 'qr_order' ? 'QR Ordering'
                        : 'Pay & Eat';

        // ── Record billing history first ────────────────────────────────────
        // Insert billing record before activating the subscription so a failed
        // billing write aborts cleanly without leaving the subscription active.
        const amountInr = Math.round(payment.amount / 100);
        const { error: billingError } = await supabaseServer
            .from('billing_history')
            .insert({
                user_id: userId,
                // Which store this paid for. Without it the subscription page
                // cannot separate one store's invoices from another's.
                site_id: siteId,
                plan_name: `${planLabel} — Monthly`,
                amount: amountInr,
                currency: payment.currency || 'INR',
                status: 'Success',
                razorpay_payment_id,
            });

        // 23505 = unique_violation — webhook already inserted; that's fine,
        // we still need to flip site_subscriptions to active.
        if (billingError && billingError.code !== '23505') {
            console.error('[verify-payment] billing_history insert failed:', billingError);
            return NextResponse.json({ error: 'Failed to record billing' }, { status: 500 });
        }
        if (billingError?.code === '23505') {
            logger.debug('[verify-payment] billing already recorded (likely by webhook); proceeding to activate subscription');
        }

        // ── Activate (exactly once per order) ───────────────────────────────
        // `.eq('razorpay_status', 'created')` is the replay guard. The row is
        // left in 'created' by create-subscription and set to 'active' here, so
        // this matches on the first call and never again — the same predicate
        // the Razorpay webhook uses. `razorpay_subscription_id` is nulled so the
        // consumed order cannot be presented against a future 'created' row
        // either, and expiry_reminder_sent_at is cleared so the T-3 reminder
        // fires fresh for the new cycle.
        const activatedAt = new Date().toISOString();
        const { data: activated, error: updateError } = await supabaseServer
            .from('site_subscriptions')
            .update({
                store_plan: paidPlan,
                store_expires_at: expiresAt,
                razorpay_status: 'active',
                pending_plan: null,               // consumed
                razorpay_subscription_id: null,   // order consumed — cannot be replayed
                expiry_reminder_sent_at: null,    // reset for new cycle
                updated_at: activatedAt,
            })
            .eq('site_id', siteId)
            .eq('razorpay_status', 'created')
            .select('site_id');

        if (updateError) {
            console.error('[verify-payment] site_subscriptions update failed:', updateError);
            return NextResponse.json({ error: 'Failed to activate subscription' }, { status: 500 });
        }

        // Zero rows means this order was already redeemed — by an earlier call,
        // or by the webhook winning the race. Either way the plan is active and
        // there is nothing left to do. Report the expiry ALREADY on the row, not
        // the one computed above: returning `expiresAt` here is exactly the bug
        // this guard exists to prevent.
        if (!activated || activated.length === 0) {
            logger.debug(`[verify-payment] order ${razorpay_order_id} already redeemed for site=${siteId}`);
            return NextResponse.json({
                success: true,
                alreadyActive: true,
                expiresAt: existingSub.store_expires_at ?? null,
            });
        }

        // Drop a notification in the user's inbox.
        notify({
          userId,
          siteId,
          type:  'subscription_activated',
          title: `${planLabel} plan activated`,
          body:  `Your store is live for 30 days. Valid till ${new Date(expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.`,
          link:  '/manage/subscription',
        });

        return NextResponse.json({ success: true, expiresAt });
    } catch (err) {
        console.error('[verify-payment] error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
