'use client';

import React from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useSite } from './SiteContext';

/**
 * StoreSetupGuide — post-onboarding "get your store ready" welcome banner +
 * checklist, shown on the dashboard.
 *
 * Design intent (the top-SaaS playbook — Stripe/Shopify setup guides):
 *  - A checklist, never a blocking wizard. The owner can ignore it and explore.
 *  - Steps AUTO-VERIFY from real data (logo uploaded? product added? etc.) so
 *    there's no manual "mark done" busywork, and they re-check when the owner
 *    returns to the tab after doing one elsewhere.
 *  - Plan-aware: the "Connect payments" step only exists for pay-and-eat.
 *  - Calm micro-interactions: the progress bar eases, the checkmark pops when a
 *    step flips to done, and there's a single small confetti burst at 100% —
 *    then the card retires itself (persisted) so it never nags again.
 *  - Dismissible + collapsible, both remembered in localStorage.
 */

// ── Brand / design tokens (match the dashboard) ──────────────────────────────
const PURPLE = '#5137EF';
const PURPLE_LIGHT = '#EEEEFF';
const GREEN = '#16A34A';
const INK = '#0A0A0A';
const MUTED = '#71717A';
const BORDER = '#E4E4E7';

interface Step {
  id: string;
  label: string;
  desc: string;
  icon: string;
  done: boolean;
  href?: string;
  /** For the "go live" step, which is an action on this page, not a link. */
  onAction?: () => void;
  cta: string;
}

