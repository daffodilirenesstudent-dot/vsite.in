'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useSite } from './SiteContext';

type Plan = 'qr_menu' | 'base' | 'pro' | 'pay_eat' | string;

interface PlanContextType {
    plan: Plan;
    planLoading: boolean;
    /** true for pro / pay_eat — full feature access */
    isPayEat: boolean;
    /** true for qr_menu / base — limited access */
    isQrMenu: boolean;
    /** true for qr_order — ordering without payment */
    isQrOrder: boolean;
    /** days remaining in trial (0 if expired or no trial) */
    trialDaysLeft: number;
    /** trial window is still open for the active store */
    isTrialActive: boolean;
    /** trial has ended AND no active paid subscription for the active store */
    isTrialExpired: boolean;
    /** active store has a paid subscription with store_expires_at in the future */
    isSubscribed: boolean;
    /** menu can be live: trial active OR subscribed */
    canGoLive: boolean;
    /** re-fetch subscription data — call after a payment completes */
    refreshPlan: () => Promise<void>;
}

const PlanContext = createContext<PlanContextType>({
    plan: 'qr_menu',
    planLoading: true,
    isPayEat: false,
    isQrMenu: true,
    isQrOrder: false,
    trialDaysLeft: 0,
    isTrialActive: false,
    isTrialExpired: false,
    isSubscribed: false,
    canGoLive: false,
    refreshPlan: async () => {},
});

// 7-day free trial from store creation.
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function PlanProvider({ children }: { children: React.ReactNode }) {
    const { activeSite, sitesLoading, refreshSites } = useSite();

    // Refresh every minute so trial/subscription expiry is reflected without a reload
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    // Per-store trial: 14 days from when the store was created
    const siteCreatedMs = activeSite ? new Date(activeSite.created_at).getTime() : 0;
    const trialEndsMs   = siteCreatedMs > 0 ? siteCreatedMs + TRIAL_DURATION_MS : 0;

    // Per-store paid subscription
    const sub           = activeSite?.site_subscriptions ?? null;
    const subEndsMs     = sub?.store_expires_at ? new Date(sub.store_expires_at).getTime() : 0;
    const plan: Plan    = sub?.store_plan ?? 'qr_menu';

    const isTrialActive  = trialEndsMs > now;
    const isSubscribed   = subEndsMs > now;
    const trialDaysLeft  = isTrialActive
        ? Math.ceil((trialEndsMs - now) / (1000 * 60 * 60 * 24))
        : 0;
    const isTrialExpired = !isTrialActive && !isSubscribed;
    const canGoLive      = isTrialActive || isSubscribed;

    const isPayEat = plan === 'pro' || plan === 'pay_eat';
    const isQrMenu = !isPayEat;
    const isQrOrder = plan === 'qr_order';

    // refreshPlan re-fetches sites (which include the nested site_subscriptions join).
    // Returns the underlying promise so callers can await activation reflect.
    const refreshPlan = useCallback(async () => { await refreshSites(); }, [refreshSites]);

    return (
        <PlanContext.Provider value={{
            plan, planLoading: sitesLoading,
            isPayEat, isQrMenu, isQrOrder,
            trialDaysLeft, isTrialActive, isTrialExpired, isSubscribed, canGoLive,
            refreshPlan,
        }}>
            {children}
        </PlanContext.Provider>
    );
}

export function usePlan() {
    return useContext(PlanContext);
}
