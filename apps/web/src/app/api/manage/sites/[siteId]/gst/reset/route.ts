// POST /api/manage/sites/[siteId]/gst/reset
//
// Edit flow: clears the GST profile back to 'pending' so the wizard restarts.
// Does NOT touch historical orders — their tax snapshot stays intact.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { audit } from '@/lib/platform/auditLog';
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
// This handler itself calls nothing paid — it only clears columns. It is frozen
// for coherence: it exists to restart a wizard whose other two steps are gated,
// so leaving it open would offer an owner a way to wipe stored GST state with no
// way to set it again. Its siblings `verify` and `complete` are the ones that
// reach the pay-per-lookup API (2026-09 assessment, Finding 4).
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function authenticate(request: NextRequest) {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    return verifyFirebaseToken(auth.replace('Bearer ', ''));
}

export async function POST(
    request: NextRequest,
    { params }: { params: { siteId: string } },
) {
    // QR ordering is frozen — see @/lib/platform/productFlags to unfreeze.
    if (ORDERING_FROZEN) return frozenResponse();
    const userId = await authenticate(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: prev } = await supabaseServer
        .from('sites')
        .select('gst_status, gstin')
        .eq('id', params.siteId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!prev) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error } = await supabaseServer
        .from('sites')
        .update({
            gst_status:              'pending',
            gstin:                   null,
            gst_legal_name:          null,
            gst_trade_name:          null,
            gst_owner_name:          null,
            gst_address:             null,
            gst_pincode:             null,
            gst_state:               null,
            gst_rate_pct:            null,
            gst_verified_at:         null,
            gst_api_response:        null,
            gst_verification_status: null,
        })
        .eq('id', params.siteId)
        .eq('user_id', userId);
    if (error) {
        console.error('[POST gst/reset] update failed:', error);
        return NextResponse.json({ error: 'Failed to reset' }, { status: 500 });
    }

    audit({
        userId, siteId: params.siteId, action: 'gst_reset',
        targetId: params.siteId,
        details: { before: prev.gst_status, beforeGstin: prev.gstin },
        request,
    });
    return NextResponse.json({ status: 'ok' });
}