export default function StoreSetupGuide({
  siteId,
  isPayEat,
  storeOpen,
  onGoLive,
}: {
  siteId: string;
  isPayEat: boolean;
  storeOpen: boolean;
  onGoLive: () => void;
}) {
  const { activeSite } = useSite();
  const storeName = activeSite?.name?.trim() || 'there';
  const hasLogo = !!activeSite?.image_url;

  // Per-site keys so multi-store owners get independent setup state.
  // K_DISMISS lives in sessionStorage (NOT localStorage): the ✕ only hides the
  // guide for the current session, so an accidental click is harmless — it
  // reappears on the next visit and keeps showing until setup is complete.
  // K_DONE lives in localStorage and is the only thing that retires it for good.
  // NOTE: bump the `v2` version suffix whenever the step set or completion
  // criteria change — it invalidates stale done/seen/dismiss flags so a guide
  // that previously (incorrectly) read as complete re-evaluates against the new
  // rules instead of staying retired.
  const K_DISMISS = `bys_setup_dismissed_v2_${siteId}`;
  const K_DONE = `bys_setup_done_v2_${siteId}`;
  const K_COLLAPSE = `bys_setup_collapsed_v2_${siteId}`;
  const K_QR = `bys_qr_downloaded_${siteId}`;
  // K_SEEN is set the first time the owner sees the guide while INCOMPLETE — it
  // lets us celebrate when they return having finished the last step elsewhere
  // (the component remounts on navigation, losing the in-memory baseline) while
  // still retiring a pre-complete store silently.
  const K_SEEN = `bys_setup_seen_v2_${siteId}`;

  // `mounted` gates the first paint behind a client-side localStorage read so a
  // dismissed/completed card never flashes in before being hidden. SSR and the
  // first client render both return null → no hydration mismatch.
  const [mounted, setMounted] = React.useState(false);
  const [hidden, setHidden] = React.useState(true);
  const [collapsed, setCollapsed] = React.useState(false);
  // `ready` flips true only after the first verify() resolves. The card stays
  // hidden until then, so we never flash a 0-of-N state or capture a false
  // completion baseline (which would mis-fire the celebration).
  const [ready, setReady] = React.useState(false);

  // "Store details" done = the owner has actually filled the Settings form.
  // We key off phone + opening hours, NOT description — onboarding auto-sets a
  // placeholder description (`"<shop> digital menu"`) on every store, so checking
  // description would always read as done even when nothing was entered.
  const [hasStoreDetails, setHasStoreDetails] = React.useState(false);
  const [productCount, setProductCount] = React.useState(0);
  const [bannerCount, setBannerCount] = React.useState(0);
  const [paymentsConnected, setPaymentsConnected] = React.useState(false);
  const [qrDownloaded, setQrDownloaded] = React.useState(false);

  const [celebrating, setCelebrating] = React.useState(false);
  const prevAllDoneRef = React.useRef<boolean | null>(null);

  // ── Auto-verification: pull the live facts each step depends on ────────────
  const verify = React.useCallback(async () => {
    if (!siteId) return;
    try {
      const [{ data: site }, { count: prodCount }, { count: bannerCnt }] = await Promise.all([
        supabase.from('sites').select('contact_number, timing').eq('id', siteId).single(),
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('site_id', siteId),
        supabase
          .from('banners')
          .select('id', { count: 'exact', head: true })
          .eq('site_id', siteId),
      ]);
      setHasStoreDetails(!!site?.contact_number?.trim() && !!site?.timing?.trim());
      setProductCount(prodCount ?? 0);
      setBannerCount(bannerCnt ?? 0);
    } catch {
      /* fail-open: leave steps unchecked rather than crash the dashboard */
    }

    if (isPayEat) {
      try {
        const r = await fetch(
          `/api/shop/payment-options?siteId=${encodeURIComponent(siteId)}`,
        );
        const d = r.ok ? await r.json() : { onlineEnabled: false };
        setPaymentsConnected(!!d.onlineEnabled);
      } catch {
        /* leave unchecked */
      }
    }
    // Always mark ready — even on a failed fetch we fail-open and reveal the
    // card with steps left unchecked rather than hiding it forever.
    setReady(true);
  }, [siteId, isPayEat]);

  // First mount: read persisted state, then verify. The card is NOT revealed
  // here — reveal is deferred to the completion effect once verify() resolves,
  // so we never flash an unverified state.
  React.useEffect(() => {
    setMounted(true);
    let skip = false;
    try {
      if (sessionStorage.getItem(K_DISMISS) === '1' || localStorage.getItem(K_DONE) === '1') {
        skip = true;
      } else {
        setCollapsed(localStorage.getItem(K_COLLAPSE) === '1');
        setQrDownloaded(localStorage.getItem(K_QR) === '1');
      }
    } catch {
      /* localStorage unavailable — fall through and verify anyway */
    }
    if (skip) return;
    void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  // Re-verify when the owner returns to the tab (they may have just added a
  // product or connected payments in another tab) so steps tick live.
  React.useEffect(() => {
    if (hidden) return;
    const onFocus = () => { if (document.visibilityState === 'visible') void verify(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [hidden, verify]);

  // ── Build the step list (plan-aware) ───────────────────────────────────────
  const steps: Step[] = [
    { id: 'details', label: 'Complete your store details', desc: 'Add your phone number & opening hours', icon: 'storefront', done: hasStoreDetails, href: '/manage/settings?tab=store', cta: 'Add details' },
    { id: 'logo', label: 'Upload your logo', desc: 'Show your brand on the menu', icon: 'image', done: hasLogo, href: '/manage/settings?tab=store', cta: 'Upload' },
    { id: 'products', label: 'Add your first product', desc: 'Start building your menu', icon: 'lunch_dining', done: productCount > 0, href: '/manage/product-inventory', cta: 'Add product' },
    { id: 'banner', label: 'Add a banner', desc: 'Promote offers on your menu', icon: 'wallpaper', done: bannerCount > 0, href: '/manage/banner-management', cta: 'Add banner' },
    ...(isPayEat
      ? [{ id: 'payments', label: 'Connect payments', desc: 'Accept online payments', icon: 'payments', done: paymentsConnected, href: '/manage/settings?tab=payments', cta: 'Connect' } as Step]
      : []),
    { id: 'qr', label: 'Download your QR & poster', desc: 'Put it on your tables', icon: 'qr_code_2', done: qrDownloaded, href: '/manage/qr', cta: 'Get QR' },
    { id: 'golive', label: 'Open your store', desc: 'Go live for customers', icon: 'rocket_launch', done: storeOpen, onAction: onGoLive, cta: 'Go live' },
  ];

  const total = steps.length;
  const doneCount = steps.filter(s => s.done).length;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = doneCount === total;

  // ── Reveal + completion handling ────────────────────────────────────────────
  // Runs only once verify() has resolved (`ready`).
  //
  // Two ways the celebration fires:
  //  1. In-session: a step flips done while the card is open (e.g. "Go live").
  //  2. On return: the last step was completed on another page (finish profile,
  //     download QR) and the owner comes back to the dashboard. The component
  //     remounted, so we detect it via the persisted K_SEEN flag — they'd seen
  //     the guide incomplete, and now it's complete → celebrate.
  //
  // A store that was already complete the very first time the guide loaded
  // (K_SEEN never set) is retired silently — no surprise confetti.
  const celebrate = React.useCallback(() => {
    prevAllDoneRef.current = true;        // guard against re-firing
    setHidden(false);                     // ensure the card is visible to show it
    setCelebrating(true);
    try {
      localStorage.setItem(K_DONE, '1');
      sessionStorage.removeItem(K_DISMISS);
    } catch { /* quota */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [K_DONE, K_DISMISS]);

  React.useEffect(() => {
    if (!ready) return;

    if (prevAllDoneRef.current === null) {
      // First resolved read on this mount — establish baseline from real data.
      prevAllDoneRef.current = allDone;
      if (allDone) {
        let seenIncomplete = false;
        try { seenIncomplete = localStorage.getItem(K_SEEN) === '1'; } catch { /* */ }
        if (seenIncomplete) {
          celebrate();                       // finished the journey → flowers fall
          const t = window.setTimeout(() => setHidden(true), 4200);
          return () => window.clearTimeout(t);
        }
        try { localStorage.setItem(K_DONE, '1'); } catch { /* quota */ }
        setHidden(true);                     // pre-complete store → retire silently
      } else {
        try { localStorage.setItem(K_SEEN, '1'); } catch { /* quota */ }
        setHidden(false);                    // incomplete → show the guide
      }
      return;
    }

    if (!prevAllDoneRef.current && allDone) {
      celebrate();                           // in-session completion
      const t = window.setTimeout(() => setHidden(true), 4200);
      return () => window.clearTimeout(t);
    }
    prevAllDoneRef.current = allDone;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, allDone]);

  const dismiss = () => {
    // sessionStorage → hidden only for this session; returns on next visit
    // until setup is complete.
    try { sessionStorage.setItem(K_DISMISS, '1'); } catch { /* quota */ }
    setHidden(true);
  };
  const toggleCollapse = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem(K_COLLAPSE, next ? '1' : '0'); } catch { /* quota */ }
      return next;
    });
  };
  const markQrDownloaded = () => {
    try { localStorage.setItem(K_QR, '1'); } catch { /* quota */ }
    setQrDownloaded(true);
  };

  if (!mounted || hidden) return null;

  return (
    <div style={{ position: 'relative', marginBottom: 20 }}>
      <style dangerouslySetInnerHTML={{ __html: GUIDE_CSS }} />

      {/* ── WELCOME BANNER ── */}
      <div
        className="bys-setup-enter"
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '14px 14px 0 0',
          padding: '18px 22px',
          background: `linear-gradient(105deg, ${PURPLE} 0%, #6E5BFF 55%, #8B5BFF 100%)`,
          color: '#fff',
        }}
      >
        {/* decorative soft orbs for depth (purely atmospheric) */}
        <span aria-hidden style={{ position: 'absolute', right: -30, top: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
        <span aria-hidden style={{ position: 'absolute', right: 70, bottom: -60, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="material-symbols-outlined bys-setup-wave" style={{ fontSize: 26, fontVariationSettings: "'FILL' 1" }}>waving_hand</span>
          <div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, lineHeight: '24px' }}>
              {celebrating ? `You're all set, ${storeName}! 🎉` : `Welcome, ${storeName}!`}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 13, lineHeight: '19px', color: 'rgba(255,255,255,0.85)' }}>
              {celebrating
                ? 'Your store is ready for customers.'
                : "Let's finish setting up your store — it only takes a few minutes."}
            </p>
          </div>
        </div>
      </div>

      {/* ── CHECKLIST CARD ── */}
      <div style={{ border: `1px solid ${BORDER}`, borderTop: 'none', borderRadius: '0 0 14px 14px', background: '#fff', padding: '16px 20px 8px' }}>
        {/* Header: title · progress count · collapse · dismiss */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: PURPLE }}>checklist</span>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: INK, flex: 1 }}>Get your store ready</p>
          <span style={{ fontSize: 12, fontWeight: 600, color: PURPLE, background: PURPLE_LIGHT, borderRadius: 20, padding: '3px 10px' }}>
            {doneCount} of {total}
          </span>
          <button onClick={toggleCollapse} aria-label={collapsed ? 'Expand' : 'Collapse'} aria-expanded={!collapsed} style={iconBtn}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: MUTED, transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}>expand_more</span>
          </button>
          <button onClick={dismiss} aria-label="Dismiss setup guide" style={iconBtn}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: MUTED }}>close</span>
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, borderRadius: 6, background: PURPLE_LIGHT, overflow: 'hidden', marginBottom: collapsed ? 4 : 14 }}>
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: 6,
              background: `linear-gradient(90deg, ${PURPLE}, #8B5BFF)`,
              transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </div>

        {/* Steps */}
        {!collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {steps.map((step, i) => (
              <div
                key={step.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 0',
                  borderTop: i === 0 ? 'none' : `1px solid #F4F4F5`,
                }}
              >
                {/* Status indicator */}
                {step.done ? (
                  <span
                    key="done"
                    className="bys-setup-check"
                    style={{ width: 26, height: 26, borderRadius: '50%', background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff', fontVariationSettings: "'wght' 700" }}>check</span>
                  </span>
                ) : (
                  <span style={{ width: 26, height: 26, borderRadius: '50%', border: `2px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: MUTED }}>{step.icon}</span>
                  </span>
                )}

                {/* Label */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: step.done ? MUTED : INK, textDecoration: step.done ? 'line-through' : 'none' }}>
                    {step.label}
                  </p>
                  {!step.done && (
                    <p style={{ margin: '1px 0 0', fontSize: 11.5, color: MUTED }}>{step.desc}</p>
                  )}
                </div>

                {/* CTA — only while incomplete */}
                {!step.done && (
                  step.onAction ? (
                    <button onClick={step.onAction} style={ctaStyle}>
                      {step.cta}
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
                    </button>
                  ) : (
                    <Link
                      href={step.href!}
                      onClick={step.id === 'qr' ? markQrDownloaded : undefined}
                      style={{ ...ctaStyle, textDecoration: 'none' }}
                    >
                      {step.cta}
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
                    </Link>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── CELEBRATION (one-shot at 100%): confetti + falling flower petals ── */}
      {celebrating && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 2 }}>
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className="bys-setup-confetti"
              style={{
                position: 'absolute',
                left: c.left,
                top: 6,
                lineHeight: 1,
                fontSize: c.glyph ? 16 : undefined,
                width: c.glyph ? 'auto' : 8,
                height: c.glyph ? 'auto' : 8,
                borderRadius: c.glyph ? 0 : (c.round ? '50%' : 2),
                background: c.glyph ? 'transparent' : c.color,
                ['--rot' as string]: `${c.rot}deg`,
                ['--dx' as string]: `${c.dx}px`,
                ['--fall' as string]: `${c.fall}px`,
                animationDuration: `${c.dur}s`,
                animationDelay: `${c.delay}s`,
              }}
            >{c.glyph}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline style helpers ──────────────────────────────────────────────────────
const iconBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
};
const ctaStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0,
  border: `1px solid ${PURPLE}`, color: PURPLE, background: '#fff',
  borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  whiteSpace: 'nowrap',
};

// Completion celebration — a mix of confetti dots and falling flower/sparkle
// petals ("flowers fall down") that drift the full height of the card.
const PETAL_GLYPHS = ['🌸', '🌼', '🌺', '✨'];
const CONFETTI = Array.from({ length: 26 }).map((_, i) => {
  const isPetal = i % 3 === 0; // ~1/3 are flowers, the rest confetti
  return {
    left: `${4 + (i * 92) / 26 + (i % 4) * 1.5}%`,
    color: ['#5137EF', '#8B5BFF', '#16A34A', '#FFBC11', '#EF59A1'][i % 5],
    glyph: isPetal ? PETAL_GLYPHS[i % PETAL_GLYPHS.length] : null,
    round: i % 2 === 0,
    rot: ((i * 53) % 360) + 180,
    dx: ((i % 7) - 3) * 16,
    fall: 320 + (i % 5) * 32,   // 320–448px → falls across (and past) the card
    dur: 1.8 + (i % 5) * 0.22,  // 1.8–2.66s, varied so it feels natural
    delay: (i % 8) * 0.06,
  };
});

const GUIDE_CSS = `
  @keyframes bysSetupEnter {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes bysSetupCheck {
    0%   { transform: scale(0); }
    60%  { transform: scale(1.18); }
    100% { transform: scale(1); }
  }
  @keyframes bysSetupWave {
    0%, 60%, 100% { transform: rotate(0deg); }
    70% { transform: rotate(14deg); }
    80% { transform: rotate(-8deg); }
    90% { transform: rotate(10deg); }
  }
  @keyframes bysSetupConfetti {
    0%   { opacity: 1; transform: translate(0, 0) rotate(0deg); }
    10%  { opacity: 1; }
    100% { opacity: 0; transform: translate(var(--dx), var(--fall)) rotate(var(--rot)); }
  }
  .bys-setup-enter { animation: bysSetupEnter 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .bys-setup-check { animation: bysSetupCheck 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  .bys-setup-wave  { animation: bysSetupWave 2.6s ease-in-out 0.4s infinite; transform-origin: 70% 70%; display: inline-block; }
  .bys-setup-confetti { animation: bysSetupConfetti 1.5s cubic-bezier(0.4, 0, 0.6, 1) forwards; }
  @media (prefers-reduced-motion: reduce) {
    .bys-setup-enter, .bys-setup-check, .bys-setup-wave, .bys-setup-confetti { animation: none !important; }
  }
`;
