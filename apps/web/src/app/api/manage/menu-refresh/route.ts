// POST /api/manage/menu-refresh
//
// Tells Next that a store's public menu changed, so the next diner gets the
// edit rather than the cached copy from before it.
//
// The shop page sets `revalidate = 10`. Its Supabase reads sit in Next's Data
// Cache for that window and the first request after it is served stale while
// the refresh runs — so the first diner after an owner edit saw the old menu
// (QA 2026-09-26). Owner edits are client-side Supabase writes, so the server
// never hears about them; the dashboard calls this route after each one.
//
// Body: { siteId }. Only the store's owner may refresh it. The route reads and
// writes no menu data — it only drops a cache entry.

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { rateLimit } from '@/lib/platform/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
    if (!userId) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // A sold-out rush is a burst of toggles; each one is a cheap cache drop.
    const rl = rateLimit(`menu-refresh:${userId}`, { limit: 120, windowMs: 60_000 });
    if (!rl.allowed) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    let body: { siteId?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const siteId = body.siteId;
    if (typeof siteId !== 'string' || !siteId) {
        return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Scoped by user_id: someone else's store reads as absent.
    const { data: site } = await supabaseServer
        .from('sites')
        .select('id, slug')
        .eq('id', siteId)
        .eq('user_id', userId)
        .maybeSingle();

    if (!site?.slug) {
        return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    revalidatePath(`/shop/${site.slug}`);
    return NextResponse.json({ success: true });
}
