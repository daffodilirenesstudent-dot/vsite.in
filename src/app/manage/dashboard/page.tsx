'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { usePlan } from '@/components/PlanContext';
import { useSite } from '@/components/SiteContext';
import { firebaseAuth } from '@/lib/firebase';




/* ══════════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════════ */
function RealDashboard({ siteUrl, siteId, initialStoreOpen }: { siteUrl: string; siteId: string; initialStoreOpen: boolean }) {
    const { isPayEat, isTrialExpired, planLoading } = usePlan();
    const [storeOpen, setStoreOpen] = useState(initialStoreOpen);
    const [toggling, setToggling] = useState(false);
    const handleToggleStore = async () => {
        if (toggling || !siteId || isTrialExpired) return;
        const next = !storeOpen;
        setStoreOpen(next);
        setToggling(true);
        try {
            const token = await firebaseAuth.currentUser?.getIdToken();
            if (!token) { setStoreOpen(!next); setToggling(false); return; }
            const res = await fetch('/api/sites/toggle-live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ siteId, is_live: next }),
            });
            if (!res.ok) {
                console.error('Failed to update store status:', await res.text());
                setStoreOpen(!next);
            }
        } catch (err) {
            console.error('Failed to update store status:', err);
            setStoreOpen(!next);
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
                    <Link
                        href="/manage/subscription"
                        className="shrink-0 flex items-center gap-1.5 text-white hover:opacity-90 transition-opacity"
                        style={{ background: '#DC2626', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
                    >
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
                            {storeOpen
                                ? (isPayEat ? 'Open & Accepting Orders' : 'Open, users can view now')
                                : 'Closed'}
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

            {/* Insights */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 17 }}>Insights</h2>
            </div>

            <div className="flex flex-col items-center justify-center text-center mb-6 md:mb-8" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '36px 24px', background: '#FAFAFA' }}>
                <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: '50%', background: '#EEEEFF', marginBottom: 16 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#5137EF' }}>bar_chart</span>
                </div>
                <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 16, marginBottom: 6 }}>Insights — Coming Soon</p>
                <p className="text-[#71717A]" style={{ fontSize: 13, maxWidth: 320 }}>
                    Sales analytics and order insights are available on the Pay-Eat plan.
                </p>
            </div>

            {/* Live Orders heading */}
            <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 17 }}>Live Orders</h2>
                {isPayEat && <Link href="/manage/orders" style={{ fontSize: 13, fontWeight: 500, color: '#5137EF', textDecoration: 'none' }}>View All</Link>}
            </div>

            {/* QR Menu plan — Coming Soon */}
            {!isPayEat && (
                <div className="flex flex-col items-center justify-center text-center" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '48px 24px', background: '#FAFAFA' }}>
                    <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: '50%', background: '#EEEEFF', marginBottom: 16 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#5137EF' }}>lock</span>
                    </div>
                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 16, marginBottom: 6 }}>Live Orders — Coming Soon</p>
                    <p className="text-[#71717A]" style={{ fontSize: 13, marginBottom: 20, maxWidth: 320 }}>
                        Real-time order management is available on the Pay-Eat plan. Upgrade to start accepting and tracking orders.
                    </p>
                    <Link href="/manage/subscription" className="flex items-center gap-1.5 text-white hover:opacity-90 transition-opacity" style={{ background: '#5137EF', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_upward</span>
                        Upgrade Plan
                    </Link>
                </div>
            )}

            {/* Pay-Eat plan — empty state until real orders are wired up */}
            {isPayEat && (
                <div className="flex flex-col items-center justify-center text-center" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '48px 24px', background: '#FAFAFA' }}>
                    <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: '50%', background: '#EEEEFF', marginBottom: 16 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#5137EF' }}>receipt_long</span>
                    </div>
                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 16, marginBottom: 6 }}>No orders yet</p>
                    <p className="text-[#71717A]" style={{ fontSize: 13, maxWidth: 320 }}>
                        Orders placed by your customers will appear here in real time.
                    </p>
                </div>
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

    // After creating a new store via onboarding, refresh the site list and show a banner
    useEffect(() => {
        const onboarded = searchParams.get('onboarded');
        const items = searchParams.get('items');
        if (onboarded === 'true') {
            setShowBanner(true);
            setItemCount(Number(items ?? 0));
            refreshSites(); // pick up the newly created store
            window.history.replaceState({}, '', '/manage/dashboard');
        }
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
                            <a
                                href={`/shop/${siteSlug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
                            >
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
