'use client';

import React from 'react';

/**
 * BrandLoader — admin-side branded splash screen.
 *
 * Mounted as a fixed full-screen overlay in the manage shell. It plays the
 * vsite logo-mark assembly + wordmark reveal on every full page load, then
 * fades out and unmounts so the dashboard underneath is revealed.
 *
 * Why an overlay with its own timer (and not a swap inside AuthGate):
 * AuthGate's loading flag clears in ~100-300ms on a warm session, which would
 * hard-cut the animation a third of the way through. We gate the splash on a
 * minimum display duration so the animation always completes, then transition
 * out smoothly. The AuthGate spinner stays underneath as the deep-auth fallback
 * for the rare slow auth resolve.
 *
 * Honest tradeoff: the min-duration adds a touch of perceived latency to a
 * dashboard the owner opens many times a day, so it's kept short (~1s) and the
 * whole thing is skipped for users with reduced-motion preferences.
 */

const BRAND_PURPLE = '#5E17EB';
const WORDMARK_DARK = '#16101F';

// How long the splash stays fully visible before it begins fading out.
// The bar-assembly finishes ~0.96s and the wordmark ~1.0s, so this leaves a
// brief "settled" hold on the complete lockup before the fade-out begins.
const MIN_VISIBLE_MS = 1150;
// Fade-out transition length — must match the CSS transition below.
const FADE_MS = 420;

// Keyframes/animation rules. Rendered via dangerouslySetInnerHTML so React
// doesn't escape the `>` child combinator to `&gt;` on the server while leaving
// it `>` on the client — that mismatch breaks hydration of an inline <style>.
const LOADER_CSS = `
  @keyframes bysBarRise {
    0%   { opacity: 0; transform: translateY(10px) scale(0.82); }
    60%  { opacity: 1; }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes bysWordIn {
    0%   { opacity: 0; transform: translateX(-8px); }
    100% { opacity: 1; transform: translateX(0); }
  }
  @keyframes bysGlow {
    0%, 100% { opacity: 0.35; transform: scale(0.95); }
    50%      { opacity: 0.6;  transform: scale(1.05); }
  }
  @keyframes bysTrack {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(250%); }
  }
  .bys-mark > rect {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: bysBarRise 0.55s cubic-bezier(0.34, 1.3, 0.5, 1) forwards;
  }
  .bys-bar-1 { animation-delay: 0.05s; }
  .bys-bar-2 { animation-delay: 0.17s; }
  .bys-bar-3 { animation-delay: 0.29s; }
  .bys-bar-4 { animation-delay: 0.41s; }
  .bys-word {
    opacity: 0;
    animation: bysWordIn 0.5s cubic-bezier(0.4, 0, 0.2, 1) 0.5s forwards;
  }
  .bys-glow {
    animation: bysGlow 2.4s ease-in-out infinite;
  }
  .bys-track-fill {
    animation: bysTrack 1.15s cubic-bezier(0.65, 0, 0.35, 1) infinite;
  }
`;

export default function BrandLoader() {
  // 'in'   → mounted + fully opaque, animation playing
  // 'out'  → fading out (opacity → 0)
  // 'gone' → unmounted, nothing rendered
  const [phase, setPhase] = React.useState<'in' | 'out' | 'gone'>('in');

  React.useEffect(() => {
    // Honour reduced-motion: skip the splash entirely so we never add latency
    // for users who've asked the OS to minimise animation.
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setPhase('gone');
      return;
    }

    const fadeTimer = window.setTimeout(() => setPhase('out'), MIN_VISIBLE_MS);
    const goneTimer = window.setTimeout(() => setPhase('gone'), MIN_VISIBLE_MS + FADE_MS);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(goneTimer);
    };
  }, []);

  if (phase === 'gone') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading vsite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(120% 90% at 50% 38%, #FBFAFF 0%, #F4F1FE 55%, #EEEBFB 100%)',
        opacity: phase === 'out' ? 0 : 1,
        transition: `opacity ${FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        pointerEvents: phase === 'out' ? 'none' : 'auto',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: LOADER_CSS }} />

      {/* Logo lockup: animated mark + wordmark */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Soft brand glow behind the mark */}
        <div
          className="bys-glow"
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 30,
            top: '50%',
            width: 120,
            height: 120,
            marginTop: -60,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${BRAND_PURPLE}33 0%, transparent 70%)`,
            filter: 'blur(6px)',
            pointerEvents: 'none',
          }}
        />

        {/* ── MARK ── recreated from the vsite brand logo (4 rounded bars) */}
        <svg
          className="bys-mark"
          width="58"
          height="60"
          viewBox="0 0 60 62"
          fill="none"
          aria-hidden="true"
          style={{ position: 'relative' }}
        >
          <rect className="bys-bar-1" x="44" y="0"  width="16" height="62" rx="6" fill={BRAND_PURPLE} />
          <rect className="bys-bar-2" x="28" y="0"  width="12" height="33" rx="5" fill={BRAND_PURPLE} />
          <rect className="bys-bar-3" x="8"  y="22" width="27" height="11" rx="5" fill={BRAND_PURPLE} />
          <rect className="bys-bar-4" x="0"  y="41" width="41" height="11" rx="5" fill={BRAND_PURPLE} />
        </svg>

        {/* ── WORDMARK ── */}
        <span
          className="bys-word"
          style={{
            position: 'relative',
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 800,
            fontSize: 38,
            lineHeight: 1,
            letterSpacing: '0.01em',
            color: WORDMARK_DARK,
          }}
        >
          VSITE
        </span>
      </div>

      {/* Indeterminate progress track — signals ongoing load */}
      <div
        aria-hidden="true"
        style={{
          position: 'relative',
          marginTop: 34,
          width: 132,
          height: 3,
          borderRadius: 3,
          background: '#E4DEF7',
          overflow: 'hidden',
        }}
      >
        <div
          className="bys-track-fill"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '40%',
            height: '100%',
            borderRadius: 3,
            background: `linear-gradient(90deg, transparent, ${BRAND_PURPLE}, transparent)`,
          }}
        />
      </div>
    </div>
  );
}
