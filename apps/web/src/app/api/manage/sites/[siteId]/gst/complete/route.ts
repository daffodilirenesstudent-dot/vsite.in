// POST /api/manage/sites/[siteId]/gst/complete
//
// Saves the wizard's outcome to sites.gst_*. Two shapes:
//
//   { kind: 'not_registered' }
//      → mark the store as GST-exempt; null out every GST field.
//
//   { kind: 'registered', gstin, ownerName, address, pincode, state, ratePct }
//      → server re-verifies against gstincheck.co.in (does not trust the prior
//        /verify call), then persists the full profile.
//
// Re-verification matters: the wizard's /verify call returned ok in the user's
// browser, but the network in between is not trustworthy. Repeating the call
// here is the only way to be sure a fraudulent GSTIN can't be saved.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { verifyGstin, isValidGstinFormat } from '@/lib/gstincheck';
import { audit } from '@/lib/auditLog';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const runtime    = 'nodejs';

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
    const userId = await authenticate(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: {
        kind?:      'not_registered' | 'registered';
        gstin?:     string;
        ownerName?: string;
        address?:   string;
        pincode?:   string;
        state?:     string;
        ratePct?:   number;
    };
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Ownership check.
    const { data: site } = await supabaseServer
        .from('sites')
        .select('id, gst_status, gstin')
        .eq('id', params.siteId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!site) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Path A: not registered ───────────────────────────────────────────────
    if (body.kind === 'not_registered') {
        const { error } = await supabaseServer
            .from('sites')
            .update({
                gst_status:              'not_registered',
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
            console.error('[POST gst/complete] update (not_registered) failed:', error);
            return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
        }
        audit({
            userId, siteId: params.siteId, action: 'gst_set_not_registered',
            targetId: params.siteId,
            details: { before: site.gst_status },
            request,
        });
        return NextResponse.json({ status: 'ok', gst_status: 'not_registered' });
    }

    // ── Path B: registered ───────────────────────────────────────────────────
    if (body.kind !== 'registered') {
        return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
    }

    const gstin     = (body.gstin     ?? '').toUpperCase().trim();
    const ownerName = (body.ownerName ?? '').trim().slice(0, 200);
    const address   = (body.address   ?? '').trim().slice(0, 500);
    const pincode   = (body.pincode   ?? '').trim();
    const state     = (body.state     ?? '').trim();
    const ratePct   = Number(body.ratePct);

    if (!isValidGstinFormat(gstin))     return NextResponse.json({ error: 'Invalid GSTIN', code: 'invalid_gstin' }, { status: 400 });
    if (!ownerName)                     return NextResponse.json({ error: 'Owner name required', code: 'missing_owner' }, { status: 400 });
    if (!address)                       return NextResponse.json({ error: 'Address required', code: 'missing_address' }, { status: 400 });
    if (!/^[0-9]{6}$/.test(pincode))    return NextResponse.json({ error: 'Invalid pincode', code: 'invalid_pincode' }, { status: 400 });
    if (!state)                         return NextResponse.json({ error: 'State required', code: 'missing_state' }, { status: 400 });
    if (ratePct !== 5 && ratePct !== 18) {
        return NextResponse.json({ error: 'Rate must be 5 or 18', code: 'invalid_rate' }, { status: 400 });
    }

    // Re-verify — even if /verify was just called.
    const result = await verifyGstin(gstin);
    if (result.status === 'unavailable') {
        return NextResponse.json({ error: 'GST verification service is unavailable. Please try again.', code: 'unavailable' }, { status: 503 });
    }
    if (result.status === 'inactive') {
        return NextResponse.json({ error: 'This GSTIN is not active and cannot collect GST.', code: 'inactive' }, { status: 400 });
    }
    if (result.state && normalizeState(state) !== normalizeState(result.state)) {
        return NextResponse.json({
            error:    `This GSTIN is registered in ${result.state}, not ${state}. Please correct the state.`,
            code:     'state_mismatch',
            apiState: result.state,
        }, { status: 400 });
    }

    const { error } = await supabaseServer
        .from('sites')
        .update({
            gst_status:              'registered',
            gstin,
            gst_legal_name:          result.legalName ?? null,
            gst_trade_name:          result.tradeName ?? null,
            gst_owner_name:          ownerName,
            gst_address:             address,
            gst_pincode:             pincode,
            gst_state:               result.state ?? state,
            gst_rate_pct:            ratePct,
            gst_verified_at:         new Date().toISOString(),
            gst_api_response:        (result.raw as object | null) ?? null,
            gst_verification_status: 'verified',
        })
        .eq('id', params.siteId)
        .eq('user_id', userId);
    if (error) {
        console.error('[POST gst/complete] update (registered) failed:', error);
        return NextResponse.json({ error: 'Failed to save GST profile' }, { status: 500 });
    }

    audit({
        userId, siteId: params.siteId, action: 'gst_set_registered',
        targetId: params.siteId,
        details: { gstin, ratePct, before: site.gst_status, beforeGstin: site.gstin },
        request,
    });
    return NextResponse.json({
        status:        'ok',
        gst_status:    'registered',
        gstin,
        gst_rate_pct:  ratePct,
        legalName:     result.legalName ?? null,
        tradeName:     result.tradeName ?? null,
    });
}
