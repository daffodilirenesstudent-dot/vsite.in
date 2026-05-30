'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * ScanningOverlay — the menu-scan wait, turned into a confidence moment.
 *
 * Extraction is a single batched model call (all photos in, all items back at
 * once), so we can't show a real running count mid-scan. Instead:
 *   • while scanning → an animated scan + rotating messages + a community trust
 *     band, so the wait feels productive and trustworthy;
 *   • the instant the real items arrive (itemCount !== null) → a fast, honest
 *     count-up to the TRUE number, then onCountUpDone() hands back to the parent
 *     to slide forward.
 */

const SCAN_MESSAGES = [
  'Reading your menu…',
  'Finding your dishes…',
  'Detecting prices…',
  'Organizing your menu…',
];

// Owner-provided, approved social-proof figures. One place to update later.
// Icons are Material Symbols (consistent with the rest of the app) — cleaner
// and more professional than emoji.
const TRUST_STATS = [
  { icon: 'restaurant', value: 50, label: 'restaurants' },
  { icon: 'local_cafe', value: 20, label: 'cafés' },
  { icon: 'storefront', value: 70, label: 'shops' },
];

interface ScanningOverlayProps {
  show: boolean;
  /** null while scanning; the real item count once extraction resolves. */
  itemCount: number | null;
  /** Fired after the "Found N items" count-up finishes. */
  onCountUpDone: () => void;
}

/** Animate a number from 0 → target over `durationMs` using rAF. */
function useCountUp(target: number, active: boolean, durationMs = 800): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) { setVal(0); return; }
    if (target <= 0) { setVal(0); return; }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setVal(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durationMs]);
  return val;
}

export default function ScanningOverlay({ show, itemCount, onCountUpDone }: ScanningOverlayProps) {
  const found = itemCount !== null;
  const [msgIdx, setMsgIdx] = useState(0);

  // Rotate scanning messages while we're still waiting.
  useEffect(() => {
    if (!show || found) return;
    const id = setInterval(() => setMsgIdx(i => (i + 1) % SCAN_MESSAGES.length), 1700);
    return () => clearInterval(id);
  }, [show, found]);

  // Count-up of the real item total, then hand back to the parent.
  const counted = useCountUp(itemCount ?? 0, found, 800);
  const doneRef = useRef(onCountUpDone);
  doneRef.current = onCountUpDone;
  useEffect(() => {
    if (!found) return;
    // 800ms count-up + ~700ms to savour the final number.
    const t = setTimeout(() => doneRef.current(), 1500);
    return () => clearTimeout(t);
  }, [found]);

  // Trust-band figures count up once on mount.
  const trustActive = show && !found;

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm px-6">
      <style dangerouslySetInnerHTML={{ __html: SCAN_CSS }} />

      {!found ? (
        <div className="flex flex-col items-center gap-7 text-center">
          {/* Scan visual — a menu card with a sweeping scan line */}
          <div className="scan-card" aria-hidden>
            <div className="scan-lines">
              <span style={{ width: '70%' }} />
              <span style={{ width: '90%' }} />
              <span style={{ width: '55%' }} />
              <span style={{ width: '80%' }} />
              <span style={{ width: '40%' }} />
            </div>
            <div className="scan-beam" />
          </div>

          {/* Rotating message */}
          <div className="h-7 overflow-hidden">
            <p key={msgIdx} className="scan-msg text-lg font-semibold text-slate-800">
              {SCAN_MESSAGES[msgIdx]}
            </p>
          </div>

          {/* Community trust band — wraps on narrow phones so chips never overflow */}
          <div className="flex flex-col items-center gap-2.5">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {TRUST_STATS.map((s, i) => (
                <TrustChip key={s.label} icon={s.icon} value={s.value} label={s.label} active={trustActive} delay={i * 120} />
              ))}
            </div>
            <p className="text-xs text-slate-400">— and many more growing with vsite</p>
          </div>
        </div>
      ) : (
        <div className="scan-found flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 34 }}>auto_awesome</span>
          </div>
          <p className="text-5xl font-extrabold tracking-tight text-slate-900 tabular-nums">{counted}</p>
          <p className="text-base font-semibold text-slate-700">
            {itemCount === 1 ? 'item found on your menu ✨' : 'items found on your menu ✨'}
          </p>
        </div>
      )}
    </div>
  );
}

function TrustChip({ icon, value, label, active, delay }: { icon: string; value: number; label: string; active: boolean; delay: number }) {
  const n = useCountUp(value, active, 900);
  return (
    <div
      className="trust-chip flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>{icon}</span>
      <span className="text-sm font-bold text-slate-800 tabular-nums">{n}+</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

const SCAN_CSS = `
  @keyframes scanBeam {
    0%   { top: 6%;  opacity: 0; }
    15%  { opacity: 1; }
    85%  { opacity: 1; }
    100% { top: 90%; opacity: 0; }
  }
  @keyframes scanMsgIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes trustChipIn {
    from { opacity: 0; transform: translateY(8px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes scanFoundIn {
    from { opacity: 0; transform: scale(0.9); }
    to   { opacity: 1; transform: scale(1); }
  }
  .scan-card {
    position: relative; width: 132px; height: 156px; border-radius: 16px;
    background: #fff; border: 1px solid #E7E5F5;
    box-shadow: 0 12px 30px rgba(84,82,246,0.14); overflow: hidden;
    padding: 20px 18px;
  }
  .scan-lines { display: flex; flex-direction: column; gap: 12px; }
  .scan-lines span { display: block; height: 9px; border-radius: 5px; background: #EEEDFB; }
  .scan-beam {
    position: absolute; left: 0; right: 0; height: 28px;
    background: linear-gradient(180deg, rgba(84,82,246,0) 0%, rgba(84,82,246,0.20) 50%, rgba(84,82,246,0) 100%);
    border-top: 2px solid #5452F6; border-bottom: 2px solid rgba(84,82,246,0.4);
    animation: scanBeam 1.9s cubic-bezier(0.45,0,0.55,1) infinite;
  }
  .scan-msg   { animation: scanMsgIn 0.4s ease both; }
  .trust-chip { animation: trustChipIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  .scan-found { animation: scanFoundIn 0.45s cubic-bezier(0.34,1.4,0.64,1) both; }
  @media (prefers-reduced-motion: reduce) {
    .scan-beam, .scan-msg, .trust-chip, .scan-found { animation: none !important; }
    .scan-beam { display: none; }
  }
`;
