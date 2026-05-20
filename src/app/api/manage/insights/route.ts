// GET /api/manage/insights?site_id=<uuid>&range=<preset>[&start=<iso>&end=<iso>]
//
// Single source of truth for dashboard cards. Pulls from `transactions` (status='Success')
// so revenue = money actually collected, not money customers merely promised.
//
// Query params:
//   site_id  — required UUID, must be owned by caller
//   range    — preset key: today | yesterday | last7d | last4w | month_to_date | last_month | custom
//   start/end — ISO timestamps (required only when range=custom)
//
// Response shape:
//   {
//     range: { key, label, start, end, timezone, bucket },
//     revenue, revenue_prior, revenue_change_pct,
//     pending, orders, orders_prior, orders_change_pct,
//     completed, active, avg_order_value,
//     by_payment_mode: { Cash: N, UPI: N, Card: N }
//   }
//
// Caching: short TTL (30s) when the range includes today; longer (5min) when
// the range is entirely historical. Saves Supabase egress on static data.

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rangeFromSearchParams, type ResolvedRange } from '@/lib/dateRange';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Aggregate one period (current OR prior) from raw rows. Pure function, no DB.
 */
function aggregate(
    txns: { amount: number; status: string; payment_mode: string | null }[],
    ords: { status: string; table_number: string | null }[],
) {
    let revenue = 0;
    let pending = 0;
    const byMode: Record<string, number> = {};
    for (const t of txns) {
        const amt = Number(t.amount) || 0;
        if (t.status === 'Success') {
            revenue += amt;
            const mode = t.payment_mode || 'Other';
            byMode[mode] = (byMode[mode] ?? 0) + amt;
        } else if (t.status === 'Pending') {
            pending += amt;
        }
        // Failed / Refunded deliberately excluded — neither today's revenue nor money owed.
    }
    const orders    = ords.length;
    const completed = ords.filter(o => o.status === 'completed').length;
    const active    = orders - completed;
    // Order-type split: dine-in = has a table_number; takeaway = no table_number.
    // This is the same rule the QR ordering flow uses (table mode sets table_number,
    // common-mode / takeaway leaves it NULL).
    const dineIn   = ords.filter(o => o.table_number != null && o.table_number !== '').length;
    const takeaway = orders - dineIn;
    return {
        revenue:   round2(revenue),
        pending:   round2(pending),
        orders, completed, active,
        dine_in_count:  dineIn,
        takeaway_count: takeaway,
        avg_order_value: completed > 0 ? round2(revenue / completed) : 0,
        by_payment_mode: Object.fromEntries(Object.entries(byMode).map(([k, v]) => [k, round2(v)])),
    };
}

/**
 * % change between current and prior. Returns null when prior is 0 (can't divide).
 * UI should render "—" when null.
 */
function pctChange(curr: number, prior: number): number | null {
    if (prior === 0) return null;
    return Math.round(((curr - prior) / prior) * 10_000) / 100; // 2dp percent
}

export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
    if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const url    = new URL(request.url);
    const siteId = url.searchParams.get('site_id');
    if (!siteId || !/^[0-9a-f-]{36}$/i.test(siteId)) {
        return NextResponse.json({ error: 'site_id is required' }, { status: 400 });
    }

    // Verify ownership + fetch timezone in one query.
    const { data: site } = await supabaseServer
        .from('sites')
        .select('id, timezone')
        .eq('id', siteId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!site) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const tz: string = site.timezone ?? 'Asia/Kolkata';
    const range: ResolvedRange = rangeFromSearchParams(url.searchParams, tz);

    const startIso       = range.start.toISOString();
    const endIso         = range.end.toISOString();
    const priorStartIso  = range.priorStart.toISOString();
    const priorEndIso    = range.priorEnd.toISOString();

    // Four parallel queries: txns+orders for current period, txns+orders for prior period.
    // Each filtered by site and a single tz-resolved [start, end) window — uses the
    // (site_id, transacted_at DESC) and (site_id, created_at DESC) indexes.
    const [txnCurr, ordCurr, txnPrev, ordPrev] = await Promise.all([
        supabaseServer
            .from('transactions')
            .select('amount, status, payment_mode')
            .eq('site_id', siteId)
            .gte('transacted_at', startIso)
            .lt('transacted_at', endIso),
        supabaseServer
            .from('orders')
            .select('status, table_number')
            .eq('site_id', siteId)
            .gte('created_at', startIso)
            .lt('created_at', endIso),
        supabaseServer
            .from('transactions')
            .select('amount, status, payment_mode')
            .eq('site_id', siteId)
            .gte('transacted_at', priorStartIso)
            .lt('transacted_at', priorEndIso),
        supabaseServer
            .from('orders')
            .select('status, table_number')
            .eq('site_id', siteId)
            .gte('created_at', priorStartIso)
            .lt('created_at', priorEndIso),
    ]);

    if (txnCurr.error || ordCurr.error || txnPrev.error || ordPrev.error) {
        console.error('[GET /api/manage/insights]',
            txnCurr.error ?? ordCurr.error ?? txnPrev.error ?? ordPrev.error);
        return NextResponse.json({ error: 'Failed to fetch insights' }, { status: 500 });
    }

    // ── Revenue time-series for the bar chart ─────────────────────────────────
    // Bucketed server-side via the insights_revenue_series RPC so we ship
    // ~7–31 rows instead of streaming raw transactions. Empty buckets are
    // gap-filled (revenue: 0) so the chart renders an unbroken row.
    const seriesRes = await supabaseServer.rpc('insights_revenue_series', {
        p_site_id: siteId,
        p_start:   startIso,
        p_end:     endIso,
        p_bucket:  range.bucket,
    });
    if (seriesRes.error) {
        console.error('[GET /api/manage/insights] series:', seriesRes.error);
    }
    const series = (seriesRes.data ?? []).map((row: { bucket_start: string; revenue: number; txn_count: number }) => ({
        bucket_start: row.bucket_start,
        revenue:      round2(Number(row.revenue) || 0),
        txn_count:    row.txn_count ?? 0,
    }));

    const curr = aggregate(txnCurr.data ?? [], ordCurr.data ?? []);
    const prev = aggregate(txnPrev.data ?? [], ordPrev.data ?? []);

    // Cache strategy: if the range includes "now" (end is recent), keep fresh.
    // Otherwise the data can't change — cache aggressively.
    const isLiveRange = range.end.getTime() > Date.now() - 60_000; // end within last minute
    const cacheHeader = isLiveRange
        ? 'private, max-age=15, stale-while-revalidate=30'   // live: 15s fresh, 30s SWR
        : 'private, max-age=300, stale-while-revalidate=600'; // historical: 5min fresh, 10min SWR

    return NextResponse.json(
        {
            range: {
                key:      range.key,
                label:    range.label,
                start:    startIso,
                end:      endIso,
                timezone: range.timezone,
                bucket:   range.bucket,
            },
            // current period
            revenue:         curr.revenue,
            pending:         curr.pending,
            orders:          curr.orders,
            completed:       curr.completed,
            active:          curr.active,
            dine_in_count:   curr.dine_in_count,
            takeaway_count:  curr.takeaway_count,
            avg_order_value: curr.avg_order_value,
            by_payment_mode: curr.by_payment_mode,
            // deltas vs prior period of identical length
            revenue_prior:        prev.revenue,
            revenue_change_pct:   pctChange(curr.revenue, prev.revenue),
            orders_prior:         prev.orders,
            orders_change_pct:    pctChange(curr.orders, prev.orders),
            // time-series for the bar chart
            series,
        },
        { headers: { 'Cache-Control': cacheHeader } },
    );
}
