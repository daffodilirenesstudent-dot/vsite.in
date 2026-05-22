// GET /api/manage/sites/[siteId]/gst
// Returns the current GST profile for the settings UI.
// `gst_api_response` is intentionally omitted — that column is an audit trail,
// not display data.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

async function authenticate(request: NextRequest) {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    return verifyFirebaseToken(auth.replace('Bearer ', ''));
}

export async function GET(
    request: NextRequest,
    { params }: { params: { siteId: string } },
) {
    const userId = await authenticate(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabaseServer
        .from('sites')
        .select(`
            id,
            gst_status,
            gstin,
            gst_legal_name,
            gst_trade_name,
            gst_owner_name,
            gst_address,
            gst_pincode,
            gst_state,
            gst_rate_pct,
            gst_verified_at,
            gst_verification_status
        `)
        .eq('id', params.siteId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error('[GET gst] supabase error:', error);
        return NextResponse.json({ error: 'Failed to load GST settings' }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(data);
}
