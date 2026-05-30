'use client';

import React, { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { usePlan } from '@/components/PlanContext';
import { useSite } from '@/components/SiteContext';
import { firebaseAuth } from '@/lib/firebase';
import DateRangeFilter, { useCurrentRange } from '@/components/DateRangeFilter';
import RevenueBarChart, { type RevenueBucket } from '@/components/RevenueBarChart';
import PaymentModeRing from '@/components/PaymentModeRing';
import TopLowPerformers from '@/components/TopLowPerformers';
import StoreSetupGuide from '@/components/StoreSetupGuide';

// Insights metrics — populated by GET /api/manage/insights, which is the SINGLE
// SOURCE OF TRUTH for revenue numbers. Reads from `transactions` (Success rows
// only), not from `orders`, so revenue = money actually collected, not money
// merely promised by an unpaid counter customer.
interface Insights {
    range: { key: string; label: string; start: string; end: string; timezone: string; bucket: 'hour' | 'day' | 'week' | 'month' };
    revenue:            number;
    pending:            number;
    orders:             number;
    completed:          number;
    active:             number;
    dine_in_count:      number;
    takeaway_count:     number;
    avg_order_value:    number;
    by_payment_mode:    Record<string, number>;
    revenue_prior:      number;
    revenue_change_pct: number | null;
    orders_prior:       number;
    orders_change_pct:  number | null;
    series:             RevenueBucket[];
}


/* ══════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════ */
function RealDashboard({ siteUrl, siteId, initialStoreOpen }: { siteUrl: string; siteId: string; initialStoreOpen: boolean }) {
    const { isPayEat, isQrOrder, isQrMenu, isTrialExpired, planLoading } = usePlan();
    const [storeOpen, setStoreOpen] = useState(initialStoreOpen);
    const [toggling, setToggling] = useState(false);
    const [insights, setInsights] = useState<Insights | null>(null);
    const [insightsLoading, setInsightsLoading] = useState(true);
    const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
    const [manualRefreshing, setManualRefreshing] = useState(false);
    const range = useCurrentRange();

    const canViewInsights = isPayEat || isQrOrder;
    // qr_menu plan gets a different, lighter insights block (menu views +
    // inventory summary) since they don't have orders/revenue to report on.
    const showMenuInsights = isQrMenu && !isQrOrder && !isPayEat;

    // ── Fetch insights server-side (transactions-backed; not orders-backed) ──
    // Server reads from `transactions` so revenue = money actually collected.
    // `range` is reflected back in the response so we can render the right label.
    // Stale-while-revalidate: we DON'T clear `insights` on refetch — old numbers
    // stay visible while the new ones load, so filter clicks feel instant.
    const fetchInsights = useCallback(async (initial: boolean) => {
        if (!siteId || !canViewInsights) { if (initial) setInsightsLoading(false); return; }
        if (initial) setInsightsLoading(true);
        try {
            const token = await firebaseAuth.currentUser?.getIdToken();
            if (!token) return;
            const qs = new URLSearchParams({ site_id: siteId, range });
            const res = await fetch(`/api/manage/insights?${qs.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            });
            if (!res.ok) return;
            const json = await res.json() as Insights;
            setInsights(json);
            setLastSyncedAt(Date.now());
        } catch (err) {
            console.error('[dashboard] fetchInsights error:', err);
        } finally {
            if (initial) setInsightsLoading(false);
        }
    }, [siteId, canViewInsights, range]);

    // Manual refresh — bumps the timestamp + shows spin while running.
    const handleManualRefresh = useCallback(async () => {
        if (manualRefreshing) return;
        setManualRefreshing(true);
        try { await fetchInsights(false); } finally { setManualRefreshing(false); }
    }, [fetchInsights, manualRefreshing]);

    // Tick once a minute so the "Updated X ago" text stays current without
    // re-fetching. Cheap render-only refresh.
    const [, setNowTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setNowTick(n => n + 1), 30_000);
        return () => clearInterval(id);
    }, []);

    // Refetch any time the range changes (URL ?range= update).
    useEffect(() => { fetchInsights(true); }, [fetchInsights]);

    // Shared authed fetch — passed to children that need their own data
    // (e.g. TopLowPerformers) so they reuse Firebase ID token handling.
    const authedFetch = useCallback(async (url: string, init: RequestInit = {}): Promise<Response> => {
        const token = await firebaseAuth.currentUser?.getIdToken();
        return fetch(url, {
            ...init,
            headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token ?? ''}` },
        });
    }, []);

    // Live polling — only for the "today" range (other ranges are historical, no need).
    useEffect(() => {
        if (!siteId || !canViewInsights || range !== 'today') return;
        let id: ReturnType<typeof setInterval> | null = null;
        const start = () => { if (!id) id = setInterval(() => fetchInsights(false), 30_000); };
        const stop  = () => { if (id) { clearInterval(id); id = null; } };
        const onVisibility = () => document.visibilityState === 'visible' ? (fetchInsights(false), start()) : stop();
        // Don't poll while the tab is in the background.
        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', onVisibility);
        return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
    }, [siteId, canViewInsights, range, fetchInsights]);

    // Inline delta renderer: '↑12%' green / '↓5%' red / '—' neutral.
    const renderDelta = (pct: number | null | undefined) => {
        if (pct === null || pct === undefined) return null;
        const up = pct >= 0;
        return (
            <span style={{
                fontSize: 11, fontWeight: 600,
                color: up ? '#16A34A' : '#DC2626',
                background: up ? '#F0FDF4' : '#FEF2F2',
                padding: '2px 6px', borderRadius: 999,
                marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 2,
            }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                    {up ? 'arrow_upward' : 'arrow_downward'}
                </span>
                {Math.abs(pct).toFixed(0)}%
            </span>
        );
    };

    // ── Store toggle ────────────────────────────────────────────────────────
    // Optimistic flip with rollback on failure. Without the rollback + toast,
    // a failed network request leaves the UI showing "Open" while the server
    // still has the store closed — owners think they're taking orders when
    // they aren't.
    const handleToggleStore = async () => {
        if (toggling || !siteId || isTrialExpired) return;
        const prev = storeOpen;
        const next = !storeOpen;
        setStoreOpen(next);
        setToggling(true);
        const rollback = (message: string) => {
            setStoreOpen(prev);
            toast.error(message);
        };
        try {
            const token = await firebaseAuth.currentUser?.getIdToken();
            if (!token) { rollback('Session expired. Please sign in again.'); setToggling(false); return; }
            const res = await fetch('/api/sites/toggle-live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ siteId, is_live: next }),
            });
            if (!res.ok) {
                rollback(next ? "Couldn't open the store. Try again." : "Couldn't close the store. Try again.");
            } else {
                toast.success(next ? 'Store is now open' : 'Store is now closed');
            }
        } catch {
            rollback('Network error — store status unchanged.');
        }
        setToggling(false);
    };

    return (
        <div className="px-4 lg:px-8 py-5 lg:py-8">

            {/* Page header */}
            <div className="flex items-start justify-between mb-5 lg:mb-6">
                <div>
                    <h1 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 26, lineHeight: '32px' }}>Dashboard</h1>
                    <p className="text-[#52525C] mt-1" style={{ fontSize: 14, lineHeight: '22px' }}>Manage your orders in real-time</p>
                </div>
                <a
                    href={siteUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-white hover:opacity-90 transition-opacity shrink-0"
                    style={{ background: '#5137EF', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>open_in_new</span>
                    <span className="hidden sm:inline">Preview Store</span>
                </a>
            </div>

            {/* Post-onboarding setup guide — auto-verifying checklist that retires
                itself once the store is fully set up (or the owner dismisses it). */}
            {!planLoading && siteId && (
                <StoreSetupGuide
                    siteId={siteId}
                    isPayEat={isPayEat}
                    storeOpen={storeOpen}
                    onGoLive={handleToggleStore}
                />
            )}

            {/* Store Status */}
            {!planLoading && isTrialExpired ? (
                <div className="flex items-center justify-between mb-5 lg:mb-6" style={{ border: '1px solid #FECACA', borderRadius: 12, padding: '14px 20px', background: '#FEF2F2' }}>
                    <div className="flex items-center gap-3">
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#DC2626', fontVariationSettings: "'FILL' 1" }}>lock</span>
                        </div>
                        <div>
                            <p className="font-semibold" style={{ fontSize: 14, color: '#7F1D1D' }}>Store is offline</p>
                            <p style={{ fontSize: 12, color: '#B91C1C' }}>Your free trial ended. Activate a plan to go live.</p>
                        </div>
                    </div>
                    <Link href="/manage/subscription" className="shrink-0 flex items-center gap-1.5 text-white hover:opacity-90 transition-opacity" style={{ background: '#DC2626', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
                        Activate Plan
                    </Link>
                </div>
            ) : (
                <div className="flex items-center justify-between mb-5 lg:mb-6" style={{ border: '1px solid #E4E4E7', borderRadius: 12, padding: '14px 20px', background: '#FFFFFF' }}>
                    <div className="flex items-center gap-3">
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: storeOpen ? '#DCFCE7' : '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: storeOpen ? '#16A34A' : '#71717A' }}>power_settings_new</span>
                        </div>
                        <div>
                            <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 14 }}>Store Status</p>
                            <p className="text-[#71717A]" style={{ fontSize: 12 }}>Use the toggle to switch store status (Open/Closed)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <span className="hidden sm:inline" style={{ fontSize: 12, fontWeight: 500, color: storeOpen ? '#16A34A' : '#71717A' }}>
                            {storeOpen ? (canViewInsights ? 'Open & Accepting Orders' : 'Open, users can view now') : 'Closed'}
                        </span>
                        <button
                            onClick={handleToggleStore}
                            disabled={toggling}
                            style={{ position: 'relative', display: 'flex', alignItems: 'center', width: 46, height: 24, borderRadius: 9999, background: storeOpen ? '#00A63E' : '#D4D4D8', border: 'none', cursor: toggling ? 'wait' : 'pointer', transition: 'background 0.2s', padding: 0, flexShrink: 0, opacity: toggling ? 0.7 : 1 }}
                        >
                            <span style={{ position: 'absolute', top: 3, left: storeOpen ? 24 : 3, width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
                        </button>
                    </div>
                </div>
            )}

            {/* ── INSIGHTS ─────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 17 }}>Insights</h2>
                    {canViewInsights && (
                        <SyncIndicator
                            syncedAt={lastSyncedAt}
                            loading={insightsLoading || manualRefreshing}
                            onRefresh={handleManualRefresh}
                        />
                    )}
                </div>
                {canViewInsights && <DateRangeFilter variant="chips" />}
            </div>

            {showMenuInsights ? (
                <MenuInsights siteId={siteId} authedFetch={authedFetch} />
            ) : !canViewInsights ? (
                <div className="flex flex-col items-center justify-center text-center mb-6 md:mb-8" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '36px 24px', background: '#FAFAFA' }}>
                    <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: '50%', background: '#EEEEFF', marginBottom: 16 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#5137EF' }}>bar_chart</span>
                    </div>
                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 16, marginBottom: 6 }}>Insights — QR Ordering Plan Required</p>
                    <p className="text-[#71717A]" style={{ fontSize: 13, maxWidth: 320 }}>
                        Sales analytics and order insights are available on the QR Ordering plan.
                    </p>
                </div>
            ) : (
                <>
                    {/* All revenue figures below come from confirmed transactions
                        (status='Success'), not from placed orders. Money customers
                        promised but haven't paid yet shows in the separate Pending card. */}
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap" style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '8px 12px' }}>
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#0284C7', flexShrink: 0 }}>info</span>
                            <p style={{ fontSize: 12, color: '#075985', margin: 0 }}>
                                Revenue = money <strong>actually collected</strong>. Pending = money <strong>owed</strong> by customers who haven&apos;t paid yet.
                            </p>
                        </div>
                        {insights?.range?.label && (
                            <span style={{ fontSize: 11, color: '#0369A1', fontWeight: 600 }}>
                                {insights.range.label}
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 md:mb-5">
                        {[
                            { key:'revenue',  label: 'Revenue',  value: insightsLoading || !insights ? '—' : `₹${insights.revenue.toLocaleString('en-IN')}`,   delta: insights?.revenue_change_pct, icon: 'payments',     color: '#16A34A', bg: '#F0FDF4' },
                            { key:'pending',  label: 'Pending',  value: insightsLoading || !insights ? '—' : `₹${insights.pending.toLocaleString('en-IN')}`,   delta: null,                          icon: 'pending',      color: '#F97316', bg: '#FFF7ED' },
                            { key:'orders',   label: 'Orders',   value: insightsLoading || !insights ? '—' : String(insights.orders),                          delta: insights?.orders_change_pct,  icon: 'receipt_long', color: '#5137EF', bg: '#EEEEFF' },
                            { key:'done',     label: 'Completed',value: insightsLoading || !insights ? '—' : String(insights.completed),                       delta: null,                          icon: 'check_circle', color: '#0EA5E9', bg: '#F0F9FF' },
                        ].map(card => (
                            <div key={card.key} style={{ border: '1px solid #E4E4E7', borderRadius: 12, padding: '16px', background: '#FFFFFF' }}>
                                <div className="flex items-center gap-2 mb-2">
                                    <div style={{ width: 32, height: 32, borderRadius: 8, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 17, color: card.color, fontVariationSettings: "'FILL' 1" }}>{card.icon}</span>
                                    </div>
                                    <span style={{ fontSize: 12, color: '#71717A', fontWeight: 500 }}>{card.label}</span>
                                </div>
                                <div className="flex items-baseline">
                                    <p className="font-bold text-[#0A0A0A]" style={{ fontSize: 22, lineHeight: 1 }}>{card.value}</p>
                                    {!insightsLoading && card.delta !== null && card.delta !== undefined && renderDelta(card.delta)}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Revenue bar chart — re-keyed on range so animation replays */}
                    {!insightsLoading && insights?.series && (
                        <div className="mb-4">
                            <RevenueBarChart
                                key={insights.range.key}
                                series={insights.series}
                                bucket={insights.range.bucket}
                                timezone={insights.range.timezone}
                            />
                        </div>
                    )}
                    {insightsLoading && (
                        // Chart-area skeleton so the dashboard doesn't visibly "jump" when
                        // the chart pops in. Heights chosen to match RevenueBarChart's
                        // default 200 px + 56 px label band.
                        <div className="mb-4" style={{ border: '1px solid #E4E4E7', borderRadius: 12, padding: '16px 20px 12px', background: '#FFFFFF' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 200, paddingTop: 24 }}>
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                                        <div style={{
                                            width: '70%', maxWidth: 32, minWidth: 14,
                                            height: `${30 + ((i * 17) % 60)}%`,
                                            background: '#F4F4F5', borderRadius: '6px 6px 0 0',
                                            animation: 'dash-pulse 1.4s ease-in-out infinite',
                                        }} />
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: 4, marginTop: 8, height: 14 }} />
                            <style>{`@keyframes dash-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
                        </div>
                    )}

                    {/* Second row: operational + by-mode breakdown */}
                    {!insightsLoading && insights && (insights.completed > 0 || Object.keys(insights.by_payment_mode).length > 0) && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6 md:mb-8">
                            {/* Order-type donut (QR Order plan) or Avg-order-value card (other plans).
                                The QR Order without-payment plan cares about table-mode vs takeaway
                                split — Active Orders moved to the Orders page where it belongs. */}
                            <div style={{ border: '1px solid #E4E4E7', borderRadius: 12, padding: '14px 16px', background: '#FFFFFF' }}>
                                {isQrOrder ? (
                                    <>
                                        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                                            <p style={{ fontSize: 11, color: '#71717A', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Order Type</p>
                                            <p style={{ fontSize: 11, color: '#99A1AF', margin: 0 }}>
                                                Avg ₹{insights.avg_order_value.toLocaleString('en-IN')}
                                            </p>
                                        </div>
                                        <PaymentModeRing
                                            key={insights.range.key}
                                            breakdown={{
                                                'Dine-in': insights.dine_in_count,
                                                Takeaway:  insights.takeaway_count,
                                            }}
                                            totalLabel="Orders"
                                            formatValue={(n) => `${n} ${n === 1 ? 'order' : 'orders'}`}
                                            formatTotal={(n) => String(n)}
                                            emptyMessage="No orders in this period yet."
                                        />
                                    </>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p style={{ fontSize: 11, color: '#71717A', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Avg Order Value</p>
                                            <p className="font-bold text-[#0A0A0A]" style={{ fontSize: 20, lineHeight: 1, marginTop: 4 }}>₹{insights.avg_order_value.toLocaleString('en-IN')}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Payment-mode donut — Cash / UPI / Card split.
                                Re-keyed on range so the arcs re-animate when filter changes. */}
                            <div style={{ border: '1px solid #E4E4E7', borderRadius: 12, padding: '14px 16px', background: '#FFFFFF' }}>
                                <p style={{ fontSize: 11, color: '#71717A', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0, marginBottom: 12 }}>Revenue by Mode</p>
                                <PaymentModeRing
                                    key={insights.range.key}
                                    breakdown={insights.by_payment_mode}
                                />
                            </div>
                        </div>
                    )}

                    {/* Top / Low performing items — item-level revenue drilldown.
                        Self-fetches from /api/manage/insights/top-items, re-keyed by
                        range so it re-animates when the filter changes. */}
                    {!insightsLoading && insights && siteId && (
                        <div className="mb-6 md:mb-8">
                            <TopLowPerformers
                                siteId={siteId}
                                rangeKey={insights.range.key}
                                rangeLabel={insights.range.label}
                                authedFetch={authedFetch}
                            />
                        </div>
                    )}
                </>
            )}

        </div>
    );
}

/* ══════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════ */
export default function DashboardPage() {
    return (
        <Suspense>
            <DashboardContent />
        </Suspense>
    );
}

function DashboardContent() {
    const { activeSite, refreshSites } = useSite();
    const searchParams = useSearchParams();
    const [showBanner, setShowBanner] = useState(false);
    const [itemCount, setItemCount] = useState(0);

    // Onboarded-banner side effect: runs ONCE per mount.
    // Previously this effect re-ran every time `searchParams` or `refreshSites`
    // identity changed AND it unconditionally rewrote the URL to
    // `/manage/dashboard` (no params). That wiped ?range=last7d on any
    // re-render, making the date filter appear to reset on scroll/interaction.
    // The fix:
    //   1. useRef guard so the strip happens at most once.
    //   2. Strip ONLY ?onboarded and ?items — preserve everything else
    //      (?range, custom start/end, etc).
    const onboardedHandled = useRef(false);
    useEffect(() => {
        if (onboardedHandled.current) return;
        const onboarded = searchParams.get('onboarded');
        if (onboarded !== 'true') return;
        onboardedHandled.current = true;

        const items = searchParams.get('items');
        setShowBanner(true);
        setItemCount(Number(items ?? 0));
        refreshSites();

        // Strip only the banner params; keep everything else (e.g., ?range=).
        const next = new URLSearchParams(searchParams.toString());
        next.delete('onboarded');
        next.delete('items');
        const qs = next.toString();
        window.history.replaceState({}, '', qs ? `/manage/dashboard?${qs}` : '/manage/dashboard');
    }, [searchParams, refreshSites]);

    const siteSlug = activeSite?.slug ?? '';
    const siteUrl = siteSlug ? `/shop/${siteSlug}` : '#';
    const siteId = activeSite?.id ?? '';
    const initialStoreOpen = activeSite ? activeSite.is_live !== false : true;

    return (
        <>
            {showBanner && (
                <div className="mx-4 mt-4 md:mx-8 flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-green-600" style={{ fontSize: 20 }}>check_circle</span>
                        <p className="text-sm font-medium text-green-800">
                            {itemCount > 0
                                ? `Your menu is ready! ${itemCount} items extracted from your photos.`
                                : 'Your store is set up! Add menu items from the product inventory.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {siteSlug && (
                            <a href={`/shop/${siteSlug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors">
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>open_in_new</span>
                                Preview Menu
                            </a>
                        )}
                        <button onClick={() => setShowBanner(false)} className="text-green-500 hover:text-green-700">
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                        </button>
                    </div>
                </div>
            )}
            <RealDashboard key={siteId} siteUrl={siteUrl} siteId={siteId} initialStoreOpen={initialStoreOpen} />
        </>
    );
}

/* ══════════════════════════════════════════════════════════
   SYNC INDICATOR
   Small chip beside the Insights heading: status icon + relative
   "Updated Xm ago" text + refresh button. Mirrors the pattern used
   by Stripe Dashboard / Square / Shopify analytics — owners always
   know how fresh the numbers on screen are, and can force a refresh
   when they just made a change in another tab.
══════════════════════════════════════════════════════════ */
function SyncIndicator({
    syncedAt, loading, onRefresh,
}: {
    syncedAt: number | null;
    loading: boolean;
    onRefresh: () => void;
}) {
    const rel = formatRelative(syncedAt);
    const abs = syncedAt
        ? new Date(syncedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
        : '';

    return (
        <div
            className="flex items-center gap-2"
            style={{
                border: '1px solid #E4E4E7',
                background: '#FFFFFF',
                borderRadius: 10,
                padding: '4px 4px 4px 10px',
                height: 32,
            }}
            title={abs ? `Last synced: ${abs}` : 'Not synced yet'}
        >
            <span
                className="material-symbols-outlined"
                aria-hidden
                style={{ fontSize: 14, color: loading ? '#5137EF' : '#16A34A' }}
            >
                {loading ? 'sync' : 'desktop_windows'}
            </span>
            <div className="flex flex-col leading-tight" style={{ minWidth: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#0A0A0A', lineHeight: '14px' }}>
                    {loading ? 'Syncing…' : 'Order Sync On'}
                </span>
                <span className="truncate" style={{ fontSize: 10.5, color: '#71717A', lineHeight: '13px' }}>
                    {syncedAt ? `Updated ${rel}` : 'Awaiting first sync'}
                </span>
            </div>
            <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                aria-label="Refresh insights"
                title="Refresh now"
                className="flex items-center justify-center hover:bg-neutral-50 transition-colors"
                style={{
                    width: 24, height: 24, borderRadius: 6,
                    border: '1px solid #E4E4E7', background: '#FFFFFF',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                }}
            >
                <span
                    className="material-symbols-outlined"
                    style={{
                        fontSize: 14, color: '#52525C',
                        animation: loading ? 'sync-spin 0.8s linear infinite' : 'none',
                        display: 'inline-block',
                    }}
                >
                    refresh
                </span>
            </button>
            <style>{`@keyframes sync-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════
   MENU INSIGHTS  (qr_menu plan)
   Light-weight summary block for menu-only stores: how many
   people scanned the menu today, total inventory size, and a
   per-category breakdown. Polls /api/manage/menu-summary every
   30 s for near-realtime updates.
══════════════════════════════════════════════════════════ */
interface MenuSummary {
    scans_today:      number;
    scans_total:      number;
    total_products:   number;
    total_categories: number;
    categories:       { name: string; count: number }[];
    generated_at:     string;
}

function MenuInsights({
    siteId,
    authedFetch,
}: {
    siteId: string;
    authedFetch: (url: string, init?: RequestInit) => Promise<Response>;
}) {
    const [summary, setSummary] = useState<MenuSummary | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchSummary = useCallback(async () => {
        if (!siteId) return;
        try {
            const res = await authedFetch(`/api/manage/menu-summary?site_id=${siteId}`, { cache: 'no-store' });
            if (!res.ok) return;
            const json = await res.json() as MenuSummary;
            setSummary(json);
        } catch (err) {
            console.error('[dashboard] fetchSummary error:', err);
        } finally {
            setLoading(false);
        }
    }, [siteId, authedFetch]);

    // Initial fetch + 30s polling so the owner sees scans pile up live.
    useEffect(() => { fetchSummary(); }, [fetchSummary]);
    useEffect(() => {
        if (!siteId) return;
        let id: ReturnType<typeof setInterval> | null = null;
        const start = () => { if (!id) id = setInterval(fetchSummary, 30_000); };
        const stop  = () => { if (id) { clearInterval(id); id = null; } };
        const onVisibility = () => document.visibilityState === 'visible' ? (fetchSummary(), start()) : stop();
        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', onVisibility);
        return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
    }, [siteId, fetchSummary]);

    const cards = [
        { key: 'scans',      label: 'Scans Today',     value: summary?.scans_today,      icon: 'qr_code_scanner', color: '#5137EF', bg: '#EEEEFF', hint: 'Unique visitors' },
        { key: 'total',      label: 'Total Visitors',  value: summary?.scans_total,      icon: 'group',           color: '#0EA5E9', bg: '#F0F9FF', hint: 'All-time unique' },
        { key: 'products',   label: 'Total Products',  value: summary?.total_products,   icon: 'inventory_2',     color: '#16A34A', bg: '#F0FDF4', hint: 'In your menu' },
        { key: 'categories', label: 'Total Categories',value: summary?.total_categories, icon: 'category',        color: '#F97316', bg: '#FFF7ED', hint: 'With products' },
    ];

    return (
        <div className="mb-6 md:mb-8">
            {/* Info strip — matches paid-plan dashboard's visual rhythm */}
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap" style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '8px 12px' }}>
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#0284C7', flexShrink: 0 }}>info</span>
                    <p style={{ fontSize: 12, color: '#075985', margin: 0 }}>
                        Live menu activity — updates every 30 seconds. Numbers count <strong>unique visitors</strong>, not refreshes.
                    </p>
                </div>
                <span style={{ fontSize: 11, color: '#0369A1', fontWeight: 600 }}>Today</span>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                {cards.map(card => (
                    <div key={card.key} style={{ border: '1px solid #E4E4E7', borderRadius: 12, padding: '16px', background: '#FFFFFF' }}>
                        <div className="flex items-center gap-2 mb-2">
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 17, color: card.color, fontVariationSettings: "'FILL' 1" }}>{card.icon}</span>
                            </div>
                            <span style={{ fontSize: 12, color: '#71717A', fontWeight: 500 }}>{card.label}</span>
                        </div>
                        <p className="font-bold text-[#0A0A0A]" style={{ fontSize: 22, lineHeight: 1 }}>
                            {loading || !summary ? '—' : (card.value ?? 0).toLocaleString('en-IN')}
                        </p>
                        <p style={{ fontSize: 11, color: '#99A1AF', marginTop: 6 }}>{card.hint}</p>
                    </div>
                ))}
            </div>

            {/* Per-category breakdown */}
            <div style={{ border: '1px solid #E4E4E7', borderRadius: 12, background: '#FFFFFF', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#5137EF' }}>category</span>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A', margin: 0 }}>Items per Category</p>
                    </div>
                    {summary && summary.categories.length > 0 && (
                        <span style={{ fontSize: 11, color: '#71717A' }}>{summary.categories.length} groups</span>
                    )}
                </div>

                {loading ? (
                    <div style={{ padding: '16px' }}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3" style={{ padding: '10px 0', borderBottom: i < 2 ? '1px solid #F4F4F5' : 'none' }}>
                                <div style={{ width: 28, height: 28, borderRadius: 6, background: '#F4F4F5', animation: 'dash-pulse 1.4s ease-in-out infinite' }} />
                                <div style={{ flex: 1, height: 10, background: '#F4F4F5', borderRadius: 4, animation: 'dash-pulse 1.4s ease-in-out infinite' }} />
                                <div style={{ width: 24, height: 10, background: '#F4F4F5', borderRadius: 4, animation: 'dash-pulse 1.4s ease-in-out infinite' }} />
                            </div>
                        ))}
                        <style>{`@keyframes dash-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
                    </div>
                ) : !summary || summary.categories.length === 0 ? (
                    <div className="flex flex-col items-center text-center" style={{ padding: '32px 16px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#D4D4D8', marginBottom: 8 }}>inventory_2</span>
                        <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 13, marginBottom: 2 }}>No products yet</p>
                        <p style={{ fontSize: 12, color: '#71717A', maxWidth: 280 }}>
                            Add items in <Link href="/manage/product-inventory" style={{ color: '#5137EF', fontWeight: 600 }}>Product Inventory</Link> to see them grouped here.
                        </p>
                    </div>
                ) : (
                    <div>
                        {(() => {
                            const max = summary.categories[0]?.count ?? 1;
                            return summary.categories.map((cat, i) => {
                                const pct = Math.max(6, Math.round((cat.count / max) * 100));
                                const isUncat = cat.name === 'Uncategorized';
                                return (
                                    <div
                                        key={cat.name}
                                        style={{
                                            padding: '12px 16px',
                                            borderBottom: i < summary.categories.length - 1 ? '1px solid #F4F4F5' : 'none',
                                            display: 'flex', alignItems: 'center', gap: 12,
                                        }}
                                    >
                                        <div style={{
                                            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                                            background: isUncat ? '#F4F4F5' : '#EEEEFF',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 15, color: isUncat ? '#71717A' : '#5137EF' }}>
                                                {isUncat ? 'help' : 'restaurant'}
                                            </span>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                                                <span className="truncate" style={{ fontSize: 13, fontWeight: 500, color: isUncat ? '#71717A' : '#0A0A0A' }}>
                                                    {cat.name}
                                                </span>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: '#0A0A0A', flexShrink: 0, marginLeft: 8 }}>
                                                    {cat.count} {cat.count === 1 ? 'item' : 'items'}
                                                </span>
                                            </div>
                                            <div style={{ height: 4, background: '#F4F4F5', borderRadius: 999, overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${pct}%`, height: '100%',
                                                    background: isUncat ? '#D4D4D8' : 'linear-gradient(90deg, #5137EF, #7C3AED)',
                                                    borderRadius: 999, transition: 'width 0.4s ease',
                                                }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                )}
            </div>
        </div>
    );
}

function formatRelative(ts: number | null): string {
    if (!ts) return '';
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 10)      return 'just now';
    if (s < 60)      return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60)      return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)      return `${h}h ago`;
    return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}
