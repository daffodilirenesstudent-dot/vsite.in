// /api/subscription/mock-activate
//
// Mock payment endpoint — activates a paid plan for ONE specific store.
// Each store has its own plan; buying here only affects the requested siteId.
//
// Security model:
//   - Firebase token required
//   - Rate-limited to 5 calls per hour per user
//   - Verifies siteId belongs to the authenticated user before writing
//   - All DB writes use supabaseServer (service role, bypasses RLS)
//   - Clients cannot write site_subscriptions directly (no RLS INSERT/UPDATE)

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rateLimit';

const SETUP_FEE    = 1999;
const MONTHLY_FEE  = 399;
const PLAN_KEY     = 'qr_menu';

// ── Production guard ────────────────────────────────────────────────────
// Mock activation must NEVER run in production. Two independent checks so a
// single misconfiguration cannot expose this endpoint:
//   1. NODE_ENV must not be "production"
//   2. ENABLE_MOCK_PAYMENTS must be explicitly "true"
// Both must hold; otherwise the route returns 404 (indistinguishable from
// "doesn't exist" to a probing attacker).
function mockActivationDisabled(): boolean {
    return (
        process.env.NODE_ENV === 'production' ||
        process.env.ENABLE_MOCK_PAYMENTS !== 'true'
    );
}

export async function POST(request: NextRequest) {
    if (mockActivationDisabled()) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
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
        const rl = rateLimit(`mock-activate:${userId}`, { limit: 5, windowMs: 60 * 60_000 });
        if (!rl.allowed) {
            return NextResponse.json(
                { error: 'Too many payment attempts. Please try again later.' },
                { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
            );
        }

        // ── Parse body ──────────────────────────────────────────────────────
        let body: { outcome?: string; siteId?: string };
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const { outcome, siteId } = body;

        if (!siteId || typeof siteId !== 'string') {
            return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
        }
        if (outcome !== 'success' && outcome !== 'failure') {
            return NextResponse.json(
                { error: 'outcome must be "success" or "failure"' },
                { status: 400 }
            );
        }

        // ── Simulate payment failure ─────────────────────────────────────────
        if (outcome === 'failure') {
            return NextResponse.json(
                { error: 'Payment failed — card declined. Please check your card details and try again.' },
                { status: 402 }
            );
        }

        // ── Verify site belongs to this user ─────────────────────────────────
        const { data: site, error: siteError } = await supabaseServer
            .from('sites')
            .select('id, name')
            .eq('id', siteId)
            .eq('user_id', userId)
            .single();

        if (siteError || !site) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        // ── Check not already subscribed for this store ──────────────────────
        const { data: existingSub } = await supabaseServer
            .from('site_subscriptions')
            .select('store_expires_at')
            .eq('site_id', siteId)
            .single();

        const now = Date.now();
        const existingExpiry = existingSub?.store_expires_at
            ? new Date(existingSub.store_expires_at).getTime()
            : 0;

        if (existingExpiry > now) {
            return NextResponse.json(
                { error: 'This store already has an active subscription.' },
                { status: 409 }
            );
        }

        // ── Activate subscription for this store ─────────────────────────────
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const { error: upsertError } = await supabaseServer
            .from('site_subscriptions')
            .upsert(
                {
                    site_id:          siteId,
                    user_id:          userId,
                    store_plan:       PLAN_KEY,
                    store_expires_at: expiresAt,
                    updated_at:       new Date().toISOString(),
                },
                { onConflict: 'site_id' }
            );

        if (upsertError) {
            console.error('[mock-activate] site_subscriptions upsert error:', upsertError);
            return NextResponse.json({ error: 'Failed to activate subscription' }, { status: 500 });
        }

        // ── Billing history ──────────────────────────────────────────────────
        const { error: billingError } = await supabaseServer.from('billing_history').insert([
            {
                user_id:   userId,
                plan_name: `Smart QR Menu — Setup Fee (${site.name})`,
                amount:    SETUP_FEE,
                currency:  'INR',
                status:    'Success',
            },
            {
                user_id:   userId,
                plan_name: `Smart QR Menu — Monthly (${site.name})`,
                amount:    MONTHLY_FEE,
                currency:  'INR',
                status:    'Success',
            },
        ]);

        if (billingError) {
            console.error('[mock-activate] billing_history insert failed:', billingError);
        }

        return NextResponse.json({
            success:   true,
            plan:      PLAN_KEY,
            expiresAt,
            siteName:  site.name,
            message:   `Plan activated for ${site.name}`,
        });
    } catch (err) {
        console.error('[mock-activate] unexpected error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
