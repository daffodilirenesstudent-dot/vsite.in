'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { usePlan } from './PlanContext';
import { useSite } from './SiteContext';

// Mounted once at the manage layout root. Reads the active site's trial /
// subscription state from PlanContext and surfaces four states in priority
// order:
//
//   1. plan_expired       — paid plan ended; store is offline until renewal
//   2. trial_expired      — trial ended and never subscribed
//   3. trial_ending       — trial active, ≤ 3 days left
//   4. plan_ending        — subscription active, ≤ 5 days left
//
// Plus a one-shot success toast after activation, driven by the
// `subscription_just_activated` localStorage flag set by the subscription page.
//
// Banners are dismissible *per session* so a logged-in admin who acknowledges
// them once doesn't see the same banner on every nav change. Dismissal is
// keyed by site + state so a different site or escalation re-shows it.

type BannerState = 'plan_expired' | 'trial_expired' | 'plan_ending' | 'trial_ending';

interface BannerCfg {
  bg:       string;
  border:   string;
  color:    string;
  iconBg:   string;
  iconColor: string;
  icon:     string;
  title:    string;
  body:     string;
  ctaLabel: string;
  dismissible: boolean;
}

export default function SubscriptionNotifications() {
  const { activeSite } = useSite();
  const {
    isTrialActive, trialDaysLeft, isTrialExpired, isSubscribed, planLoading,
  } = usePlan();

  // Days until paid subscription ends (0 if not subscribed)
  const sub = activeSite?.site_subscriptions ?? null;
  const subDaysLeft = useMemo(() => {
    if (!sub?.store_expires_at) return 0;
    const ms = new Date(sub.store_expires_at).getTime() - Date.now();
    return ms > 0 ? Math.ceil(ms / (1000 * 60 * 60 * 24)) : 0;
  }, [sub?.store_expires_at]);

  // Compute the single highest-priority banner state, or null.
  const state: BannerState | null = useMemo(() => {
    if (planLoading || !activeSite) return null;
    if (isTrialExpired) return 'trial_expired';
    if (isSubscribed && subDaysLeft <= 5) return 'plan_ending';
    if (isTrialActive && trialDaysLeft <= 3) return 'trial_ending';
    // plan_expired is the same row as isTrialExpired when there's a prior sub —
    // distinguish: a sub row exists but expiry is in the past.
    if (sub?.store_expires_at && !isSubscribed && !isTrialActive) return 'plan_expired';
    return null;
  }, [planLoading, activeSite, isTrialExpired, isSubscribed, subDaysLeft, isTrialActive, trialDaysLeft, sub?.store_expires_at]);

  // Per-session dismissal keyed by site + state.
  const dismissKey = state && activeSite ? `bys_banner_dismissed:${activeSite.id}:${state}` : null;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!dismissKey) { setDismissed(false); return; }
    try { setDismissed(sessionStorage.getItem(dismissKey) === '1'); }
    catch { setDismissed(false); }
  }, [dismissKey]);

  // One-shot activation success toast. The subscription page sets this flag
  // when verify-payment confirms a paid activation.
  useEffect(() => {
    try {
      if (localStorage.getItem('subscription_just_activated') === '1') {
        toast.success('Subscription activated — your store is live for 30 days.', { duration: 5000 });
        localStorage.removeItem('subscription_just_activated');
      }
    } catch { /* private mode etc. */ }
  }, []);

  if (!state || dismissed) return null;

  const cfg: Record<BannerState, BannerCfg> = {
    plan_expired: {
      bg: '#FEF2F2', border: '#FECACA', color: '#7F1D1D',
      iconBg: '#FEE2E2', iconColor: '#DC2626', icon: 'error',
      title: 'Your plan has expired',
      body: 'Your store is no longer visible to customers. Renew to bring it back online.',
      ctaLabel: 'Renew now',
      dismissible: false,
    },
    trial_expired: {
      bg: '#FEF2F2', border: '#FECACA', color: '#7F1D1D',
      iconBg: '#FEE2E2', iconColor: '#DC2626', icon: 'lock_clock',
      title: 'Your free trial has ended',
      body: 'Pick a plan to keep your store live and unlock all features.',
      ctaLabel: 'Choose a plan',
      dismissible: false,
    },
    plan_ending: {
      bg: '#FFFBEB', border: '#FDE68A', color: '#92400E',
      iconBg: '#FEF3C7', iconColor: '#D97706', icon: 'schedule',
      title: `Your plan ends in ${subDaysLeft} day${subDaysLeft === 1 ? '' : 's'}`,
      body: 'Renew now to avoid any interruption to your customers.',
      ctaLabel: 'Renew',
      dismissible: true,
    },
    trial_ending: {
      bg: '#EFF6FF', border: '#BFDBFE', color: '#1E40AF',
      iconBg: '#DBEAFE', iconColor: '#2563EB', icon: 'hourglass_bottom',
      title: `Free trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'}`,
      body: 'Subscribe now to keep using vsite without interruption.',
      ctaLabel: 'See plans',
      dismissible: true,
    },
  };
  const c = cfg[state];

  const dismiss = () => {
    if (!dismissKey) return;
    try { sessionStorage.setItem(dismissKey, '1'); } catch { /* quota */ }
    setDismissed(true);
  };

  return (
    <div
      role="status"
      style={{
        background: c.bg, border: `1px solid ${c.border}`, color: c.color,
        borderRadius: 12, padding: '12px 16px',
        margin: '0 0 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        fontFamily: 'inherit',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: c.iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: c.iconColor }}>{c.icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, lineHeight: '20px', margin: 0 }}>{c.title}</p>
        <p style={{ fontSize: 13, lineHeight: '18px', margin: '2px 0 0', opacity: 0.85 }}>{c.body}</p>
      </div>
      <Link
        href="/manage/subscription"
        style={{
          flexShrink: 0, padding: '8px 14px', borderRadius: 8,
          background: c.iconColor, color: '#fff',
          fontSize: 13, fontWeight: 600, textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {c.ctaLabel}
      </Link>
      {c.dismissible && (
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            flexShrink: 0, width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: c.color, opacity: 0.6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
        </button>
      )}
    </div>
  );
}
