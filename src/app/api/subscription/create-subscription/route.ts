import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rateLimit';

// Target p95 < 2s: auth(~100ms) + parallel DB(~300ms) + Razorpay create(~900ms) + DB write(~300ms)
export const maxDuration = 15;
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    const t0 = Date.now();
    try {
        // ── Env guard — fail fast before any I/O ────────────────────────────
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || !process.env.RAZORPAY_PLAN_ID) {
            console.error('[create-subscription] missing Razorpay env vars');
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
        const rl = rateLimit(`create-sub:${userId}`, { limit: 5, windowMs: 60 * 60_000 });
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
        // Run site ownership check and existing subscription lookup together
        // instead of serially — saves ~300ms on every request.
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
        console.log(`[create-subscription] db queries ${Date.now() - t1}ms`);

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

        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID!,
            key_secret: process.env.RAZORPAY_KEY_SECRET!,
        });

        // ── Fire-and-forget stale subscription cancel ────────────────────────
        // The cancel targets the OLD subscription ID and is independent of
        // creating the new one — no reason to block on it. A failed cancel is
        // non-fatal: the new subscription ID we write below is the only one
        // the webhook will ever match, so the stale one becomes unreachable.
        const staleId = existingSub?.razorpay_subscription_id;
        if (staleId && ['created', 'authenticated', 'pending'].includes(existingSub?.razorpay_status ?? '')) {
            razorpay.subscriptions.cancel(staleId, false).catch((err) =>
                console.warn('[create-subscription] stale cancel skipped:', err)
            );
        }

        // ── Create Razorpay subscription ─────────────────────────────────────
        const t2 = Date.now();
        let subscription;
        try {
            subscription = await razorpay.subscriptions.create({
                plan_id: process.env.RAZORPAY_PLAN_ID!,
                total_count: 120,
                quantity: 1,
                addons: [
                    {
                        item: {
                            name: `Smart QR Menu - Setup Fee (${site.name})`,
                            amount: 500,
                            currency: 'INR',
                        },
                    },
                ],
            });
        } catch (razorpayErr: unknown) {
            const rErr = razorpayErr as { error?: { code?: string; description?: string }; statusCode?: number };
            console.error('[create-subscription] Razorpay error:', JSON.stringify(rErr));
            const description = rErr?.error?.description ?? 'Payment provider error';
            const status = rErr?.statusCode === 400 ? 400 : 502;
            return NextResponse.json({ error: description }, { status });
        }
        console.log(`[create-subscription] razorpay create ${Date.now() - t2}ms`);

        // ── Persist subscription ID before returning ─────────────────────────
        // Must complete before we respond: the webhook handler looks up this
        // row by razorpay_subscription_id, and payment can complete quickly.
        const t3 = Date.now();
        await supabaseServer
            .from('site_subscriptions')
            .upsert(
                {
                    site_id: siteId,
                    user_id: userId,
                    store_plan: 'qr_menu',
                    razorpay_subscription_id: subscription.id,
                    razorpay_status: 'created',
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'site_id' }
            );
        console.log(`[create-subscription] db write ${Date.now() - t3}ms`);

        console.log(`[create-subscription] total ${Date.now() - t0}ms`);
        return NextResponse.json({
            subscriptionId: subscription.id,
            keyId: process.env.RAZORPAY_KEY_ID,
        });
    } catch (err) {
        console.error('[create-subscription] unexpected error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
