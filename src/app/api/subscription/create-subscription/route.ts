import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rateLimit';

// Razorpay Orders API — manual payment each time (no autopay).
// User pays once per billing cycle; no card mandate or recurring authorization.
export const maxDuration = 15;
export const runtime = 'nodejs';

// Keep in sync with /manage/subscription/page.tsx and PlanContext.tsx.
// Per-plan monthly pricing in INR; no setup fee. 30-day cycle.
const PLAN_PRICES_INR: Record<string, number> = {
    qr_menu:  5,   // Smart QR Menu (TEST — live key)
    qr_order: 5,   // QR Ordering (TEST — live key)
    pay_eat:  5,   // Pay & Eat (TEST — live key)
};
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const VALID_PLANS = new Set(Object.keys(PLAN_PRICES_INR));

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
        let body: { siteId?: string; plan?: string };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        const { siteId, plan } = body;
        if (!siteId || typeof siteId !== 'string') {
            return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
        }
        // Default to qr_menu if the client doesn't pass a plan (back-compat).
        const chosenPlan = plan && VALID_PLANS.has(plan) ? plan : 'qr_menu';

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

        // ── Free trial guard ─────────────────────────────────────────────────
        // We *allow* purchase during the trial — restaurants who want to lock
        // in a plan early shouldn't be blocked. The 30-day paid window starts
        // from payment confirmation, on top of any remaining trial.
        // (Previously blocked while trial was active.)
        void TRIAL_DURATION_MS; // referenced for the new 7-day window; logic lives in PlanContext
        void site.created_at;

        // Allow purchase even when a subscription is already active — the user
        // may be renewing early or upgrading to a different plan. verify-payment
        // adds 30 days starting from MAX(now, current store_expires_at) so the
        // remaining time isn't lost.
        const existingSub = subResult.data;

        // ── Per-plan pricing in paise (1 INR = 100 paise), no setup fee ───────
        const isRenewal = !!existingSub?.store_expires_at;
        const amountPaise = (PLAN_PRICES_INR[chosenPlan] ?? PLAN_PRICES_INR.qr_menu) * 100;

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
                receipt: `rcpt_${siteId.slice(-8)}_${Date.now()}`,
                notes: {
                    siteId,
                    userId,
                    plan: chosenPlan,
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
                    // pending_plan records what the user picked at order time.
                    // verify-payment reads this back after capture so we never
                    // depend on Razorpay's notes round-trip. store_plan keeps
                    // whatever was previously active until verify-payment
                    // promotes pending_plan into store_plan.
                    pending_plan: chosenPlan,
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
            plan: chosenPlan,
            isRenewal,
        });
    } catch (err) {
        console.error('[create-order] unexpected error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
