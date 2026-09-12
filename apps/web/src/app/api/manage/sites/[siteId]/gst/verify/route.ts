// POST /api/manage/sites/[siteId]/gst/verify
//
// Calls gstincheck.co.in server-side to verify a GSTIN. Does NOT save anything —
// the wizard's "Save" button hits /complete to persist (which re-verifies as
// defence in depth, so a forged verify response can't reach the database).
//
// Body: { gstin, ownerName, address, pincode, state }
//
// Cache: 24h per (site, gstin) in gst_verification_cache. The cache shields
// us against repeated wizard submissions on a paid third-party API.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { verifyGstin, isValidGstinFormat } from '@/lib/payments/gstincheck';
import { ORDERING_FROZEN } from '@/lib/platform/productFlags';
import { frozenResponse } from '@/lib/platform/frozenResponse';

// ─── FROZEN WITH THE ORDERING PRODUCT ────────────────────────────────────────
// GST exists to put a tax breakup on a BILL. vsite issues no bills: ordering is
// frozen, so nothing on the platform can produce a document this data would
// appear on. The Smart QR Menu shows prices and is untouched by this.
//
// It is frozen rather than deleted for the same reason the order routes are —
// `ORDERING_FROZEN` is one switch, and GST comes back with the product it
// belongs to. Reads (`GET .../gst`) stay open so the settings page can still
// render whatever an owner already stored.
//
// Security note: while reachable, this path had no rate limit, and its 24h cache
// is keyed on (site_id, gstin) — so varying the GSTIN, which is only checked
// against a format regex, made every request a cache miss and a paid
// gstincheck.co.in lookup (2026-09 assessment, Finding 4). If ordering is
// unfrozen, that must be fixed BEFORE this gate is removed: rate limit per user,
// validate the GSTIN checksum, and cache negative results.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const runtime    = 'nodejs';

const CACHE_TTL_HOURS = 24;

async function authenticate(request: NextRequest) {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    return verifyFirebaseToken(auth.replace('Bearer ', ''));
}

function normalizeState(s: string): string {
    return s.trim().toLowerCase().replace(/[^a-z]/g, '');
}

export async function POST(
    request: NextRequest,
    { params }: { params: { siteId: string } },
) {
    // QR ordering is frozen — see @/lib/platform/productFlags to unfreeze.
    if (ORDERING_FROZEN) return frozenResponse();
    const userId = await authenticate(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: { gstin?: string; ownerName?: string; address?: string; pincode?: string; state?: string };
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const gstin   = (body.gstin   ?? '').toUpperCase().trim();
    const state   = (body.state   ?? '').trim();
    const pincode = (body.pincode ?? '').trim();

    if (!isValidGstinFormat(gstin)) {
        return NextResponse.json({ error: 'Invalid GSTIN format', code: 'invalid_gstin' }, { status: 400 });
    }
    if (!/^[0-9]{6}$/.test(pincode)) {
        return NextResponse.json({ error: 'Invalid pincode', code: 'invalid_pincode' }, { status: 400 });
    }
    if (!state) {
        return NextResponse.json({ error: 'State is required', code: 'missing_state' }, { status: 400 });
    }

    // Ownership check.
    const { data: site } = await supabaseServer
        .from('sites')
        .select('id')
        .eq('id', params.siteId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!site) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Cache lookup first — keeps the paid API call out of the hot path on retries.
    const { data: cached } = await supabaseServer
        .from('gst_verification_cache')
        .select('status, legal_name, trade_name, address, state, raw, fetched_at')
        .eq('site_id', params.siteId)
        .eq('gstin', gstin)
        .gt('fetched_at', new Date(Date.now() - CACHE_TTL_HOURS * 3600 * 1000).toISOString())
        .maybeSingle();

    let result: Awaited<ReturnType<typeof verifyGstin>>;
    if (cached) {
        result = {
            status:    cached.status as 'verified' | 'inactive' | 'unavailable',
            legalName: cached.legal_name ?? undefined,
            tradeName: cached.trade_name ?? undefined,
            address:   cached.address    ?? undefined,
            state:     cached.state      ?? undefined,
            raw:       cached.raw,
        };
    } else {
        result = await verifyGstin(gstin);
        if (result.status !== 'unavailable') {
            await supabaseServer
                .from('gst_verification_cache')
                .upsert({
                    site_id:    params.siteId,
                    gstin,
                    status:     result.status,
                    legal_name: result.legalName ?? null,
                    trade_name: result.tradeName ?? null,
                    address:    result.address   ?? null,
                    state:      result.state     ?? null,
                    raw:        (result.raw as object | null) ?? null,
                    fetched_at: new Date().toISOString(),
                }, { onConflict: 'site_id,gstin' });
        }
    }

    if (result.status === 'unavailable') {
        return NextResponse.json({ status: 'unavailable', reason: result.reason ?? 'unknown' }, { status: 503 });
    }
    if (result.status === 'inactive') {
        return NextResponse.json({
            status:    'inactive',
            reason:    result.reason ?? result.activeSts ?? 'inactive',
            legalName: result.legalName ?? null,
        });
    }

    // status === 'verified'. Cross-check user-supplied state vs API state.
    if (result.state && normalizeState(state) !== normalizeState(result.state)) {
        return NextResponse.json({
            status: 'state_mismatch',
            apiState:  result.state,
            userState: state,
        }, { status: 400 });
    }

    return NextResponse.json({
        status:    'verified',
        gstin,
        legalName: result.legalName ?? null,
        tradeName: result.tradeName ?? null,
        address:   result.address   ?? null,
        state:     result.state     ?? state,
    });
}
