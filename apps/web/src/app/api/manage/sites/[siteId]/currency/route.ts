// PATCH /api/manage/sites/[siteId]/currency
// Switches the display currency between INR and AED.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { audit } from '@/lib/auditLog';
import { isCurrencyCode } from '@/lib/currency';

export const dynamic = 'force-dynamic';

async function authenticate(request: NextRequest) {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    return verifyFirebaseToken(auth.replace('Bearer ', ''));
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { siteId: string } },
) {
    const userId = await authenticate(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: { currency_code?: string };
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (!isCurrencyCode(body.currency_code)) {
        return NextResponse.json({ error: 'currency_code must be INR or AED' }, { status: 400 });
    }

    const { data: prev } = await supabaseServer
        .from('sites').select('currency_code').eq('id', params.siteId).eq('user_id', userId).maybeSingle();
    if (!prev) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error } = await supabaseServer
        .from('sites')
        .update({ currency_code: body.currency_code })
        .eq('id', params.siteId)
        .eq('user_id', userId);
    if (error) {
        console.error('[PATCH currency]', error);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    audit({
        userId, siteId: params.siteId, action: 'currency_change',
        targetId: params.siteId,
        details: { before: prev.currency_code, after: body.currency_code },
        request,
    });

    return NextResponse.json({ success: true, currency_code: body.currency_code });
}
