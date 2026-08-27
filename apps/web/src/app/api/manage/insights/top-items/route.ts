// GET /api/manage/insights/top-items?site_id=<uuid>&range=<preset>[&start=&end=]
//
// Returns the ranked item list for the dashboard "Top / Low performing items"
// cards. Range is resolved via the same dateRange helper as the main insights
// endpoint, so the two cards always agree on what "today" / "last 7 days" mean.
//
// Response shape:
//   {
//     range: { key, label, start, end, timezone },
//     total_revenue,         // sum of revenue across ALL items in the range
//     top:    Item[],        // top 3 by revenue
//     low:    Item[],        // bottom 3 by revenue (each with >=1 sale)
//     top_share_pct,         // top 3 contribution to total revenue (rounded int)
//     item_count             // distinct items sold in the range
//   }
//   Item = { product_id, product_name, image_url, revenue, qty, order_count, share_pct }

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';
import { rangeFromSearchParams } from '@/lib/dateRange';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface Row {
    product_id:   string | null;
    product_name: string;
    image_url:    string | null;
    revenue:      number;
    qty:          number;
    order_count:  number;
}

interface Item extends Row { share_pct: number }

const round2 = (n: number) => Math.round(n * 100) / 100;

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

    const { data: site } = await supabaseServer
        .from('sites')
        .select('id, timezone')
        .eq('id', siteId)
        .eq('user_id', userId)
        .maybeSingle();
    if (!site) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const tz: string = site.timezone ?? 'Asia/Kolkata';
    const range = rangeFromSearchParams(url.searchParams, tz);

    const startIso = range.start.toISOString();
    const endIso   = range.end.toISOString();

    const { data, error } = await supabaseServer.rpc('insights_top_items', {
        p_site_id: siteId,
        p_start:   startIso,
        p_end:     endIso,
    });
    if (error) {
        console.error('[GET /api/manage/insights/top-items]', error);
        return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
    }

    const rows: Row[] = (data ?? []).map((r: { product_id: string | null; product_name: string; image_url: string | null; revenue: number | string; qty: number | string; order_count: number | string }) => ({
        product_id:   r.product_id,
        product_name: r.product_name,
        image_url:    r.image_url,
        revenue:      round2(Number(r.revenue) || 0),
        qty:          Number(r.qty) || 0,
        order_count:  Number(r.order_count) || 0,
    }));

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

    const withShare = (r: Row): Item => ({
        ...r,
        share_pct: totalRevenue > 0 ? Math.round((r.revenue / totalRevenue) * 1000) / 10 : 0,
    });

    // Top 3 by revenue (already sorted desc).
    const top = rows.slice(0, 3).map(withShare);

    // Low 3: bottom-by-revenue among items with at least one sale. We sort
    // ascending and take the first 3 that are NOT already in `top` so a
    // 3-item-only dataset doesn't double-list every item.
    const topNames = new Set(top.map(t => t.product_name));
    const low = rows
        .filter(r => r.revenue > 0 && !topNames.has(r.product_name))
        .sort((a, b) => a.revenue - b.revenue)
        .slice(0, 3)
        .map(withShare);

    const top3Sum = top.reduce((s, r) => s + r.revenue, 0);
    const topSharePct = totalRevenue > 0 ? Math.round((top3Sum / totalRevenue) * 100) : 0;

    return NextResponse.json(
        {
            range: {
                key:      range.key,
                label:    range.label,
                start:    startIso,
                end:      endIso,
                timezone: range.timezone,
            },
            total_revenue: round2(totalRevenue),
            top,
            low,
            top_share_pct: topSharePct,
            item_count:    rows.length,
        },
        // Same cache policy as /api/manage/insights — short TTL when live.
        { headers: { 'Cache-Control': range.end.getTime() > Date.now() - 60_000
                ? 'private, max-age=15, stale-while-revalidate=30'
                : 'private, max-age=300, stale-while-revalidate=600' } },
    );
}
