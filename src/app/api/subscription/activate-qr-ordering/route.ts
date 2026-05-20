// /api/subscription/activate-qr-ordering
//
// Mock payment endpoint — activates the pay_eat (QR Ordering) plan for one store.
// ₹5 mock payment only. Real Razorpay integration comes later.
//
// Security model:
//   - Firebase token required
//   - Rate-limited to 5 calls per hour per user
//   - Verifies siteId belongs to the authenticated user before writing
//   - All DB writes use supabaseServer (service role, bypasses RLS)

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rateLimit';

const PLAN_KEY    = 'pay_eat';
const MOCK_AMOUNT = 5;

export async function POST(request: NextRequest) {
    try {
        // ── Auth ─────────────────────────────────────────────────────────────
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
        if (!userId) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // ── Rate limit ────────────────────────────────────────────────────────
        const rl = rateLimit(`activate-qr-ordering:${userId}`, { limit: 5, windowMs: 60 * 60_000 });
        if (!rl.allowed) {
            return NextResponse.json(
                { error: 'Too many attempts. Please try again later.' },
                { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
            );
        }

        // ── Parse body ────────────────────────────────────────────────────────
        let body: { siteId?: string };
        try { body = await request.json(); }
        catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

        const { siteId } = body;
        if (!siteId || typeof siteId !== 'string') {
            return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
        }

        // ── Verify site belongs to this user ──────────────────────────────────
        const { data: site, error: siteError } = await supabaseServer
            .from('sites')
            .select('id, name')
            .eq('id', siteId)
            .eq('user_id', userId)
            .single();

        if (siteError || !site) {
            return NextResponse.json({ error: 'Store not found' }, { status: 404 });
        }

        // ── Upsert subscription — always overwrite so upgrading from qr_menu works ──
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
            console.error('[activate-qr-ordering] upsert error:', upsertError);
            return NextResponse.json({ error: 'Failed to activate plan' }, { status: 500 });
        }

        // ── Billing history ───────────────────────────────────────────────────
        const { error: billingError } = await supabaseServer
            .from('billing_history')
            .insert([{
                user_id:   userId,
                plan_name: `QR Ordering — Mock Payment (${site.name})`,
                amount:    MOCK_AMOUNT,
                currency:  'INR',
                status:    'Success',
            }]);

        if (billingError) {
            console.error('[activate-qr-ordering] billing_history insert failed:', billingError);
        }

        return NextResponse.json({
            success:   true,
            plan:      PLAN_KEY,
            expiresAt,
            siteName:  site.name,
        });
    } catch (err) {
        console.error('[activate-qr-ordering] unexpected error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
