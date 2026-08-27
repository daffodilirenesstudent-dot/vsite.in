// POST /api/track-menu-scan
//
// Public endpoint (no auth) — called fire-and-forget by the public shop page
// on first paint. Records one row in `menu_scans` so the qr_menu plan
// dashboard can show "scans today" + distinct visitor counts.
//
// Rate limited by IP to keep abuse cheap; the route is intentionally minimal
// so cold-start latency doesn't slow the customer's menu load.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ipFromRequest(req: NextRequest): string {
    return (
        req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        req.headers.get('x-real-ip') ||
        'unknown'
    );
}

export async function POST(request: NextRequest) {
    const ip = ipFromRequest(request);
    const rl = rateLimit(`menu-scan:${ip}`, { limit: 30, windowMs: 60_000 });
    if (!rl.allowed) {
        return NextResponse.json({ ok: false }, { status: 429 });
    }

    let body: { site_id?: string; visitor_id?: string; table_number?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false }, { status: 400 });
    }

    const { site_id, visitor_id, table_number } = body;
    if (!site_id || !/^[0-9a-f-]{36}$/i.test(site_id)) {
        return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (!visitor_id || typeof visitor_id !== 'string' || visitor_id.length > 64) {
        return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Fire-and-forget insert. We don't need to wait for the result on the
    // client; the response below confirms only that the request was accepted.
    await supabaseServer.from('menu_scans').insert({
        site_id,
        visitor_id,
        table_number: table_number?.toString().slice(0, 16) ?? null,
    });

    return NextResponse.json({ ok: true });
}
