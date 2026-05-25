'use client';

import React, { useState, useRef } from 'react';
import { useAuth } from '@/components/AuthContext';
import { usePlan } from '@/components/PlanContext';
import { useSite } from '@/components/SiteContext';
import { firebaseAuth } from '@/lib/firebase';

// Per-plan monthly pricing. Keep in sync with create-subscription/route.ts.
// 30-day cycle, no setup fee.
const SETUP_FEE = 0;
const QR_MENU_MONTHLY     = 249;   // Smart QR Menu
const QR_ORDER_MONTHLY    = 749;   // QR Ordering (no payment)
const QR_ORDER_MOCK_PRICE = QR_ORDER_MONTHLY;
const QR_ORDERING_MONTHLY = 849;   // Pay & Eat (with payment)
const QR_ORDERING_MOCK_PRICE = QR_ORDERING_MONTHLY;

type ModalType = 'payment' | 'qr_ordering_payment' | 'qr_order_payment' | 'coming_soon' | null;
type PaymentState = 'idle' | 'creating' | 'activating' | 'slow' | 'success' | 'failed';

const QR_MENU_FEATURES = [
    'Clean digital menu (no printing needed)',
    'AI-generated food images',
    'Edit menu anytime from dashboard',
    'Highlight offers & sold-out items live',
    'Works for dine-in & takeaway',
    'NFC card + QR stickers',
    'Shareable QR code link',
];

const QR_ORDERING_FEATURES = [
    'Everything in Smart QR Menu, plus —',
    'Customers order directly from phone',
    'Accept UPI, GPay, PhonePe & cash',
    'Live kitchen notifications',
    'Automatic billing — no manual work',
    'Smart queue for rush hours',
    'Full transaction history',
];

const QR_ORDER_FEATURES = [
    'Everything in Smart QR Menu, plus —',
    'Customers order directly from phone',
    'No payment step — pay at counter when done',
    'Kitchen gets instant order notifications',
    'Orders accumulate per table until bill requested',
    'One-tap "Request Bill" button for customers',
    'Table-specific QR codes only',
];

declare global {
    interface Window {
        Razorpay: new (options: Record<string, unknown>) => { open(): void };
    }
}

function loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && window.Razorpay) { resolve(true); return; }
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
}

