import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { rateLimit } from '@/lib/platform/rateLimit';
import { trialEndsMs as trialEndOf } from '@/lib/store/trialRules';

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
    if (!userId) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const rl = rateLimit(`toggle-live:${userId}`, { limit: 60, windowMs: 60_000 });
    if (!rl.allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    let body: { siteId?: string; is_live?: boolean };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { siteId, is_live } = body;
    if (!siteId || typeof siteId !== 'string') {
        return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }
    if (typeof is_live !== 'boolean') {
        return NextResponse.json({ error: 'is_live must be a boolean' }, { status: 400 });
    }

    // ── Ownership + lifecycle check ──────────────────────────────────────
    // Owner must own the site, and the store must be either on an active
    // trial or covered by a paid subscription. Without this gate a user
    // whose trial expired could re-enable the live menu by hitting the
    // endpoint directly (the dashboard UI gate is not enough).
    const { data: site, error: siteError } = await supabaseServer
        .from('sites')
        .select('id, slug')
        .eq('id', siteId)
        .eq('user_id', userId)
        .maybeSingle();

    if (siteError || !site) {
        return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // When turning ON, enforce that the store is either trial-active or paid-active.
    // Turning OFF is always allowed (defensive — owners must be able to disable).
    if (is_live) {
        // The trial is the store's own trial_ends_at (migration 058), not
        // created_at + 7 days — owners can rewrite created_at from the browser.
        const { data: sub } = await supabaseServer
            .from('site_subscriptions')
            .select('store_expires_at, trial_ends_at')
            .eq('site_id', siteId)
            .maybeSingle();
        const now = Date.now();
        const trialActive = trialEndOf(sub) > now;
        const paidActive = !!(sub?.store_expires_at && new Date(sub.store_expires_at).getTime() > now);

        if (!trialActive && !paidActive) {
            const hadTrial = trialEndOf(sub) > 0;
            return NextResponse.json(
                {
                    error: hadTrial
                        ? 'Free trial has ended. Activate a plan to bring your store back online.'
                        : 'This store is not live yet. Pay for its plan to put it online.',
                    code: 'TRIAL_EXPIRED',
                },
                { status: 403 }
            );
        }
    }

    const { data, error } = await supabaseServer
        .from('sites')
        .update({ is_live })
        .eq('id', siteId)
        .eq('user_id', userId)
        .select('id, is_live')
        .single();

    if (error || !data) {
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    // Closing must take effect for the very next scan, not after the cache window.
    if (site.slug) revalidatePath(`/shop/${site.slug}`);

    return NextResponse.json({ success: true, is_live: data.is_live });
}
