// POST /api/track-menu-scan
//
// Public endpoint (no auth) — called fire-and-forget by the public shop page
// on first paint. Records one row in `menu_scans` so the qr_menu plan
// dashboard can show "scans today" + distinct visitor counts.
//
// Rate limited by IP to keep abuse cheap; the route is intentionally minimal
// so cold-start latency doesn't slow the customer's menu load.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { rateLimit, getClientIp } from '@/lib/platform/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scans a single store can record per minute.
 *
 * This is the bucket that actually matters. The per-IP limit below is the first
 * line, but menu analytics is a headline feature of the ₹299 plan and forged
 * rows are indistinguishable from real ones afterwards — so the store itself is
 * also capped, and a distributed source cannot inflate one target's numbers by
 * spreading across addresses. A busy restaurant at lunch is a few scans a
 * minute; 120 is far above any honest rush.
 */
const PER_SITE_LIMIT = 120;

export async function POST(request: NextRequest) {
    // getClientIp, NOT a local helper. This route used to read the LEFTMOST
    // X-Forwarded-For entry, which is client-written — so `X-Forwarded-For:
    // <random>` minted a fresh bucket per request and the limit below was
    // decorative (2026-09 assessment, Finding 8).
    const ip = getClientIp(request.headers);
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

    // Second bucket, keyed on the target rather than the source. Checked after
    // validation so a malformed body cannot consume a store's allowance.
    const siteRl = rateLimit(`menu-scan-site:${site_id}`, { limit: PER_SITE_LIMIT, windowMs: 60_000 });
    if (!siteRl.allowed) {
        return NextResponse.json({ ok: false }, { status: 429 });
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
