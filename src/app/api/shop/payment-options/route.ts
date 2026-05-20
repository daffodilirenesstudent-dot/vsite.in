// GET /api/shop/payment-options?siteId=…
//
// Public endpoint used by the customer checkout screen to decide whether
// to offer "Pay Online". Returns true only if the site has an active
// Razorpay OAuth integration.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get('siteId');
  if (!siteId || !/^[0-9a-f-]{36}$/i.test(siteId)) {
    return NextResponse.json({ error: 'Invalid siteId' }, { status: 400 });
  }

  const { data } = await supabaseServer
    .from('site_payment_integrations')
    .select('status')
    .eq('site_id', siteId)
    .eq('provider', 'razorpay')
    .eq('status', 'active')
    .maybeSingle();

  return NextResponse.json({ onlineEnabled: !!data });
}
