// PATCH /api/manage/sites/[siteId]/whatsapp-orders
// Toggles WhatsApp order taking and stores the destination WhatsApp number.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { audit } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

async function authenticate(request: NextRequest) {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return null;
    return verifyFirebaseToken(auth.replace('Bearer ', ''));
}

function normalizeWhatsappNumber(raw: string): string | null {
    const digits = raw.trim().replace(/[\s()-]/g, '');
    // Allow optional leading +. After stripping spaces, the rest must be 7-15 digits.
    const m = digits.match(/^\+?(\d{7,15})$/);
    if (!m) return null;
    return `+${m[1]}`;
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: { siteId: string } },
) {
    const userId = await authenticate(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: { enabled?: boolean; whatsapp_number?: string };
    try { body = await request.json(); } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const enabled = body.enabled === true;
    let number: string | null = null;
    if (enabled) {
        if (!body.whatsapp_number) {
            return NextResponse.json({ error: 'WhatsApp number is required when enabling' }, { status: 400 });
        }
        number = normalizeWhatsappNumber(body.whatsapp_number);
        if (!number) {
            return NextResponse.json({ error: 'Enter a valid WhatsApp number (7-15 digits, optional +country code)' }, { status: 400 });
        }
    } else if (body.whatsapp_number !== undefined && body.whatsapp_number) {
        // Allow saving the number even while disabled (so toggling back on doesn't lose it).
        number = normalizeWhatsappNumber(body.whatsapp_number);
        if (!number) {
            return NextResponse.json({ error: 'Enter a valid WhatsApp number' }, { status: 400 });
        }
    }

    const { data: prev } = await supabaseServer
        .from('sites')
        .select('whatsapp_order_taking, whatsapp_order_number')
        .eq('id', params.siteId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!prev) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error } = await supabaseServer
        .from('sites')
        .update({ whatsapp_order_taking: enabled, whatsapp_order_number: number ?? prev.whatsapp_order_number ?? null })
        .eq('id', params.siteId)
        .eq('user_id', userId);
    if (error) {
        console.error('[PATCH whatsapp-orders]', error);
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    audit({
        userId, siteId: params.siteId, action: 'whatsapp_order_taking_change',
        targetId: params.siteId,
        details: { before: prev, after: { enabled, number } },
        request,
    });

    return NextResponse.json({ success: true, whatsapp_order_taking: enabled, whatsapp_order_number: number ?? prev.whatsapp_order_number });
}