export default function SubscriptionPage() {
    const { user } = useAuth();
    const { activeSite, sitesLoading } = useSite();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { isTrialActive, trialDaysLeft, isTrialExpired, planLoading, refreshPlan, isQrOrder } = usePlan();
    const [modalType, setModalType] = useState<ModalType>(null);
    const [paymentState, setPaymentState] = useState<PaymentState>('idle');
    const [qrOrderingState, setQrOrderingState] = useState<PaymentState>('idle');
    const [qrOrderState, setQrOrderState] = useState<PaymentState>('idle');
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const sub = activeSite?.site_subscriptions ?? null;

    const isQrMenuActive = (() => {
        if (!sub?.store_expires_at) return false;
        return sub.store_plan === 'qr_menu' && new Date(sub.store_expires_at).getTime() > Date.now();
    })();

    const isQrOrderingActive = (() => {
        if (!sub?.store_expires_at) return false;
        return sub.store_plan === 'pay_eat' && new Date(sub.store_expires_at).getTime() > Date.now();
    })();

    const isQrOrderActive = (() => {
        if (!sub?.store_expires_at) return false;
        return sub.store_plan === 'qr_order' && new Date(sub.store_expires_at).getTime() > Date.now();
    })();

    // Was previously a paying customer (store_expires_at was set), plan now expired
    const isPlanExpired = !!sub?.store_expires_at && !isQrMenuActive && !isQrOrderingActive && !isQrOrderActive;
    const isRenewal = isPlanExpired;
    const dueToday = QR_MENU_MONTHLY; // no setup fee

    const expiryLabel = sub?.store_expires_at
        ? new Date(sub.store_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : null;

    const stopPolling = () => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    };

    const startPolling = () => {
        let attempts = 0;
        const MAX_ATTEMPTS = 15; // 30 seconds at 2s intervals

        pollingRef.current = setInterval(async () => {
            attempts += 1;
            await refreshPlan();

            if (attempts >= MAX_ATTEMPTS) {
                stopPolling();
                setPaymentState('slow');
            }
        }, 2000);
    };

    // Detect plan activation during polling — any plan, not just qr_menu.
    React.useEffect(() => {
        const anyActive = isQrMenuActive || isQrOrderingActive || isQrOrderActive;
        if (paymentState === 'activating' && anyActive) {
            stopPolling();
            setPaymentState('success');
            try { localStorage.setItem('subscription_just_activated', '1'); } catch { /* quota */ }
            setTimeout(() => {
                setModalType(null);
                setPaymentState('idle');
            }, 2500);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isQrMenuActive, isQrOrderingActive, isQrOrderActive, paymentState]);

    // Cleanup on unmount
    React.useEffect(() => () => stopPolling(), []);

    const openPayment = () => {
        if (isQrMenuActive || isTrialActive) return;
        setModalType('payment');
        setPaymentState('idle');
        // Preload Razorpay script as soon as the modal opens — by the time the
        // user reads the order summary and clicks Pay, the script is ready.
        loadRazorpayScript();
    };

    const closeModal = () => {
        if (paymentState === 'creating' || paymentState === 'activating') return;
        if (qrOrderingState === 'creating' || qrOrderingState === 'activating') return;
        if (qrOrderState === 'creating') return;
        stopPolling();
        setModalType(null);
        setPaymentState('idle');
        setQrOrderingState('idle');
        setQrOrderState('idle');
    };

    const verifyAndActivate = async (
        response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string },
        token: string,
        siteId: string,
    ) => {
        try {
            const userEmail = firebaseAuth.currentUser?.email ?? '';
            const res = await fetch('/api/subscription/verify-payment', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    ...(userEmail ? { 'X-User-Email': userEmail } : {}),
                },
                body: JSON.stringify({ ...response, siteId }),
            });
            if (res.ok) {
                // Immediately refresh so polling picks up the DB change fast
                await refreshPlan();
            } else {
                const data = await res.json().catch(() => ({}));
                console.error('[subscription] verify-payment failed:', data);
            }
        } catch (err) {
            console.error('[subscription] verifyAndActivate error:', err);
        }
        // Always start polling regardless — catches cases where verify was fast or slow
        startPolling();
    };

    const handleActivate = async () => {
        if (!user || !activeSite || paymentState !== 'idle') return;
        setPaymentState('creating');

        try {
            const firebaseUser = firebaseAuth.currentUser;
            if (!firebaseUser) { setPaymentState('failed'); return; }

            // Kick off script load immediately — it likely started in openPayment
            // already (idempotent), so this resolves instantly on a warm load.
            // Run token fetch in parallel so neither blocks the other.
            const [token, loaded] = await Promise.all([
                firebaseUser.getIdToken(),
                loadRazorpayScript(),
            ]);

            if (!loaded) {
                setPaymentState('failed');
                return;
            }

            const res = await fetch('/api/subscription/create-subscription', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ siteId: activeSite.id, plan: 'qr_menu' }),
            });

            const data = await res.json();

            if (!res.ok) {
                console.error('[subscription] create-subscription failed:', data);
                setPaymentState('failed');
                return;
            }

            const siteId = activeSite.id;

            const rzp = new window.Razorpay({
                key: data.keyId,
                order_id: data.orderId,
                amount: data.amount,
                currency: data.currency,
                name: 'vsite',
                description: 'Smart QR Menu — Monthly',
                prefill: {
                    name: firebaseUser.displayName ?? '',
                    contact: firebaseUser.phoneNumber ?? '',
                },
                theme: { color: '#5452F6' },
                handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
                    setPaymentState('activating');
                    verifyAndActivate(response, token, siteId);
                },
                modal: {
                    ondismiss: () => {
                        setPaymentState((prev) => (prev === 'creating' ? 'idle' : prev));
                    },
                },
            });

            rzp.open();
        } catch (err) {
            console.error('[subscription] handleActivate error:', err);
            setPaymentState('failed');
        }
    };

    // Generic Razorpay activator. All three plans (qr_menu / pay_eat / qr_order)
    // flow through /api/subscription/create-subscription with the chosen plan
    // value, then Razorpay Checkout, then verify-payment.
    const runPaidActivation = async (
        plan: 'pay_eat' | 'qr_order',
        setLocalState: (s: PaymentState) => void,
        planLabel: string,
    ) => {
        if (!user || !activeSite) return;
        setLocalState('creating');
        try {
            const firebaseUser = firebaseAuth.currentUser;
            if (!firebaseUser) { setLocalState('failed'); return; }

            const [token, loaded] = await Promise.all([
                firebaseUser.getIdToken(),
                loadRazorpayScript(),
            ]);
            if (!loaded) { setLocalState('failed'); return; }

            const res = await fetch('/api/subscription/create-subscription', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId: activeSite.id, plan }),
            });
            const data = await res.json();
            if (!res.ok) { console.error(`[subscription] create-subscription (${plan}) failed:`, data); setLocalState('failed'); return; }

            const siteId = activeSite.id;
            const rzp = new window.Razorpay({
                key: data.keyId,
                order_id: data.orderId,
                amount: data.amount,
                currency: data.currency,
                name: 'vsite',
                description: `${planLabel} — Monthly`,
                prefill: { name: firebaseUser.displayName ?? '', contact: firebaseUser.phoneNumber ?? '' },
                theme: { color: '#5452F6' },
                handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
                    setLocalState('activating');
                    try {
                        const userEmail = firebaseAuth.currentUser?.email ?? '';
                        await fetch('/api/subscription/verify-payment', {
                            method: 'POST',
                            headers: {
                                Authorization: `Bearer ${token}`,
                                'Content-Type': 'application/json',
                                ...(userEmail ? { 'X-User-Email': userEmail } : {}),
                            },
                            body: JSON.stringify({ ...response, siteId }),
                        });
                    } catch (err) { console.error('[subscription] verify-payment error:', err); }
                    await refreshPlan();
                    setLocalState('success');
                    try { localStorage.setItem('subscription_just_activated', '1'); } catch { /* quota */ }
                    setTimeout(() => { setModalType(null); setLocalState('idle'); }, 2500);
                },
                modal: { ondismiss: () => setLocalState('idle') },
            });
            rzp.open();
        } catch (err) {
            console.error(`[subscription] runPaidActivation(${plan}) error:`, err);
            setLocalState('failed');
        }
    };

    const handleQrOrderingActivate = () => runPaidActivation('pay_eat',  setQrOrderingState, 'QR Ordering');
    const handleQrOrderActivate    = () => runPaidActivation('qr_order', setQrOrderState,    'QR Order');

    const isDataLoading = sitesLoading || planLoading;
    const isProcessing = paymentState === 'creating' || paymentState === 'activating';
    const isQrOrderingProcessing = qrOrderingState === 'creating' || qrOrderingState === 'activating';

    return (
        <div className="px-4 md:px-8 py-6 md:py-8 max-w-3xl">

            {/* Header */}
            <div className="mb-6">
                <h1 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 30, lineHeight: '36px' }}>
                    Subscription
                </h1>
                <p className="text-[#52525C] mt-1" style={{ fontSize: 16, lineHeight: '24px' }}>
                    Manage your plan
                </p>
            </div>

            {/* Trial / Plan status card */}
            {!isDataLoading && (
                <div
                    style={{
                        borderRadius: 14,
                        padding: '16px 20px',
                        marginBottom: 24,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        background: isTrialExpired
                            ? '#FEF2F2'
                            : (isQrMenuActive || isQrOrderingActive || isQrOrderActive)
                                ? '#F0FDF4'
                                : '#EEF2FF',
                        border: `1px solid ${isTrialExpired ? '#FECACA' : (isQrMenuActive || isQrOrderingActive || isQrOrderActive) ? '#BBF7D0' : '#C7D2FE'}`,
                    }}
                >
                    <div
                        style={{
                            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: isTrialExpired ? '#FEE2E2' : (isQrMenuActive || isQrOrderingActive || isQrOrderActive) ? '#DCFCE7' : '#E0E7FF',
                        }}
                    >
                        <span
                            className="material-symbols-outlined"
                            style={{
                                fontSize: 22,
                                fontVariationSettings: "'FILL' 1",
                                color: isTrialExpired ? '#DC2626' : (isQrMenuActive || isQrOrderingActive || isQrOrderActive) ? '#16A34A' : '#4338CA',
                            }}
                        >
                            {isTrialExpired ? 'error' : (isQrMenuActive || isQrOrderingActive || isQrOrderActive) ? 'verified' : 'schedule'}
                        </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        {isPlanExpired && (
                            <>
                                <p style={{ fontSize: 15, fontWeight: 600, color: '#DC2626' }}>Plan expired</p>
                                <p style={{ fontSize: 13, color: '#7F1D1D', marginTop: 2 }}>
                                    Your menu is offline. Renew your plan below to go live again.
                                </p>
                            </>
                        )}
                        {isTrialExpired && !isPlanExpired && (
                            <>
                                <p style={{ fontSize: 15, fontWeight: 600, color: '#DC2626' }}>Free trial ended</p>
                                <p style={{ fontSize: 13, color: '#7F1D1D', marginTop: 2 }}>
                                    Your menu is offline. Activate a plan below to go live again.
                                </p>
                            </>
                        )}
                        {isTrialActive && !isQrMenuActive && !isQrOrderingActive && !isQrOrderActive && (
                            <>
                                <p style={{ fontSize: 15, fontWeight: 600, color: '#4338CA' }}>
                                    Free trial — {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} remaining
                                </p>
                                <p style={{ fontSize: 13, color: '#3730A3', marginTop: 2 }}>
                                    Activate a plan before your trial ends to keep your menu live.
                                </p>
                            </>
                        )}
                        {isQrMenuActive && (
                            <>
                                <p style={{ fontSize: 15, fontWeight: 600, color: '#166534' }}>Smart QR Menu — Active</p>
                                <p style={{ fontSize: 13, color: '#14532D', marginTop: 2 }}>
                                    {expiryLabel ? `Expires on ${expiryLabel} · Renew to extend` : 'Subscription active'}
                                </p>
                            </>
                        )}
                        {isQrOrderingActive && (
                            <>
                                <p style={{ fontSize: 15, fontWeight: 600, color: '#166534' }}>QR Ordering + Payment — Active</p>
                                <p style={{ fontSize: 13, color: '#14532D', marginTop: 2 }}>
                                    {expiryLabel ? `Expires on ${expiryLabel} · Renew to extend` : 'Subscription active'}
                                </p>
                            </>
                        )}
                        {isQrOrderActive && (
                            <>
                                <p style={{ fontSize: 15, fontWeight: 600, color: '#166534' }}>QR Ordering (No Payment) — Active</p>
                                <p style={{ fontSize: 13, color: '#14532D', marginTop: 2 }}>
                                    {expiryLabel ? `Expires on ${expiryLabel} · Renew to extend` : 'Subscription active'}
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Skeleton */}
            {isDataLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[0, 1].map(i => (
                        <div key={i} className="skeleton" style={{ height: 420, borderRadius: 14 }} />
                    ))}
                </div>
            )}

            {/* Plan cards */}
            {!isDataLoading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                    {/* Smart QR Menu */}
                    <div
                        style={{
                            background: '#FFFFFF',
                            border: isQrMenuActive ? '2px solid #16A34A' : '1px solid #E4E4E7',
                            borderRadius: 16,
                            padding: 24,
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                        }}
                    >
                        {isQrMenuActive && (
                            <div style={{ position: 'absolute', top: -1, right: 16, background: '#16A34A', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: '0 0 8px 8px' }}>
                                ACTIVE
                            </div>
                        )}
                        <div style={{ marginBottom: 16 }}>
                            <span style={{ display: 'inline-block', border: '1px solid #16A34A', color: '#16A34A', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 9999, marginBottom: 12 }}>
                                Smart QR Menu
                            </span>
                            <div className="flex items-baseline gap-1 mb-3">
                                <span style={{ fontSize: 30, fontWeight: 800, color: '#0A0A0A', lineHeight: 1 }}>₹{QR_MENU_MONTHLY}</span>
                                <span style={{ fontSize: 14, color: '#71717A' }}>/month</span>
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: '#047857' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>verified</span>
                                No setup fee · Billed every 30 days
                            </div>
                        </div>
                        <div style={{ flex: 1, marginBottom: 20 }}>
                            {QR_MENU_FEATURES.map(f => (
                                <div key={f} className="flex items-start gap-2" style={{ marginBottom: 9 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#16A34A', flexShrink: 0, marginTop: 1, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                    <span style={{ fontSize: 13, color: '#3F3F46', lineHeight: '18px' }}>{f}</span>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={openPayment}
                            disabled={isQrMenuActive || isTrialActive}
                            style={{
                                width: '100%', height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600,
                                border: (isQrMenuActive || isTrialActive) ? 'none' : '2px solid #16A34A',
                                background: isQrMenuActive ? '#F0FDF4' : isTrialActive ? '#F4F4F5' : 'transparent',
                                color: isQrMenuActive ? '#16A34A' : isTrialActive ? '#71717A' : '#16A34A',
                                cursor: (isQrMenuActive || isTrialActive) ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { if (!isQrMenuActive && !isTrialActive) (e.currentTarget as HTMLButtonElement).style.background = '#F0FDF4'; }}
                            onMouseLeave={e => { if (!isQrMenuActive && !isTrialActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                        >
                            {isQrMenuActive
                                ? 'Current Plan'
                                : isTrialActive
                                    ? `Available after trial (${trialDaysLeft}d left)`
                                    : isPlanExpired
                                        ? `Renew — ₹${QR_MENU_MONTHLY}/mo`
                                        : `Activate — ₹${QR_MENU_MONTHLY}/mo`}
                        </button>
                    </div>

                    {/* QR Ordering — No Payment */}
                    <div
                        style={{
                            background: isQrOrderActive ? '#FFF7ED' : '#FFFFFF',
                            border: isQrOrderActive ? '2px solid #F97316' : '1px solid #E4E4E7',
                            borderRadius: 16,
                            padding: 24,
                            display: 'flex',
                            flexDirection: 'column',
                            position: 'relative',
                        }}
                    >
                        {isQrOrderActive && (
                            <div style={{ position: 'absolute', top: -1, right: 16, background: '#F97316', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: '0 0 8px 8px' }}>
                                ACTIVE
                            </div>
                        )}
                        <div style={{ marginBottom: 16 }}>
                            <span style={{ display: 'inline-block', border: '1px solid #F97316', color: '#EA580C', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 9999, marginBottom: 12 }}>
                                QR Ordering (No Payment)
                            </span>
                            <div className="flex items-baseline gap-1 mb-3">
                                <span style={{ fontSize: 30, fontWeight: 800, color: '#0A0A0A', lineHeight: 1 }}>₹{QR_ORDER_MONTHLY}</span>
                                <span style={{ fontSize: 14, color: '#71717A' }}>/month</span>
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: '#047857' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>verified</span>
                                No setup fee · Billed every 30 days
                            </div>
                        </div>
                        <div style={{ flex: 1, marginBottom: 20 }}>
                            {QR_ORDER_FEATURES.map((f, i) => (
                                <div key={f} className="flex items-start gap-2" style={{ marginBottom: 9 }}>
                                    {i === 0 ? (
                                        <span style={{ fontSize: 13, color: '#EA580C', lineHeight: '18px', fontWeight: 600 }}>{f}</span>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#F97316', flexShrink: 0, marginTop: 1, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                            <span style={{ fontSize: 13, color: '#3F3F46', lineHeight: '18px' }}>{f}</span>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => { if (!isQrOrderActive && !isTrialActive) { setModalType('qr_order_payment'); setQrOrderState('idle'); } }}
                            disabled={isQrOrderActive || isTrialActive}
                            style={{ width: '100%', height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, border: isQrOrderActive ? 'none' : '2px solid #F97316', background: isQrOrderActive ? '#FFF7ED' : isTrialActive ? '#F4F4F5' : 'transparent', color: isQrOrderActive ? '#EA580C' : isTrialActive ? '#71717A' : '#EA580C', cursor: (isQrOrderActive || isTrialActive) ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}
                        >
                            {isQrOrderActive
                                ? 'Current Plan'
                                : isTrialActive
                                    ? `Available after trial (${trialDaysLeft}d left)`
                                    : `Activate — ₹${QR_ORDER_MONTHLY}/mo`}
                        </button>
                    </div>

                    {/* QR Ordering + Payment */}
                    <div style={{ background: 'linear-gradient(145deg, #5137EF 0%, #7C3AED 100%)', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                        {isQrOrderingActive && (
                            <div style={{ position: 'absolute', top: -1, right: 16, background: '#16A34A', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: '0 0 8px 8px' }}>
                                ACTIVE
                            </div>
                        )}
                        <div style={{ marginBottom: 16 }}>
                            <span style={{ display: 'inline-block', border: '1px solid rgba(255,255,255,0.5)', color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 9999, marginBottom: 12 }}>
                                QR Ordering + Payment
                            </span>
                            <div className="flex items-baseline gap-1 mb-3" style={{ marginTop: 4 }}>
                                <span style={{ fontSize: 30, fontWeight: 800, color: '#FFFFFF', lineHeight: 1 }}>₹{QR_ORDERING_MONTHLY}</span>
                                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>/month</span>
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>verified</span>
                                No setup fee · Billed every 30 days
                            </div>
                        </div>
                        <div style={{ flex: 1, marginBottom: 20 }}>
                            {QR_ORDERING_FEATURES.map((f, i) => (
                                <div key={f} className="flex items-start gap-2" style={{ marginBottom: 9 }}>
                                    {i === 0 ? (
                                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: '18px', fontWeight: 600 }}>{f}</span>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)', flexShrink: 0, marginTop: 1, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: '18px' }}>{f}</span>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => { if (!isQrOrderingActive && !isTrialActive) { setModalType('qr_ordering_payment'); setQrOrderingState('idle'); } }}
                            disabled={isQrOrderingActive || isTrialActive}
                            style={{ width: '100%', height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, border: '2px solid rgba(255,255,255,0.4)', background: isQrOrderingActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.15)', color: '#FFFFFF', cursor: (isQrOrderingActive || isTrialActive) ? 'not-allowed' : 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                        >
                            {isQrOrderingActive
                                ? 'Current Plan'
                                : isTrialActive
                                    ? `Available after trial (${trialDaysLeft}d left)`
                                    : `Activate — ₹${QR_ORDERING_MONTHLY}/mo`}
                        </button>
                    </div>
                </div>
            )}

            <p className="mt-5 text-center text-[#71717A]" style={{ fontSize: 12 }}>
                All payments are processed securely by Razorpay. Plans are valid for 30 days. Renew manually.
            </p>

            {/* ── Payment modal ── */}
            {modalType === 'payment' && (
                <div
                    className="fixed inset-0 flex items-end md:items-center justify-center"
                    style={{ zIndex: 80, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
                    onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
                >
                    <div
                        style={{ background: '#FFFFFF', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 460, padding: '28px 24px 36px' }}
                        className="md:rounded-2xl md:mx-4"
                    >
                        {paymentState === 'success' ? (
                            <div className="flex flex-col items-center py-6 gap-4">
                                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#16A34A', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, marginBottom: 6 }}>Plan Activated!</p>
                                    <p className="text-[#52525C]" style={{ fontSize: 14 }}>Your Smart QR Menu is now live for 30 days.</p>
                                </div>
                            </div>
                        ) : paymentState === 'slow' ? (
                            <div className="flex flex-col items-center py-6 gap-4">
                                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEF9C3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#CA8A04', fontVariationSettings: "'FILL' 1" }}>schedule</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, marginBottom: 6 }}>Payment Received</p>
                                    <p className="text-[#52525C]" style={{ fontSize: 14 }}>Your payment was successful. Your plan is activating — this may take a minute. Refresh the page shortly.</p>
                                </div>
                                <button
                                    onClick={() => { setModalType(null); setPaymentState('idle'); }}
                                    style={{ width: '100%', height: 48, borderRadius: 10, fontSize: 15, fontWeight: 600, border: 'none', background: '#0A0A0A', color: '#FFFFFF', cursor: 'pointer' }}
                                >
                                    Got it
                                </button>
                            </div>
                        ) : paymentState === 'failed' ? (
                            <div className="flex flex-col items-center py-6 gap-4">
                                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#DC2626', fontVariationSettings: "'FILL' 1" }}>cancel</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, marginBottom: 6 }}>Something went wrong</p>
                                    <p className="text-[#52525C]" style={{ fontSize: 14 }}>Please try again. If the issue persists, contact support.</p>
                                </div>
                                <button
                                    onClick={() => setPaymentState('idle')}
                                    style={{ width: '100%', height: 48, borderRadius: 10, fontSize: 15, fontWeight: 600, border: 'none', background: '#0A0A0A', color: '#FFFFFF', cursor: 'pointer' }}
                                >
                                    Try Again
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Modal header */}
                                <div className="flex items-start justify-between mb-5">
                                    <div>
                                        <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, lineHeight: '24px' }}>{isRenewal ? 'Renew Smart QR Menu' : 'Activate Smart QR Menu'}</p>
                                        <p className="text-[#52525C]" style={{ fontSize: 13, marginTop: 2 }}>
                                            {activeSite ? <>For store: <span className="font-semibold text-[#0A0A0A]">{activeSite.name}</span></> : 'Review your order'}
                                        </p>
                                    </div>
                                    {!isProcessing && (
                                        <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                                            <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 20 }}>close</span>
                                        </button>
                                    )}
                                </div>

                                {/* Order summary */}
                                <div style={{ background: '#F8F7FF', border: '1px solid #E4E4E7', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
                                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', marginBottom: 12 }}>Smart QR Menu</p>
                                    {!isRenewal && (
                                        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                                            <span style={{ fontSize: 13, color: '#52525C' }}>Setup fee (one-time)</span>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>₹{SETUP_FEE.toLocaleString('en-IN')}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                                        <span style={{ fontSize: 13, color: '#52525C' }}>{isRenewal ? 'Monthly renewal' : 'First month'}</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>₹{QR_MENU_MONTHLY}</span>
                                    </div>
                                    <div style={{ borderTop: '1px dashed #E4E4E7', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>Due today</span>
                                        <span style={{ fontSize: 16, fontWeight: 800, color: '#16A34A' }}>₹{dueToday.toLocaleString('en-IN')}</span>
                                    </div>
                                    <p style={{ fontSize: 11, color: '#71717A', marginTop: 8 }}>
                                        Renew manually each month — no auto-debit.
                                    </p>
                                </div>

                                {/* CTA */}
                                <button
                                    onClick={handleActivate}
                                    disabled={isProcessing}
                                    style={{
                                        width: '100%', height: 52, borderRadius: 10,
                                        fontSize: 15, fontWeight: 700, border: 'none',
                                        background: isProcessing ? '#6B7280' : '#16A34A',
                                        color: '#FFFFFF',
                                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                        transition: 'background 0.15s',
                                    }}
                                >
                                    {isProcessing ? (
                                        <>
                                            <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />
                                            <span>{paymentState === 'activating' ? 'Activating your plan...' : 'Opening checkout...'}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>lock</span>
                                            {isRenewal ? `Pay ₹${dueToday.toLocaleString('en-IN')} & Renew` : `Pay ₹${dueToday.toLocaleString('en-IN')} & Activate`}
                                        </>
                                    )}
                                </button>

                                <div className="flex items-center justify-center gap-2 mt-3">
                                    <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 13 }}>lock</span>
                                    <p style={{ fontSize: 11, color: '#71717A' }}>Secured by Razorpay. UPI, cards & netbanking accepted.</p>
                                </div>

                                {!isProcessing && (
                                    <button
                                        onClick={closeModal}
                                        style={{ width: '100%', height: 40, borderRadius: 10, fontSize: 14, fontWeight: 500, border: '1px solid #E4E4E7', background: '#FFFFFF', color: '#52525C', cursor: 'pointer', marginTop: 8 }}
                                    >
                                        Cancel
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── QR Ordering Payment modal ── */}
            {modalType === 'qr_ordering_payment' && (
                <div
                    className="fixed inset-0 flex items-end md:items-center justify-center"
                    style={{ zIndex: 80, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
                    onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
                >
                    <div
                        style={{ background: '#FFFFFF', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 460, padding: '28px 24px 36px' }}
                        className="md:rounded-2xl md:mx-4"
                    >
                        {qrOrderingState === 'success' ? (
                            <div className="flex flex-col items-center py-6 gap-4">
                                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#16A34A', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, marginBottom: 6 }}>QR Ordering Activated!</p>
                                    <p className="text-[#52525C]" style={{ fontSize: 14 }}>Your QR Ordering + Payment plan is now live for 30 days.</p>
                                </div>
                            </div>
                        ) : qrOrderingState === 'failed' ? (
                            <div className="flex flex-col items-center py-6 gap-4">
                                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#DC2626', fontVariationSettings: "'FILL' 1" }}>cancel</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, marginBottom: 6 }}>Something went wrong</p>
                                    <p className="text-[#52525C]" style={{ fontSize: 14 }}>Please try again. If the issue persists, contact support.</p>
                                </div>
                                <button
                                    onClick={() => setQrOrderingState('idle')}
                                    style={{ width: '100%', height: 48, borderRadius: 10, fontSize: 15, fontWeight: 600, border: 'none', background: '#0A0A0A', color: '#FFFFFF', cursor: 'pointer' }}
                                >
                                    Try Again
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Modal header */}
                                <div className="flex items-start justify-between mb-5">
                                    <div>
                                        <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, lineHeight: '24px' }}>Activate QR Ordering + Payment</p>
                                        <p className="text-[#52525C]" style={{ fontSize: 13, marginTop: 2 }}>
                                            {activeSite ? <>For store: <span className="font-semibold text-[#0A0A0A]">{activeSite.name}</span></> : 'Review your order'}
                                        </p>
                                    </div>
                                    {!isQrOrderingProcessing && (
                                        <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                                            <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 20 }}>close</span>
                                        </button>
                                    )}
                                </div>

                                {/* Order summary */}
                                <div style={{ background: '#F8F7FF', border: '1px solid #E4E4E7', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
                                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', marginBottom: 12 }}>QR Ordering + Payment</p>
                                    <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                                        <span style={{ fontSize: 13, color: '#52525C' }}>Monthly subscription</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>₹{QR_ORDERING_MOCK_PRICE}</span>
                                    </div>
                                    <div style={{ borderTop: '1px dashed #E4E4E7', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>Due today</span>
                                        <span style={{ fontSize: 16, fontWeight: 800, color: '#5137EF' }}>₹{QR_ORDERING_MOCK_PRICE}</span>
                                    </div>
                                    <p style={{ fontSize: 11, color: '#71717A', marginTop: 8 }}>
                                        This is a mock payment for testing. Real pricing (₹{QR_ORDERING_MONTHLY}/mo) applies after launch.
                                    </p>
                                </div>

                                {/* CTA */}
                                <button
                                    onClick={handleQrOrderingActivate}
                                    disabled={isQrOrderingProcessing}
                                    style={{
                                        width: '100%', height: 52, borderRadius: 10,
                                        fontSize: 15, fontWeight: 700, border: 'none',
                                        background: isQrOrderingProcessing ? '#6B7280' : 'linear-gradient(90deg, #5137EF 0%, #7C3AED 100%)',
                                        color: '#FFFFFF',
                                        cursor: isQrOrderingProcessing ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                        transition: 'background 0.15s',
                                    }}
                                >
                                    {isQrOrderingProcessing ? (
                                        <>
                                            <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} />
                                            <span>Activating your plan...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>lock</span>
                                            Pay ₹{QR_ORDERING_MONTHLY} &amp; Activate
                                        </>
                                    )}
                                </button>

                                <div className="flex items-center justify-center gap-2 mt-3">
                                    <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 13 }}>info</span>
                                    <p style={{ fontSize: 11, color: '#71717A' }}>Secured by Razorpay · Plan stays active for 30 days.</p>
                                </div>

                                {!isQrOrderingProcessing && (
                                    <button
                                        onClick={closeModal}
                                        style={{ width: '100%', height: 40, borderRadius: 10, fontSize: 14, fontWeight: 500, border: '1px solid #E4E4E7', background: '#FFFFFF', color: '#52525C', cursor: 'pointer', marginTop: 8 }}
                                    >
                                        Cancel
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── QR Order (No Payment) activation modal ── */}
            {modalType === 'qr_order_payment' && (
                <div
                    className="fixed inset-0 flex items-end md:items-center justify-center"
                    style={{ zIndex: 80, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
                    onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
                >
                    <div
                        style={{ background: '#FFFFFF', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 460, padding: '28px 24px 36px' }}
                        className="md:rounded-2xl md:mx-4"
                    >
                        {qrOrderState === 'success' ? (
                            <div className="flex flex-col items-center py-6 gap-4">
                                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#F97316', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, marginBottom: 6 }}>QR Ordering Activated!</p>
                                    <p className="text-[#52525C]" style={{ fontSize: 14 }}>Your QR Ordering (No Payment) plan is now live for 30 days.</p>
                                </div>
                            </div>
                        ) : qrOrderState === 'failed' ? (
                            <div className="flex flex-col items-center py-6 gap-4">
                                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#DC2626', fontVariationSettings: "'FILL' 1" }}>cancel</span>
                                </div>
                                <div className="text-center">
                                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, marginBottom: 6 }}>Something went wrong</p>
                                    <p className="text-[#52525C]" style={{ fontSize: 14 }}>Please try again.</p>
                                </div>
                                <button onClick={() => setQrOrderState('idle')} style={{ width: '100%', height: 48, borderRadius: 10, fontSize: 15, fontWeight: 600, border: 'none', background: '#0A0A0A', color: '#FFFFFF', cursor: 'pointer' }}>Try Again</button>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-start justify-between mb-5">
                                    <div>
                                        <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, lineHeight: '24px' }}>Activate QR Ordering (No Payment)</p>
                                        <p className="text-[#52525C]" style={{ fontSize: 13, marginTop: 2 }}>
                                            {activeSite ? <>For store: <span className="font-semibold text-[#0A0A0A]">{activeSite.name}</span></> : 'Review your order'}
                                        </p>
                                    </div>
                                    <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                                        <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 20 }}>close</span>
                                    </button>
                                </div>
                                <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
                                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', marginBottom: 12 }}>QR Ordering (No Payment)</p>
                                    <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                                        <span style={{ fontSize: 13, color: '#52525C' }}>Monthly subscription</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>₹{QR_ORDER_MOCK_PRICE}</span>
                                    </div>
                                    <div style={{ borderTop: '1px dashed #FED7AA', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>Due today</span>
                                        <span style={{ fontSize: 16, fontWeight: 800, color: '#F97316' }}>₹{QR_ORDER_MOCK_PRICE}</span>
                                    </div>
                                    <p style={{ fontSize: 11, color: '#92400E', marginTop: 8 }}>
                                        Secured by Razorpay · Plan stays active for 30 days.
                                    </p>
                                </div>
                                <button
                                    onClick={handleQrOrderActivate}
                                    disabled={qrOrderState === 'creating'}
                                    style={{ width: '100%', height: 52, borderRadius: 10, fontSize: 15, fontWeight: 700, border: 'none', background: qrOrderState === 'creating' ? '#6B7280' : '#F97316', color: '#FFFFFF', cursor: qrOrderState === 'creating' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                                >
                                    {qrOrderState === 'creating' ? (
                                        <><span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite', display: 'inline-block', flexShrink: 0 }} /><span>Activating...</span></>
                                    ) : (
                                        <><span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>lock</span>Pay ₹{QR_ORDER_MONTHLY} &amp; Activate</>
                                    )}
                                </button>
                                <div className="flex items-center justify-center gap-2 mt-3">
                                    <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 13 }}>info</span>
                                    <p style={{ fontSize: 11, color: '#71717A' }}>Secured by Razorpay · Plan stays active for 30 days.</p>
                                </div>
                                <button onClick={closeModal} style={{ width: '100%', height: 40, borderRadius: 10, fontSize: 14, fontWeight: 500, border: '1px solid #E4E4E7', background: '#FFFFFF', color: '#52525C', cursor: 'pointer', marginTop: 8 }}>Cancel</button>
                            </>
                        )}
                    </div>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
