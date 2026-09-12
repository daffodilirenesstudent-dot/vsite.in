'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

/**
 * What the owner sees while the store is being created.
 *
 * These used to describe our processing steps — "Menu engineering…" is a term
 * from a business textbook, not something a café owner has ever needed. Each
 * line now names something being done *to their menu*, in words they would use
 * themselves, so the wait reads as work rather than as a stalled screen.
 */
const MESSAGES = [
  { text: 'Saving your dishes…',      icon: 'restaurant_menu' },
  { text: 'Adding your prices…',      icon: 'sell'            },
  { text: 'Building your QR menu…',   icon: 'qr_code_2'       },
  { text: 'Almost ready…',            icon: 'pending'         },
];

const STEP_MS = 2500;
const LAST_IDX = MESSAGES.length - 1;

interface LaunchLoadingScreenProps {
  show: boolean;
  done: boolean;
  itemCount: number;
  /** Live store slug → used for the "View live menu" / "Share" actions. */
  slug: string;
  /** The owner's own business name. Seeing it is the proof that it worked. */
  shopName?: string;
  onRedirect: () => void;
}

export default function LaunchLoadingScreen({
  show,
  done,
  itemCount,
  slug,
  shopName,
  onRedirect,
}: LaunchLoadingScreenProps) {
  const [msgIdx, setMsgIdx]       = useState(0);
  const [success, setSuccess]     = useState(false);
  const [fadeMsg, setFadeMsg]     = useState(true);

  const doneRef    = useRef(done);
  const msgIdxRef  = useRef(0);
  const successRef = useRef(false);

  doneRef.current = done;

  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Reset when overlay is shown
  useEffect(() => {
    if (!show) return;
    setMsgIdx(0);
    setSuccess(false);
    setFadeMsg(true);
    msgIdxRef.current  = 0;
    successRef.current = false;
  }, [show]);

  // Advance messages on timer
  useEffect(() => {
    if (!show || success) return;

    const interval = setInterval(() => {
      const current = msgIdxRef.current;

      // If already at last message AND API is done → trigger success
      if (current === LAST_IDX && doneRef.current) {
        clearInterval(interval);
        if (!successRef.current) {
          successRef.current = true;
          const t = setTimeout(() => setSuccess(true), 600);
          pendingTimers.current.push(t);
        }
        return;
      }

      // Advance to next message (don't go past last)
      if (current < LAST_IDX) {
        const next = current + 1;
        msgIdxRef.current = next;
        setFadeMsg(false);
        const t2 = setTimeout(() => {
          setMsgIdx(next);
          setFadeMsg(true);
        }, 220);
        pendingTimers.current.push(t2);
      }

      // If now at last and API already done
      if (msgIdxRef.current === LAST_IDX && doneRef.current && !successRef.current) {
        clearInterval(interval);
        successRef.current = true;
        const t = setTimeout(() => setSuccess(true), 600);
        pendingTimers.current.push(t);
      }
    }, STEP_MS);

    return () => {
      clearInterval(interval);
      pendingTimers.current.forEach(clearTimeout);
      pendingTimers.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // When API resolves while stuck at last message
  useEffect(() => {
    if (!done || !show || successRef.current) return;
    if (msgIdxRef.current === LAST_IDX) {
      successRef.current = true;
      const t = setTimeout(() => setSuccess(true), 600);
      pendingTimers.current.push(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (!show) return null;

  const msg = MESSAGES[msgIdx];

  // Built client-side only (this screen never renders during SSR), so window is
  // safe. Works in dev (localhost) and prod (vsite.in) alike.
  const liveUrl = slug && typeof window !== 'undefined' ? `${window.location.origin}/shop/${slug}` : '';

  const viewLiveMenu = () => {
    if (liveUrl) window.open(liveUrl, '_blank', 'noopener,noreferrer');
  };

  const shareMenu = async () => {
    if (!liveUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My menu is live!', url: liveUrl });
        return;
      }
    } catch {
      // user cancelled the share sheet, or it failed — fall through to copy
      return;
    }
    try {
      await navigator.clipboard.writeText(liveUrl);
      toast.success('Link copied!');
    } catch {
      /* clipboard blocked — nothing more we can do, stay silent */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm px-6">
      {!success ? (
        <div className="flex flex-col items-center gap-6 text-center">
          {/* Spinning ring */}
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-primary/15" />
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary" />
            <span
              className={`material-symbols-outlined text-primary transition-all duration-[220ms] ${fadeMsg ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}
              style={{ fontSize: 32 }}
            >
              {msg.icon}
            </span>
          </div>

          {/* Message */}
          <p
            className={`text-lg font-semibold text-slate-800 transition-all duration-[220ms] ${fadeMsg ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
          >
            {msg.text}
          </p>

          {/* Step dots */}
          <div className="flex gap-2 mt-1">
            {MESSAGES.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === msgIdx
                    ? 'w-5 h-2 bg-primary'
                    : i < msgIdx
                    ? 'w-2 h-2 bg-primary/40'
                    : 'w-2 h-2 bg-slate-200'
                }`}
              />
            ))}
          </div>

          <p className="text-xs text-slate-400 mt-2">Setting up your store — just a moment</p>
        </div>
      ) : (
        <div className="launch-success relative isolate flex w-full max-w-sm flex-col items-center gap-5 text-center">
          <style dangerouslySetInnerHTML={{ __html: LAUNCH_CSS }} />

          {/* Confetti / flower burst */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-4 z-0 h-0">
            {LAUNCH_CONFETTI.map((c, i) => (
              <span
                key={i}
                className="launch-confetti"
                style={{
                  position: 'absolute',
                  left: c.left,
                  top: 0,
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

          {/* Success circle */}
          <div className="launch-pop relative z-10 flex h-[68px] w-[68px] items-center justify-center rounded-full bg-emerald-50 ring-[3px] ring-emerald-500/25">
            <span className="material-symbols-outlined text-emerald-600" style={{ fontSize: 36, fontVariationSettings: "'wght' 500" }}>
              check
            </span>
          </div>

          {/* One thing to read first: their own name. A café owner who handed
              photos to software ten minutes ago is asking "did it work, and is
              it mine?" — their business name, set large, answers both before
              any sentence about menus can. */}
          <div className="relative z-10 flex flex-col items-center gap-2">
            <h2 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] text-slate-900 [text-wrap:balance]">
              {shopName?.trim() || 'Your menu'} is live
            </h2>

            {/* The count as a fact, not a sentence. A dot-separated pair reads
                as a status line rather than a paragraph the owner has to parse. */}
            <div className="flex items-center gap-2.5 text-[15px] text-slate-500">
              <span className="font-semibold text-slate-700 tabular-nums">
                {itemCount > 0 ? `${itemCount} ${itemCount === 1 ? 'dish' : 'dishes'}` : 'No dishes yet'}
              </span>
              <span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden />
              <span className="flex items-center gap-1.5">
                <span className="live-dot h-[7px] w-[7px] rounded-full bg-emerald-500" aria-hidden />
                Ready to scan
              </span>
            </div>
          </div>

          {/* No card around this. It is one short instruction, and boxing it
              gave it the same weight as the actions below it. */}
          <p className="relative z-10 max-w-[290px] text-[14px] leading-relaxed text-slate-500">
            Put your QR on the tables. Price changes and sold-out dishes reach
            customers instantly.
          </p>

          {/* Actions */}
          <div className="relative z-10 mt-1 flex w-full flex-col gap-2.5">
            {liveUrl && (
              <button
                onClick={viewLiveMenu}
                className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark active:scale-[0.98]"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>open_in_new</span>
                View live menu
              </button>
            )}
            {liveUrl && (
              <button
                onClick={shareMenu}
                className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98]"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>ios_share</span>
                Share your menu
              </button>
            )}
            <button
              onClick={onRedirect}
              className="mt-0.5 flex w-full items-center justify-center gap-1 py-2 text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              Go to dashboard
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Calm celebration — confetti dots + falling flower/sparkle petals.
const LAUNCH_CONFETTI = Array.from({ length: 22 }).map((_, i) => {
  const isPetal = i % 3 === 0;
  return {
    left: `${4 + (i * 92) / 22 + (i % 4) * 1.5}%`,
    color: ['#5452F6', '#8B5BFF', '#16A34A', '#FFBC11', '#EF59A1'][i % 5],
    glyph: isPetal ? ['🌸', '🌼', '🌺', '✨'][i % 4] : null,
    round: i % 2 === 0,
    rot: ((i * 53) % 360) + 180,
    dx: ((i % 7) - 3) * 16,
    fall: 300 + (i % 5) * 30,
    dur: 1.9 + (i % 5) * 0.22,
    delay: (i % 8) * 0.06,
  };
});

const LAUNCH_CSS = `
  @keyframes liveDot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.45; transform: scale(0.82); }
  }
  .live-dot { animation: liveDot 1.8s ease-in-out infinite; }

  @keyframes launchPop {
    0%   { transform: scale(0); }
    60%  { transform: scale(1.15); }
    100% { transform: scale(1); }
  }
  @keyframes launchSuccessIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes launchConfetti {
    0%   { opacity: 1; transform: translate(0,0) rotate(0deg); }
    10%  { opacity: 1; }
    100% { opacity: 0; transform: translate(var(--dx), var(--fall)) rotate(var(--rot)); }
  }
  .launch-success  { animation: launchSuccessIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  .launch-pop      { animation: launchPop 0.5s cubic-bezier(0.34,1.5,0.64,1) both; }
  .launch-confetti { animation: launchConfetti 2s cubic-bezier(0.4,0,0.6,1) forwards; }
  @media (prefers-reduced-motion: reduce) {
    .live-dot { animation: none !important; }
    .launch-success, .launch-pop, .launch-confetti { animation: none !important; }
    .launch-confetti { display: none; }
  }
`;
