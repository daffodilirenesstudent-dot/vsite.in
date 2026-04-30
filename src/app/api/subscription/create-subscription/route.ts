import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rateLimit';

// Razorpay round-trip + DB writes. Default 10s would occasionally lose first-time payments.
export const maxDuration = 30;
export const runtime = 'nodejs';

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
        const rl = rateLimit(`create-sub:${userId}`, { limit: 5, windowMs: 60 * 60_000 });
        if (!rl.allowed) {
            return NextResponse.json(
                { error: 'Too many attempts. Please try again later.' },
                { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
            );
        }

        // ── Parse body ──────────────────────────────────────────────────────
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

        // ── Verify site belongs to this user ────────────────────────────────
        const { data: site, error: siteError } = await supabaseServer
            .from('sites')
            .select('id, name, created_at')
            .eq('id', siteId)
            .eq('user_id', userId)
            .single();

        if (siteError || !site) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        // ── Block purchase during free trial ─────────────────────────────────
        const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;
        const trialEndsAt = new Date(site.created_at).getTime() + TRIAL_MS;
        if (Date.now() < trialEndsAt) {
            return NextResponse.json(
                { error: 'Your free trial is still active. You can subscribe once it ends.' },
                { status: 403 }
            );
        }

        // ── Check not already subscribed ────────────────────────────────────
        const { data: existingSub } = await supabaseServer
            .from('site_subscriptions')
            .select('store_expires_at, razorpay_subscription_id, razorpay_status')
            .eq('site_id', siteId)
            .maybeSingle();

        if (existingSub?.store_expires_at) {
            const expiry = new Date(existingSub.store_expires_at).getTime();
            if (expiry > Date.now()) {
                return NextResponse.json(
                    { error: 'This store already has an active subscription.' },
                    { status: 409 }
                );
            }
        }

        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || !process.env.RAZORPAY_PLAN_ID) {
            console.error('[create-subscription] missing Razorpay env vars');
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }

        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        // ── Cancel any stale Razorpay subscription on this site ─────────────
        // If the user dismissed a previous checkout, the prior Razorpay
        // subscription is still alive on Razorpay's side. Without cancelling,
        // it can later get charged and fire webhooks that no longer match any
        // DB row (because we'd overwrite razorpay_subscription_id below).
        const stalePending =
            existingSub?.razorpay_subscription_id &&
            ['created', 'authenticated', 'pending'].includes(existingSub.razorpay_status ?? '');

        if (stalePending && existingSub?.razorpay_subscription_id) {
            try {
                await razorpay.subscriptions.cancel(existingSub.razorpay_subscription_id, false);
            } catch (err) {
                // Non-fatal: it may already be cancelled/expired on Razorpay's side.
                console.warn('[create-subscription] stale subscription cancel skipped:', err);
            }
        }

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

        // ── Save subscription ID to DB ──────────────────────────────────────
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

        return NextResponse.json({
            subscriptionId: subscription.id,
            keyId: process.env.RAZORPAY_KEY_ID,
        });
    } catch (err) {
        console.error('[create-subscription] unexpected error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
