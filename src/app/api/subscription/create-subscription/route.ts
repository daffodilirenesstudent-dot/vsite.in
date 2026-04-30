import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rateLimit';

// Razorpay Orders API — manual payment each time (no autopay).
// User pays once per billing cycle; no card mandate or recurring authorization.
export const maxDuration = 15;
export const runtime = 'nodejs';

// Keep amounts in sync with the frontend (page.tsx constants).
const SETUP_FEE_INR = 5;
const MONTHLY_FEE_INR = 5;

export async function POST(request: NextRequest) {
    const t0 = Date.now();
    try {
        // ── Env guard ────────────────────────────────────────────────────────
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            console.error('[create-order] missing Razorpay env vars');
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }

        // ── Auth ─────────────────────────────────────────────────────────────
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
        if (!userId) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // ── Rate limit ───────────────────────────────────────────────────────
        const rl = rateLimit(`create-order:${userId}`, { limit: 5, windowMs: 60 * 60_000 });
        if (!rl.allowed) {
            return NextResponse.json(
                { error: 'Too many attempts. Please try again later.' },
                { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
            );
        }

        // ── Parse body ───────────────────────────────────────────────────────
        let body: { siteId?: string };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        const { siteId } = body;
        if (!siteId || typeof siteId !== 'string') {
            return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
        }

        // ── Parallel DB queries ──────────────────────────────────────────────
        const t1 = Date.now();
        const [siteResult, subResult] = await Promise.all([
            supabaseServer
                .from('sites')
                .select('id, name, created_at')
                .eq('id', siteId)
                .eq('user_id', userId)
                .single(),
            supabaseServer
                .from('site_subscriptions')
                .select('store_expires_at, razorpay_subscription_id, razorpay_status')
                .eq('site_id', siteId)
                .maybeSingle(),
        ]);
        console.log(`[create-order] db queries ${Date.now() - t1}ms`);

        const { data: site, error: siteError } = siteResult;
        if (siteError || !site) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        // ── Block purchase during free trial ─────────────────────────────────
        const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;
        if (Date.now() < new Date(site.created_at).getTime() + TRIAL_MS) {
            return NextResponse.json(
                { error: 'Your free trial is still active. You can subscribe once it ends.' },
                { status: 403 }
            );
        }

        // ── Block if already subscribed ──────────────────────────────────────
        const existingSub = subResult.data;
        if (existingSub?.store_expires_at && new Date(existingSub.store_expires_at).getTime() > Date.now()) {
            return NextResponse.json(
                { error: 'This store already has an active subscription.' },
                { status: 409 }
            );
        }

        // ── Determine first-time vs renewal ──────────────────────────────────
        // If store_expires_at was ever set (even if expired now), setup fee was
        // already collected on the first purchase — only charge monthly.
        const isRenewal = !!existingSub?.store_expires_at;
        const amountInr = isRenewal ? MONTHLY_FEE_INR : (SETUP_FEE_INR + MONTHLY_FEE_INR);
        const amountPaise = amountInr * 100;

        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID!,
            key_secret: process.env.RAZORPAY_KEY_SECRET!,
        });

        // ── Create Razorpay order ────────────────────────────────────────────
        const t2 = Date.now();
        let order;
        try {
            order = await razorpay.orders.create({
                amount: amountPaise,
                currency: 'INR',
                receipt: `rcpt_${siteId}_${Date.now()}`,
                notes: {
                    siteId,
                    userId,
                    plan: 'qr_menu',
                    type: isRenewal ? 'renewal' : 'first_time',
                },
            });
        } catch (razorpayErr: unknown) {
            const rErr = razorpayErr as { error?: { code?: string; description?: string }; statusCode?: number };
            console.error('[create-order] Razorpay error:', rErr);
            const description = rErr?.error?.description ?? 'Payment provider error';
            const status = rErr?.statusCode === 400 ? 400 : 502;
            return NextResponse.json({ error: description }, { status });
        }
        console.log(`[create-order] razorpay create ${Date.now() - t2}ms`);

        // ── Store order ID before returning ──────────────────────────────────
        // Reuses razorpay_subscription_id column to hold the order ID.
        // verify-payment will match against this to prevent cross-site replay.
        const t3 = Date.now();
        await supabaseServer
            .from('site_subscriptions')
            .upsert(
                {
                    site_id: siteId,
                    user_id: userId,
                    store_plan: 'qr_menu',
                    razorpay_subscription_id: order.id,
                    razorpay_status: 'created',
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'site_id' }
            );
        console.log(`[create-order] db write ${Date.now() - t3}ms`);

        console.log(`[create-order] total ${Date.now() - t0}ms`);
        return NextResponse.json({
            orderId: order.id,
            keyId: process.env.RAZORPAY_KEY_ID,
            amount: amountPaise,
            currency: 'INR',
            isRenewal,
        });
    } catch (err) {
        console.error('[create-order] unexpected error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
