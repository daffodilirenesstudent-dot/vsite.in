// GET /api/manage/bill-requests?site_id=<uuid>
// Firebase auth required. Returns pending bill requests for a site the caller owns.
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
  if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const siteId = new URL(request.url).searchParams.get('site_id');
  if (!siteId || !/^[0-9a-f-]{36}$/i.test(siteId)) {
    return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
  }

  // Verify site ownership
  const { data: site } = await supabaseServer
    .from('sites').select('id').eq('id', siteId).eq('user_id', userId).maybeSingle();
  if (!site) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabaseServer
    .from('bill_requests')
    .select('id, table_number, status, requested_at')
    .eq('site_id', siteId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });

  if (error) {
    console.error('[GET /api/manage/bill-requests]', error);
    return NextResponse.json({ error: 'Failed to fetch bill requests' }, { status: 500 });
  }

  return NextResponse.json({ billRequests: data ?? [] });
}
