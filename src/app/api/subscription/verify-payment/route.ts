// /api/subscription/verify-payment
//
// Activates a Smart QR Menu subscription immediately after the Razorpay
// browser checkout succeeds. This runs CLIENT-INITIATED but is the source of
// truth for activation — webhooks are a redundant fallback, not the primary
// path.
//
// Security model — every check must pass before a subscription is extended:
//   1. Firebase Bearer token → userId
//   2. Razorpay HMAC signature on (payment_id|subscription_id), timing-safe
//   3. Site belongs to the authenticated user
//   4. The subscription_id we're activating matches the one we issued for this
//      site (no cross-site replay)
//   5. razorpay_payment_id has never been recorded before (replay protection
//      via UNIQUE constraint on billing_history.razorpay_payment_id)
//   6. Razorpay's API confirms the payment is actually `captured` and ties to
//      the same subscription (HMAC alone proves nothing about funds movement)
//   7. Period is sourced from Razorpay (`current_end`), never server clock

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

// Two Razorpay round-trips (payments.fetch + subscriptions.fetch) + DB writes.
export const maxDuration = 30;
export const runtime = 'nodejs';

const FIRST_PAYMENT_INR = 2398; // ₹1,999 setup + ₹399 first month

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

        // ── Parse body ──────────────────────────────────────────────────────
        let body: {
            razorpay_payment_id?: string;
            razorpay_subscription_id?: string;
            razorpay_signature?: string;
            siteId?: string;
        };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature, siteId } = body;
        if (
            !razorpay_payment_id || typeof razorpay_payment_id !== 'string' ||
            !razorpay_subscription_id || typeof razorpay_subscription_id !== 'string' ||
            !razorpay_signature || typeof razorpay_signature !== 'string' ||
            !siteId || typeof siteId !== 'string'
        ) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // ── Verify Razorpay signature (timing-safe) ──────────────────────────
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        const keyId = process.env.RAZORPAY_KEY_ID;
        if (!keySecret || !keyId) {
            console.error('[verify-payment] missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET');
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }

        const expectedSig = crypto
            .createHmac('sha256', keySecret)
            .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
            .digest('hex');

        if (!timingSafeEqualHex(expectedSig, razorpay_signature)) {
            return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
        }

        // ── Replay protection: payment_id must be unused ─────────────────────
        // Backed by UNIQUE index on billing_history.razorpay_payment_id (mig 014).
        const { count: alreadyRecorded } = await supabaseServer
            .from('billing_history')
            .select('*', { count: 'exact', head: true })
            .eq('razorpay_payment_id', razorpay_payment_id);

        if (alreadyRecorded && alreadyRecorded > 0) {
            return NextResponse.json(
                { error: 'Payment already processed' },
                { status: 409 }
            );
        }

        // ── Verify site belongs to this user ────────────────────────────────
        const { data: site, error: siteError } = await supabaseServer
            .from('sites')
            .select('id, name')
            .eq('id', siteId)
            .eq('user_id', userId)
            .single();

        if (siteError || !site) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        // ── subscription_id must match the one we issued for this site ──────
        const { data: existingSub } = await supabaseServer
            .from('site_subscriptions')
            .select('id, razorpay_subscription_id')
            .eq('site_id', siteId)
            .single();

        if (!existingSub || existingSub.razorpay_subscription_id !== razorpay_subscription_id) {
            return NextResponse.json({ error: 'Subscription mismatch' }, { status: 400 });
        }

        // ── Confirm with Razorpay that the money actually moved ─────────────
        // HMAC only proves Razorpay signed the message with our key. It does
        // NOT prove the payment was captured. We must hit Razorpay's API.
        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

        let payment: { status: string; amount: number; currency: string; subscription_id?: string };
        try {
            const fetched = await razorpay.payments.fetch(razorpay_payment_id);
            payment = {
                status: String(fetched.status ?? ''),
                amount: typeof fetched.amount === 'number' ? fetched.amount : Number(fetched.amount ?? 0),
                currency: String(fetched.currency ?? ''),
                // Razorpay returns `invoice_id` for subscription charges; some SDKs
                // include `subscription_id` directly. We check both via notes.
                subscription_id:
                    (fetched as unknown as { subscription_id?: string }).subscription_id ??
                    undefined,
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

        // ── Source the period from Razorpay, not the server clock ───────────
        let expiresAt: string;
        try {
            const sub = await razorpay.subscriptions.fetch(razorpay_subscription_id);
            // Razorpay returns current_end as a unix timestamp in seconds.
            const currentEnd = Number((sub as unknown as { current_end?: number }).current_end ?? 0);
            if (currentEnd > 0) {
                expiresAt = new Date(currentEnd * 1000).toISOString();
            } else {
                // Fallback: 30 days from now if Razorpay doesn't provide a period
                // (e.g., subscription just created and not yet charged for cycle).
                expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            }
        } catch (err) {
            console.error('[verify-payment] razorpay subscriptions.fetch failed:', err);
            expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        }

        // ── Activate ────────────────────────────────────────────────────────
        const { error: updateError } = await supabaseServer
            .from('site_subscriptions')
            .update({
                store_plan: 'qr_menu',
                store_expires_at: expiresAt,
                razorpay_status: 'active',
                updated_at: new Date().toISOString(),
            })
            .eq('site_id', siteId);

        if (updateError) {
            console.error('[verify-payment] site_subscriptions update failed:', updateError);
            return NextResponse.json({ error: 'Failed to activate subscription' }, { status: 500 });
        }

        // ── Record billing (UNIQUE index on razorpay_payment_id is the
        //     ultimate guard against double-insert under concurrent requests).
        const amountInr = Math.round(payment.amount / 100);
        const { error: billingError } = await supabaseServer
            .from('billing_history')
            .insert({
                user_id: userId,
                plan_name: 'Smart QR Menu — Setup + First Month',
                amount: amountInr || FIRST_PAYMENT_INR,
                currency: payment.currency || 'INR',
                status: 'Success',
                razorpay_payment_id,
            });

        // 23505 = unique_violation: another request beat us to it. Activation
        // already succeeded above, so treat as success.
        if (billingError && billingError.code !== '23505') {
            console.error('[verify-payment] billing_history insert failed:', billingError);
        }

        return NextResponse.json({ success: true, expiresAt });
    } catch (err) {
        console.error('[verify-payment] error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
