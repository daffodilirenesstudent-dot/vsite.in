// POST /api/manage/sites/[siteId]/gst/reset
//
// Edit flow: clears the GST profile back to 'pending' so the wizard restarts.
// Does NOT touch historical orders — their tax snapshot stays intact.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { audit } from '@/lib/auditLog';

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
