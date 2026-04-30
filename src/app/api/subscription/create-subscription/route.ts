import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rateLimit';

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
            .select('id, name')
            .eq('id', siteId)
            .eq('user_id', userId)
            .single();

        if (siteError || !site) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        // ── Check not already subscribed ────────────────────────────────────
        const { data: existingSub } = await supabaseServer
            .from('site_subscriptions')
            .select('store_expires_at')
            .eq('site_id', siteId)
            .single();

        if (existingSub?.store_expires_at) {
            const expiry = new Date(existingSub.store_expires_at).getTime();
            if (expiry > Date.now()) {
                return NextResponse.json(
                    { error: 'This store already has an active subscription.' },
                    { status: 409 }
                );
            }
        }

        // ── Create Razorpay subscription ────────────────────────────────────
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID!,
            key_secret: process.env.RAZORPAY_KEY_SECRET!,
        });

        const subscription = await razorpay.subscriptions.create({
            plan_id: process.env.RAZORPAY_PLAN_ID!,
            total_count: 120,
            quantity: 1,
            addons: [
                {
                    item: {
                        name: `Smart QR Menu — Setup Fee (${site.name})`,
                        amount: 199900,
                        currency: 'INR',
                    },
                },
            ],
        });

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
        console.error('[create-subscription] error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
