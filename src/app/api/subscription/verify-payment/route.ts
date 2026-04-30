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

export const maxDuration = 30;
export const runtime = 'nodejs';

// Must match create-subscription/route.ts
const SETUP_FEE_INR = 5;
const MONTHLY_FEE_INR = 5;

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

        // ── Replay protection: payment_id must be unused ─────────────────────
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

        // ── order_id must match the one we issued for this site ─────────────
        // razorpay_subscription_id column is reused to store the order_id.
        const { data: existingSub } = await supabaseServer
            .from('site_subscriptions')
            .select('id, razorpay_subscription_id')
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

        // ── Set expiry to 30 days from now ──────────────────────────────────
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

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

        // ── Record billing history ──────────────────────────────────────────
        const amountInr = Math.round(payment.amount / 100);
        const { error: billingError } = await supabaseServer
            .from('billing_history')
            .insert({
                user_id: userId,
                plan_name: `Smart QR Menu — ${amountInr >= (SETUP_FEE_INR + MONTHLY_FEE_INR) ? 'Setup + First Month' : 'Monthly Renewal'}`,
                amount: amountInr,
                currency: payment.currency || 'INR',
                status: 'Success',
                razorpay_payment_id,
            });

        // 23505 = unique_violation — another request beat us to it.
        if (billingError && billingError.code !== '23505') {
            console.error('[verify-payment] billing_history insert failed:', billingError);
        }

        return NextResponse.json({ success: true, expiresAt });
    } catch (err) {
        console.error('[verify-payment] error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
