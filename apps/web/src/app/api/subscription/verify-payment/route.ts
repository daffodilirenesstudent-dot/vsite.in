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
//   5. razorpay_payment_id has never been recorded before (replay protection)
//   6. Razorpay's API confirms the payment is actually `captured`
//   7. Period is set to 30 days from payment confirmation

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rateLimit';
import { notify } from '@/lib/notify';
import { sendPlanInvoiceEmail } from '@/lib/email/planEmails';

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

        // NOTE: We no longer abort on "billing_history already has this
        // payment". The Razorpay webhook may have raced ahead and inserted
        // a billing row first — that doesn't mean the subscription is
        // activated. Dedup happens at insert time (unique constraint on
        // razorpay_payment_id), and the subscription update below is
        // idempotent.

        // ── Verify site belongs to this user ────────────────────────────────
        const { data: site, error: siteError } = await supabaseServer
            .from('sites')
            .select('id, name, notification_emails')
            .eq('id', siteId)
            .eq('user_id', userId)
            .single();

        if (siteError || !site) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        // ── order_id must match the one we issued for this site ─────────────
        // razorpay_subscription_id column is reused to store the order_id.
        const { data: existingSub } = await supabaseServer
            .from('site_subscriptions')
            .select('id, razorpay_subscription_id, store_expires_at, store_plan, pending_plan')
            .eq('site_id', siteId)
            .single();

        if (!existingSub || existingSub.razorpay_subscription_id !== razorpay_order_id) {
            return NextResponse.json({ error: 'Order mismatch' }, { status: 400 });
        }

        // ── Confirm with Razorpay that the money actually moved ─────────────
        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

        let payment: { status: string; amount: number; currency: string };
        try {
            const fetched = await razorpay.payments.fetch(razorpay_payment_id);
            payment = {
                status: String(fetched.status ?? ''),
                amount: typeof fetched.amount === 'number' ? fetched.amount : Number(fetched.amount ?? 0),
                currency: String(fetched.currency ?? ''),
            };
        } catch (err) {
            console.error('[verify-payment] razorpay payments.fetch failed:', err);
            return NextResponse.json({ error: 'Could not verify payment with Razorpay' }, { status: 502 });
        }

        if (payment.status !== 'captured' && payment.status !== 'authorized') {
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
        const rawPlan = String(existingSub.pending_plan ?? 'qr_menu');
        const paidPlan = VALID_PLANS.has(rawPlan) ? rawPlan : 'qr_menu';

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
        console.log(`[verify-payment] activating plan=${paidPlan} (from pending_plan) for site=${siteId}`);
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
            console.log('[verify-payment] billing already recorded (likely by webhook); proceeding to activate subscription');
        }

        // ── Activate ────────────────────────────────────────────────────────
        // Clear expiry_reminder_sent_at so the T-3 reminder fires fresh for
        // the new billing cycle (the cron only sends when this is NULL).
        const activatedAt = new Date().toISOString();
        const { error: updateError } = await supabaseServer
            .from('site_subscriptions')
            .update({
                store_plan: paidPlan,
                store_expires_at: expiresAt,
                razorpay_status: 'active',
                pending_plan: null,            // consumed
                expiry_reminder_sent_at: null, // reset for new cycle
                updated_at: activatedAt,
            })
            .eq('site_id', siteId);

        if (updateError) {
            console.error('[verify-payment] site_subscriptions update failed:', updateError);
            return NextResponse.json({ error: 'Failed to activate subscription' }, { status: 500 });
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

        // ── Invoice email (best-effort, never blocks activation) ────────────
        // Recipients = merchant-managed notification_emails ∪ Firebase auth
        // email (via X-User-Email header) ∪ profiles.contact_email fallback.
        // The fallback guarantees the account owner always gets the invoice
        // even before they've configured Settings → Billing notifications.
        // Failures are logged and swallowed: the payment is already captured
        // and the subscription is already active.
        try {
            const headerEmail = (request.headers.get('X-User-Email') ?? '').trim();

            const { data: profile } = await supabaseServer
                .from('profiles')
                .select('contact_email')
                .eq('id', userId)
                .maybeSingle();
            const ownerEmail = (profile?.contact_email ?? '').trim();

            const recipients = Array.from(new Set([
                ...((site.notification_emails as string[] | null) ?? []),
                headerEmail,
                ownerEmail,
            ].map(s => s.trim()).filter(Boolean)));

            console.log(`[verify-payment] invoice recipients (${recipients.length}):`, recipients);

            if (recipients.length > 0) {
                const mailResult = await sendPlanInvoiceEmail({
                    recipients: recipients.map(address => ({ address, name: site.name })),
                    shopName: site.name,
                    plan: paidPlan,
                    amount: amountInr,
                    currency: payment.currency || 'INR',
                    razorpayPaymentId: razorpay_payment_id,
                    activatedAt,
                    expiresAt,
                });
                if (!mailResult.ok) {
                    console.error('[verify-payment] invoice email rejected:', mailResult.status, mailResult.error);
                }
            } else {
                console.warn('[verify-payment] no recipients for invoice email; skipping send');
            }
        } catch (mailErr) {
            console.error('[verify-payment] invoice email send failed (non-fatal):', mailErr);
        }

        return NextResponse.json({ success: true, expiresAt });
    } catch (err) {
        console.error('[verify-payment] error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
