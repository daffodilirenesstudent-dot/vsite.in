// GET /api/manage/orders?site_id=<uuid>[&before=<iso_ts>][&since=<iso_ts>]
// Firebase auth required. Returns orders for a site the caller owns.
//
// Three query modes:
//   ?since=<ts>  — delta mode: orders updated after <ts> + pending bill_requests.
//   ?before=<ts> — page mode: 100 completed orders before cursor (pagination).
//   (no param)   — initial load: all active + 100 most-recent completed + bill_requests.
//
// qr_order sites (table_count > 0) run two parallel queries on initial load:
//   1. All non-completed orders today  — no PAGE_SIZE cap (active table orders
//      must never be paged out by volume of completed ones).
//   2. Most recent PAGE_SIZE completed orders — for the history list.
//
// Day boundary is computed in the site's local timezone (sites.timezone).

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';

const PAGE_SIZE = 100;

const SELECT_COLS =
  'id, site_id, order_number, customer_name, table_number, items, subtotal, tax_amount, cgst_amount, sgst_amount, gst_rate_pct, gstin_snapshot, total_amount, payment_method, payment_status, status, counter_number, token_number, created_at, updated_at';

export async function GET(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
  if (!userId) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const url    = new URL(request.url);
  const siteId = url.searchParams.get('site_id');
  const since  = url.searchParams.get('since');
  const before = url.searchParams.get('before');

  if (!siteId || !/^[0-9a-f-]{36}$/i.test(siteId)) {
    return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
  }

  // ── Verify ownership ────────────────────────────────────────────────────────
  const { data: site, error: siteErr } = await supabaseServer
    .from('sites')
    .select('id, timezone, table_count, kot_mode, kot_station_device_id, kot_printer_name, bill_printer_name')
    .eq('id', siteId)
    .eq('user_id', userId)
    .maybeSingle();

  if (siteErr || !site) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const tz                 = site.timezone ?? 'Asia/Kolkata';
  const todayStart         = getTodayStartInTz(tz);
  const tableCount         = (site as Record<string, unknown>).table_count as number | null ?? 0;
  const kotMode            = (site as Record<string, unknown>).kot_mode as string ?? 'manual';
  const kotStationDeviceId = (site as Record<string, unknown>).kot_station_device_id as string | null ?? null;
  const kotPrinterName     = (site as Record<string, unknown>).kot_printer_name  as string | null ?? null;
  const billPrinterName    = (site as Record<string, unknown>).bill_printer_name as string | null ?? null;
  const isQrOrder          = tableCount > 0;

  // ── Delta mode ──────────────────────────────────────────────────────────────
  if (since) {
    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return NextResponse.json({ error: 'Invalid since timestamp' }, { status: 400 });
    }
    const sinceIso = sinceDate.toISOString();

    // Run orders + bill_requests in parallel — one round-trip.
    const [ordersResult, billResult] = await Promise.all([
      supabaseServer
        .from('orders')
        .select(SELECT_COLS)
        .eq('site_id', siteId)
        .gte('updated_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE),
      isQrOrder
        ? supabaseServer
            .from('bill_requests')
            .select('id, table_number, status, requested_at')
            .eq('site_id', siteId)
            .eq('status', 'pending')
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (ordersResult.error) {
      console.error('[GET /api/manage/orders] delta orders:', ordersResult.error);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    return NextResponse.json(
      {
        orders:       ordersResult.data ?? [],
        hasMore:      false,
        oldestTs:     null,
        todayStart:   todayStart.toISOString(),
        kotMode,
        kotStationDeviceId,
        kotPrinterName,
        billPrinterName,
        ...(isQrOrder ? { billRequests: billResult.data ?? [] } : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // ── Pagination mode ─────────────────────────────────────────────────────────
  if (before) {
    const beforeDate = new Date(before);
    if (isNaN(beforeDate.getTime())) {
      return NextResponse.json({ error: 'Invalid before timestamp' }, { status: 400 });
    }
    const { data, error } = await supabaseServer
      .from('orders')
      .select(SELECT_COLS)
      .eq('site_id', siteId)
      .lt('created_at', beforeDate.toISOString())
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.error('[GET /api/manage/orders] pagination:', error);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const orders   = data ?? [];
    const hasMore  = orders.length === PAGE_SIZE;
    const oldestTs = orders.length > 0 ? orders[orders.length - 1].created_at : null;

    return NextResponse.json(
      { orders, hasMore, oldestTs, todayStart: todayStart.toISOString(), kotMode, kotStationDeviceId, kotPrinterName, billPrinterName },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // ── Initial load ─────────────────────────────────────────────────────────────
  if (isQrOrder) {
    // qr_order: two parallel queries.
    // Active orders: yesterday's todayStart — a 36-hour rolling window.
    // This lets orders placed just before midnight remain visible after midnight
    // without surfacing weeks of abandoned test orders.
    // Completed orders are capped to today's history list.
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const [activeResult, completedResult, billResult] = await Promise.all([
      supabaseServer
        .from('orders')
        .select(SELECT_COLS)
        .eq('site_id', siteId)
        .neq('status', 'completed')
        .gte('created_at', yesterdayStart.toISOString())
        .order('created_at', { ascending: false }),
      supabaseServer
        .from('orders')
        .select(SELECT_COLS)
        .eq('site_id', siteId)
        .eq('status', 'completed')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE),
      supabaseServer
        .from('bill_requests')
        .select('id, table_number, status, requested_at')
        .eq('site_id', siteId)
        .eq('status', 'pending'),
    ]);

    if (activeResult.error) {
      console.error('[GET /api/manage/orders] active orders:', activeResult.error);
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }

    const active    = activeResult.data ?? [];
    const completed = completedResult.data ?? [];
    // Merge: active first (they appear at top of grid), then completed history.
    // Dedup by id in case an order transitions during the two-query window.
    const seen = new Set(active.map(o => o.id));
    const merged = [...active, ...completed.filter(o => !seen.has(o.id))];
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const hasMore  = completed.length === PAGE_SIZE;
    const oldestTs = merged.length > 0 ? merged[merged.length - 1].created_at : null;

    return NextResponse.json(
      {
        orders:       merged,
        hasMore,
        oldestTs,
        todayStart:   todayStart.toISOString(),
        tableCount,
        kotMode,
        kotStationDeviceId,
        kotPrinterName,
        billPrinterName,
        billRequests: billResult.data ?? [],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // pay_eat / standard initial load — two parallel queries.
  // Active (non-completed): 36-hour rolling window (yesterday → now).
  // Completed: today only (history list).
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const [activeRes, completedRes] = await Promise.all([
    supabaseServer
      .from('orders')
      .select(SELECT_COLS)
      .eq('site_id', siteId)
      .neq('status', 'completed')
      .gte('created_at', yesterdayStart.toISOString())
      .order('created_at', { ascending: false }),
    supabaseServer
      .from('orders')
      .select(SELECT_COLS)
      .eq('site_id', siteId)
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE),
  ]);

  const error = activeRes.error ?? completedRes.error;
  if (error) {
    console.error('[GET /api/manage/orders]', error);
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }

  const activeRows    = activeRes.data ?? [];
  const completedRows = completedRes.data ?? [];
  const seenIds       = new Set(activeRows.map((o) => o.id));
  const data          = [
    ...activeRows,
    ...completedRows.filter((o) => !seenIds.has(o.id)),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const orders   = data;
  const hasMore  = completedRows.length === PAGE_SIZE;
  const oldestTs = completedRows.length > 0 ? completedRows[completedRows.length - 1].created_at : null;

  return NextResponse.json(
    { orders, hasMore, oldestTs, todayStart: todayStart.toISOString(), tableCount: 0, kotMode, kotStationDeviceId, kotPrinterName, billPrinterName },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

// Returns the start of today (midnight) in the given IANA timezone as a UTC Date.
// Uses Intl.DateTimeFormat to get the local date string, then constructs a UTC
// instant from the offset reported by the same formatter — avoids the
// toLocaleString() parse-without-tz bug that broke DST transitions.
function getTodayStartInTz(tz: string): Date {
  try {
    const now  = new Date();

    // en-CA formats as YYYY-MM-DD — no locale ambiguity.
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);

    const y = dateParts.find(p => p.type === 'year')!.value;
    const m = dateParts.find(p => p.type === 'month')!.value;
    const d = dateParts.find(p => p.type === 'day')!.value;

    // Build a formatter that tells us the UTC offset AT midnight local time.
    // We do this by formatting the midnight-UTC instant and comparing it to
    // the same instant expressed in the target timezone.
    const midnightUtc = new Date(`${y}-${m}-${d}T00:00:00Z`);

    // Get the actual local hour at the UTC midnight instant in the target TZ.
    const localHour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', hour12: false,
      }).format(midnightUtc),
      10,
    );

    // localHour tells us how many hours ahead/behind UTC midnight is from local midnight.
    // local midnight = UTC midnight - localHour hours
    const localMidnight = new Date(midnightUtc.getTime() - localHour * 3_600_000);
    return localMidnight;
  } catch {
    // Fallback: UTC midnight — safe for India (IST never observes DST)
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}
