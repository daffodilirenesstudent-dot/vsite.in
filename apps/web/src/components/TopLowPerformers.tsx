'use client';

// TopLowPerformers — two stacked cards on the dashboard:
//   ↑ Top Performing Items   (3 highest-revenue items in the selected range)
//   ↓ Low Performing Items   (3 lowest-revenue items that still sold ≥ 1 unit)
//
// Each row renders the item name, revenue, and a proportional bar so the
// distribution is visible at a glance — a single screen-glance answers
// "what do I push? what do I drop?" without a separate analytics page.
//
// Re-fetches on range change (re-keyed by `rangeKey`); animates on first paint.

import React, { useEffect, useState } from 'react';

export interface PerformerItem {
    product_id:   string | null;
    product_name: string;
    image_url:    string | null;
    revenue:      number;
    qty:          number;
    order_count:  number;
    share_pct:    number;
}

interface Props {
    siteId:    string;
    rangeKey:  string;       // e.g. 'today', 'last7d' — drives re-fetch + re-animate
    rangeLabel: string;
    authedFetch: (url: string, init?: RequestInit) => Promise<Response>;
    currency?: string;
}

interface Payload {
    total_revenue: number;
    top:           PerformerItem[];
    low:           PerformerItem[];
    top_share_pct: number;
    item_count:    number;
}

function formatAmount(n: number, currency: string): string {
    if (n >= 100_000) return `${currency}${(n / 100_000).toFixed(1)}L`;
    if (n >= 1_000)   return `${currency}${(n / 1_000).toFixed(1)}K`;
    return `${currency}${Math.round(n)}`;
}

export default function TopLowPerformers({
    siteId, rangeKey, rangeLabel, authedFetch, currency = '₹',
}: Props) {
    const [data,    setData]    = useState<Payload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState<string | null>(null);
    const [playing, setPlaying] = useState(false);

    // Re-fetch whenever site or range changes
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setPlaying(false);
        setError(null);
        const url = `/api/manage/insights/top-items?site_id=${encodeURIComponent(siteId)}&range=${encodeURIComponent(rangeKey)}`;
        authedFetch(url, { cache: 'no-store' })
            .then(async r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then((json: Payload) => {
                if (cancelled) return;
                setData(json);
                setLoading(false);
                // Kick off animation one frame after data lands.
                requestAnimationFrame(() => { if (!cancelled) setPlaying(true); });
            })
            .catch(e => {
                if (cancelled) return;
                console.error('[TopLowPerformers]', e);
                setError('Could not load item performance');
                setLoading(false);
            });
        return () => { cancelled = true; };
    }, [siteId, rangeKey, authedFetch]);

    // Used to scale the bar widths within each card (top max for top, low max for low)
    const topMax = data?.top.length ? Math.max(...data.top.map(t => t.revenue), 1) : 1;
    const lowMax = data?.low.length ? Math.max(...data.low.map(t => t.revenue), 1) : 1;

    return (
        <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
        >
            {/* ── Top performers ──────────────────────────────────────────── */}
            <Card
                tone="positive"
                icon="trending_up"
                title="Top Performing Items"
                subtitle={rangeLabel}
                loading={loading}
                error={error}
                empty={!loading && !error && (data?.top.length ?? 0) === 0}
                footer={
                    !loading && data && data.top.length > 0
                        ? (
                            <p style={{ fontSize: 12, color: '#52525C' }}>
                                These <strong style={{ color: '#0A0A0A' }}>{data.top.length}</strong> items contribute{' '}
                                <strong style={{ color: '#5137EF' }}>{data.top_share_pct}%</strong> of total revenue.
                            </p>
                        )
                        : null
                }
            >
                {data?.top.map((it, i) => (
                    <PerformerRow
                        key={it.product_name + i}
                        rank={i + 1}
                        item={it}
                        max={topMax}
                        playing={playing}
                        barColor="#5137EF"
                        currency={currency}
                    />
                ))}
            </Card>

            {/* ── Low performers ──────────────────────────────────────────── */}
            <Card
                tone="warning"
                icon="trending_down"
                title="Low Performing Items"
                subtitle={rangeLabel}
                loading={loading}
                error={error}
                empty={!loading && !error && (data?.low.length ?? 0) === 0}
                footer={
                    !loading && data && data.low.length > 0
                        ? (
                            <p style={{ fontSize: 12, color: '#52525C' }}>
                                Consider re-pricing, repositioning, or promoting these items.
                            </p>
                        )
                        : null
                }
            >
                {data?.low.map((it, i) => (
                    <PerformerRow
                        key={it.product_name + i}
                        rank={i + 1}
                        item={it}
                        max={lowMax}
                        playing={playing}
                        barColor="#F59E0B"
                        currency={currency}
                    />
                ))}
            </Card>
        </div>
    );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Card({
    tone, icon, title, subtitle, loading, error, empty, footer, children,
}: {
    tone: 'positive' | 'warning';
    icon: string;
    title: string;
    subtitle: string;
    loading: boolean;
    error: string | null;
    empty: boolean;
    footer: React.ReactNode;
    children: React.ReactNode;
}) {
    const accent = tone === 'positive' ? '#5137EF' : '#F59E0B';
    const accentBg = tone === 'positive' ? '#EEEBFD' : '#FEF3C7';

    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E4E4E7',
            borderRadius: 14,
            padding: '18px 20px 16px',
            display: 'flex', flexDirection: 'column', gap: 14,
            minHeight: 240,
        }}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div style={{
                        width: 32, height: 32, borderRadius: 9, background: accentBg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: accent }}>{icon}</span>
                    </div>
                    <div className="min-w-0">
                        <p style={{ fontSize: 10, fontWeight: 600, color: '#71717A', letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>
                            {title}
                        </p>
                        <p className="truncate" style={{ fontSize: 12, color: '#99A1AF', margin: '2px 0 0' }}>
                            {subtitle}
                        </p>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {loading
                    ? <SkeletonRows />
                    : error
                        ? <ErrorState message={error} />
                        : empty
                            ? <EmptyState tone={tone} />
                            : children}
            </div>

            {/* Footer */}
            {footer && (
                <div style={{ borderTop: '1px solid #F4F4F5', paddingTop: 10, marginTop: 'auto' }}>
                    {footer}
                </div>
            )}
        </div>
    );
}

