import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rateLimit';

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
        .select('id, created_at')
        .eq('id', siteId)
        .eq('user_id', userId)
        .maybeSingle();

    if (siteError || !site) {
        return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // When turning ON, enforce that the store is either trial-active or paid-active.
    // Turning OFF is always allowed (defensive — owners must be able to disable).
    if (is_live) {
        const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
        const trialEndsMs = new Date(site.created_at).getTime() + TRIAL_DURATION_MS;
        const trialActive = trialEndsMs > Date.now();

        let paidActive = false;
        if (!trialActive) {
            const { data: sub } = await supabaseServer
                .from('site_subscriptions')
                .select('store_expires_at')
                .eq('site_id', siteId)
                .maybeSingle();
            paidActive = !!(sub?.store_expires_at && new Date(sub.store_expires_at).getTime() > Date.now());
        }

        if (!trialActive && !paidActive) {
            return NextResponse.json(
                { error: 'Free trial has ended. Activate a plan to bring your store back online.', code: 'TRIAL_EXPIRED' },
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

    return NextResponse.json({ success: true, is_live: data.is_live });
}
