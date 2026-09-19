'use client';

import { useEffect, useRef, useState } from 'react';
import type { ScanMessage } from '../scanMessages';

/**
 * ScanningOverlay — the menu-scan wait.
 *
 * Extraction is a single batched model call, so there is no real per-dish
 * progress to report. The screen therefore has one job: make a blind wait feel
 * like work happening to *your* menu, and hand over the true count the moment
 * it lands.
 *
 * The design is one focal object — a menu card whose rows light up under a
 * scanning beam — and nothing competing with it. An earlier version stacked a
 * card, a rotating headline, three stat chips and a caption; four things
 * arguing for attention read as a busy screen, not a confident one.
 */

const SCAN_STEPS = [
  'Reading your menu',
  'Finding your dishes',
  'Picking up prices',
  'Sorting into sections',
];

/** Rows in the mock menu card, as width percentages. */
const CARD_ROWS = [72, 94, 58, 86, 44, 78];

interface ScanningOverlayProps {
  show: boolean;
  /** null while scanning; the real item count once extraction resolves. */
  itemCount: number | null;
  /** Fired after the "N dishes" count-up finishes. */
  onCountUpDone: () => void;
  /**
   * Something the owner should know, in both languages: "you're in the queue"
   * while waiting, or "photo 4 couldn't be read" once the count lands.
   */
  notice?: ScanMessage | null;
}

function Notice({ message }: { message: ScanMessage }) {
  return (
    <div role="status" className="mt-6 max-w-[320px] rounded-xl bg-amber-50 px-4 py-3 text-center">
      <p className="text-[13px] font-medium leading-relaxed text-amber-800">{message.en}</p>
      <p lang="ta" className="mt-1 text-[13px] leading-relaxed text-amber-700">{message.ta}</p>
    </div>
  );
}

/** Animate a number from 0 → target over `durationMs` using rAF. */
function useCountUp(target: number, active: boolean, durationMs = 900): number {
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
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setVal(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, durationMs]);
  return val;
}

export default function ScanningOverlay({ show, itemCount, onCountUpDone, notice }: ScanningOverlayProps) {
  const found = itemCount !== null;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!show || found) return;
    const id = setInterval(() => setStep(i => (i + 1) % SCAN_STEPS.length), 1800);
    return () => clearInterval(id);
  }, [show, found]);

  const counted = useCountUp(itemCount ?? 0, found);
  const doneRef = useRef(onCountUpDone);
  doneRef.current = onCountUpDone;
  // A notice about unread photos needs time to be read before we move on.
  const hasNotice = Boolean(notice);
  useEffect(() => {
    if (!found) return;
    const t = setTimeout(() => doneRef.current(), hasNotice ? 5000 : 1600);
    return () => clearTimeout(t);
  }, [found, hasNotice]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white px-6">
      <style dangerouslySetInnerHTML={{ __html: SCAN_CSS }} />

      {!found ? (
        <div className="flex w-full max-w-[320px] flex-col items-center">
          {/* The one focal object: a menu being read. */}
          <div className="scan-stage" aria-hidden>
            <div className="scan-card">
              {CARD_ROWS.map((w, i) => (
                <span key={i} className="scan-row" style={{ width: `${w}%`, animationDelay: `${i * 0.18}s` }} />
              ))}
              <div className="scan-beam" />
            </div>
          </div>

          {/* Status, set large enough to be the second thing you read. */}
          <div className="mt-9 h-8 overflow-hidden">
            <p key={step} className="scan-step text-[21px] font-bold tracking-[-0.01em] text-slate-900">
              {SCAN_STEPS[step]}
            </p>
          </div>

          {/* A bounded-feeling track. Indeterminate, because the work genuinely
              is — pretending to know a percentage would be a lie the owner
              could catch when it stalls at 90%. */}
          <div className="mt-5 h-[3px] w-32 overflow-hidden rounded-full bg-slate-100">
            <div className="scan-track h-full w-1/2 rounded-full bg-primary" />
          </div>

          {notice ? <Notice message={notice} /> : (
            <p className="mt-7 text-[13px] leading-relaxed text-slate-400">
              Nothing is published until you check it
            </p>
          )}
        </div>
      ) : (
        <div className="scan-found flex flex-col items-center text-center">
          <p className="text-[64px] font-extrabold leading-none tracking-[-0.03em] text-slate-900 tabular-nums">
            {counted}
          </p>
          <p className="mt-3 text-[17px] font-semibold text-slate-700">
            {itemCount === 1 ? 'dish found on your menu' : 'dishes found on your menu'}
          </p>
          {notice && <Notice message={notice} />}
        </div>
      )}
    </div>
  );
}

const SCAN_CSS = `
  @keyframes scanBeam {
    0%   { transform: translateY(-14px); opacity: 0; }
    12%  { opacity: 1; }
    88%  { opacity: 1; }
    100% { transform: translateY(216px); opacity: 0; }
  }
  @keyframes scanRowLit {
    0%, 100% { background: #EDEBFA; }
    50%      { background: #C9C3F7; }
  }
  @keyframes scanStepIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes scanTrack {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
  @keyframes scanFoundIn {
    from { opacity: 0; transform: scale(0.88); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes stageFloat {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-6px); }
  }

  /* A soft bloom behind the card so it reads as lit rather than pasted on. */
  .scan-stage {
    position: relative;
    animation: stageFloat 4s ease-in-out infinite;
  }
  .scan-stage::before {
    content: '';
    position: absolute; inset: -28px -22px;
    background: radial-gradient(60% 50% at 50% 45%, rgba(84,82,246,0.16), rgba(84,82,246,0) 70%);
  }
  .scan-card {
    position: relative;
    width: 176px; height: 208px;
    display: flex; flex-direction: column; gap: 14px;
    padding: 26px 22px;
    border-radius: 20px;
    background: #fff;
    border: 1px solid #EAE7F8;
    box-shadow: 0 18px 44px -12px rgba(84,82,246,0.28);
    overflow: hidden;
  }
  .scan-row {
    display: block; height: 10px; border-radius: 6px;
    background: #EDEBFA;
    animation: scanRowLit 1.9s ease-in-out infinite;
  }
  .scan-beam {
    position: absolute; left: 0; right: 0; top: 0; height: 40px;
    background: linear-gradient(180deg, rgba(84,82,246,0) 0%, rgba(84,82,246,0.14) 45%, rgba(84,82,246,0) 100%);
    border-bottom: 1.5px solid rgba(84,82,246,0.85);
    animation: scanBeam 1.9s cubic-bezier(0.45,0,0.55,1) infinite;
  }
  .scan-step  { animation: scanStepIn 0.42s cubic-bezier(0.22,1,0.36,1) both; }
  .scan-track { animation: scanTrack 1.4s cubic-bezier(0.65,0,0.35,1) infinite; }
  .scan-found { animation: scanFoundIn 0.5s cubic-bezier(0.34,1.4,0.64,1) both; }

  @media (prefers-reduced-motion: reduce) {
    .scan-stage, .scan-row, .scan-step, .scan-track, .scan-found { animation: none !important; }
    .scan-beam { display: none; }
  }
`;
