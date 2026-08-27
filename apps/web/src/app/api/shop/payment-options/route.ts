// GET /api/shop/payment-options?siteId=…
//
// Public endpoint used by the customer checkout screen to decide whether
// to offer "Pay Online". Returns true only if the site has an active
// Razorpay OAuth integration.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { ORDERING_FROZEN } from '@/lib/platform/productFlags';
import { frozenResponse } from '@/lib/platform/frozenResponse';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
    // QR ordering is frozen — see @/lib/productFlags to unfreeze.
    if (ORDERING_FROZEN) return frozenResponse();
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