function PerformerRow({
    rank, item, max, playing, barColor, currency,
}: {
    rank: number;
    item: PerformerItem;
    max: number;
    playing: boolean;
    barColor: string;
    currency: string;
}) {
    const fraction = max > 0 ? item.revenue / max : 0;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <span style={{
                        width: 18, height: 18, borderRadius: 5,
                        background: '#F4F4F5', color: '#52525C',
                        fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        {rank}
                    </span>
                    <p className="truncate" style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A', margin: 0 }}>
                        {item.product_name}
                    </p>
                </div>
                <div className="flex items-baseline gap-1 flex-shrink-0">
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>
                        {formatAmount(item.revenue, currency)}
                    </span>
                    <span style={{ fontSize: 10, color: '#99A1AF' }}>· {item.qty} sold</span>
                </div>
            </div>
            {/* Bar */}
            <div style={{
                height: 6, borderRadius: 3, background: '#F4F4F5', overflow: 'hidden',
            }}>
                <div style={{
                    height: '100%', width: `${playing ? fraction * 100 : 0}%`,
                    background: barColor, borderRadius: 3,
                    transition: 'width 700ms cubic-bezier(0.25, 0.1, 0.25, 1)',
                }} />
            </div>
        </div>
    );
}

function SkeletonRows() {
    return (
        <>
            {[0, 1, 2].map(i => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="flex items-center justify-between">
                        <div style={{ height: 12, width: '50%', background: '#F4F4F5', borderRadius: 4, animation: 'tlp-pulse 1.4s ease-in-out infinite' }} />
                        <div style={{ height: 12, width: 56, background: '#F4F4F5', borderRadius: 4, animation: 'tlp-pulse 1.4s ease-in-out infinite' }} />
                    </div>
                    <div style={{ height: 6, background: '#F4F4F5', borderRadius: 3, animation: 'tlp-pulse 1.4s ease-in-out infinite' }} />
                </div>
            ))}
            <style>{`@keyframes tlp-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }`}</style>
        </>
    );
}

function ErrorState({ message }: { message: string }) {
    return (
        <div className="flex items-center justify-center" style={{ flex: 1, minHeight: 140 }}>
            <p style={{ fontSize: 12, color: '#DC2626' }}>{message}</p>
        </div>
    );
}

function EmptyState({ tone }: { tone: 'positive' | 'warning' }) {
    return (
        <div className="flex flex-col items-center justify-center text-center" style={{ flex: 1, minHeight: 140, gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#D4D4D8' }}>
                {tone === 'positive' ? 'insights' : 'inventory_2'}
            </span>
            <p style={{ fontSize: 12, color: '#99A1AF', margin: 0 }}>
                No sales in this period yet.
            </p>
        </div>
    );
}
