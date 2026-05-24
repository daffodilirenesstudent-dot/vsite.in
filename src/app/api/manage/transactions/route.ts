// GET /api/manage/transactions?site_id=...&range=<preset>[&start=&end=]
//
// Firebase auth required. Returns transactions for a site the caller owns,
// filtered to the requested date range (same preset vocabulary as /insights).
// Default range is `today` to match dashboard default.
//
// Cap: 500 rows max — the UI paginates by date range, not by row offset.
// If someone needs > 500 in one shot they should narrow the range.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rangeFromSearchParams } from '@/lib/dateRange';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const HARD_LIMIT = 500;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
  if (!userId) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const url = new URL(request.url);
  const siteId = url.searchParams.get('site_id');
  if (!siteId) {
    return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
  }

  // Verify ownership + grab timezone so the range resolves in the site's tz.
  const { data: site, error: siteError } = await supabaseServer
    .from('sites')
    .select('id, timezone')
    .eq('id', siteId)
    .eq('user_id', userId)
    .maybeSingle();

  if (siteError || !site) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const range = rangeFromSearchParams(url.searchParams, site.timezone ?? 'Asia/Kolkata');

  const { data, error } = await supabaseServer
    .from('transactions')
    // `customer_phone` and the nested `orders.items` are needed for the new
    // info popover (food items + ordered time). `orders.created_at` is the
    // canonical order placement time; `transacted_at` is when money settled,
    // which can be hours later for table-mode checkouts.
    .select('id, txn_id, order_id, transacted_at, customer_email, customer_phone, amount, status, payment_mode, orders(order_number, token_number, counter_number, table_number, items, created_at, customer_name, customer_email, customer_phone)')
    .eq('site_id', siteId)
    .gte('transacted_at', range.start.toISOString())
    .lt('transacted_at',  range.end.toISOString())
    .order('transacted_at', { ascending: false })
    .limit(HARD_LIMIT);

  if (error) {
    console.error('[GET /api/manage/transactions]', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }

  const transactions = data ?? [];
  const isLiveRange = range.end.getTime() > Date.now() - 60_000;
  const cacheHeader = isLiveRange
    ? 'private, max-age=15, stale-while-revalidate=30'
    : 'private, max-age=300, stale-while-revalidate=600';

  return NextResponse.json(
    {
      transactions,
      truncated: transactions.length >= HARD_LIMIT,
      range: {
        key:   range.key,
        label: range.label,
        start: range.start.toISOString(),
        end:   range.end.toISOString(),
      },
    },
    { headers: { 'Cache-Control': cacheHeader } },
  );
}
