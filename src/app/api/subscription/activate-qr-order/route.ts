// POST /api/subscription/activate-qr-order
// Mock activation — sets store_plan to 'qr_order' for 30 days. No real payment.
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const MOCK_AMOUNT = 5;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    let body: { siteId?: string };
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const { siteId } = body;
    if (!siteId || typeof siteId !== 'string') {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const { data: site, error: siteError } = await supabaseServer
      .from('sites')
      .select('id, name')
      .eq('id', siteId)
      .eq('user_id', userId)
      .single();
    if (siteError || !site) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: upsertError } = await supabaseServer
      .from('site_subscriptions')
      .upsert(
        {
          site_id: siteId,
          user_id: userId,
          store_plan: 'qr_order',
          store_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'site_id' },
      );
    if (upsertError) {
      console.error('[activate-qr-order] upsert error:', upsertError);
      return NextResponse.json({ error: 'Failed to activate plan' }, { status: 500 });
    }

    const { error: billingError } = await supabaseServer
      .from('billing_history')
      .insert([{
        user_id: userId,
        plan_name: `QR Ordering (No Payment) — Mock Payment (${site.name})`,
        amount: MOCK_AMOUNT,
        currency: 'INR',
        status: 'Success',
      }]);
    if (billingError) {
      console.error('[activate-qr-order] billing_history insert failed:', billingError);
    }

    return NextResponse.json({ success: true, plan: 'qr_order', expiresAt, siteName: site.name });
  } catch (err) {
    console.error('[activate-qr-order] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
