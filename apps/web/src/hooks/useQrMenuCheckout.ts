'use client';

import React, { useRef, useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import { usePlan } from '@/components/PlanContext';
import { useSite } from '@/components/SiteContext';
import { firebaseAuth } from '@/lib/auth/firebase';

/**
 * The Smart QR Menu (₹299) checkout — the revenue path's client half.
 *
 * Moved verbatim out of app/manage/subscription/page.tsx so the desktop
 * subscription page and the phone Plan & bills screen run ONE copy:
 *   create-subscription → Razorpay Checkout → verify-payment → poll the plan
 *   (every 2 s, 15 tries) until the store shows active.
 * Nothing about the flow changed in the move. The server routes are untouched;
 * see src/lib/payments/CLAUDE.md before changing anything here.
 */

export type PaymentState = 'idle' | 'creating' | 'activating' | 'slow' | 'success' | 'failed';

declare global {
    interface Window {
        Razorpay: new (options: Record<string, unknown>) => { open(): void };
    }
}

export function loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined' && window.Razorpay) { resolve(true); return; }
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
}

export function useQrMenuCheckout({ onSettled }: {
    /** Runs 2.5 s after success, when the page should close its payment UI. */
    onSettled?: () => void;
} = {}) {
    const { user } = useAuth();
    const { activeSite } = useSite();
    const { refreshPlan } = usePlan();
    const [paymentState, setPaymentState] = useState<PaymentState>('idle');
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onSettledRef = useRef(onSettled);
    onSettledRef.current = onSettled;

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

    const currentExpiryMs = sub?.store_expires_at ? new Date(sub.store_expires_at).getTime() : 0;

    // Detect plan activation during polling — any plan, not just qr_menu.
    React.useEffect(() => {
        const anyActive = isQrMenuActive || isQrOrderingActive || isQrOrderActive;
        if (paymentState === 'activating' && anyActive) {
            stopPolling();
            setPaymentState('success');
            try { localStorage.setItem('subscription_just_activated', '1'); } catch { /* quota */ }
            setTimeout(() => {
                onSettledRef.current?.();
                setPaymentState('idle');
            }, 2500);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isQrMenuActive, isQrOrderingActive, isQrOrderActive, paymentState, currentExpiryMs]);

    // Cleanup on unmount
    React.useEffect(() => () => stopPolling(), []);

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

    return { paymentState, setPaymentState, activate: handleActivate, stopPolling };
}
