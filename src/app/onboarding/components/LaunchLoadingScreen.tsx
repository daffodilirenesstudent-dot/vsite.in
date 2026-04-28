'use client';

import { useEffect, useRef, useState } from 'react';

const MESSAGES = [
  { text: 'Analyzing menu…',           icon: 'manage_search' },
  { text: 'Getting ready to publish…', icon: 'cloud_upload'  },
  { text: 'Menu engineering…',         icon: 'auto_awesome'  },
  { text: 'Almost done.',              icon: 'pending'        },
];

const STEP_MS = 2500;
const LAST_IDX = MESSAGES.length - 1;

interface LaunchLoadingScreenProps {
  show: boolean;
  done: boolean;
  itemCount: number;
  onRedirect: () => void;
}

export default function LaunchLoadingScreen({
  show,
  done,
  itemCount,
  onRedirect,
}: LaunchLoadingScreenProps) {
  const [msgIdx, setMsgIdx]       = useState(0);
  const [success, setSuccess]     = useState(false);
  const [fadeMsg, setFadeMsg]     = useState(true);

  const doneRef    = useRef(done);
  const msgIdxRef  = useRef(0);
  const successRef = useRef(false);

  doneRef.current = done;

  const onRedirectRef = useRef(onRedirect);
  onRedirectRef.current = onRedirect;

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

  // Redirect after success animation
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => onRedirectRef.current(), 1800);
    return () => clearTimeout(t);
  }, [success]);

  if (!show) return null;

  const msg = MESSAGES[msgIdx];

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
        <div className="flex flex-col items-center gap-5 text-center transition-all duration-500 ease-out opacity-100 translate-y-0">
          {/* Success circle */}
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <span className="material-symbols-outlined text-emerald-600" style={{ fontSize: 40 }}>
              check_circle
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-800">You're live!</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              {itemCount > 0
                ? `${itemCount} menu item${itemCount !== 1 ? 's' : ''} published successfully.`
                : 'Your store is ready. Add items from the dashboard.'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>rocket_launch</span>
            <span className="text-xs font-semibold text-primary">Redirecting to dashboard…</span>
          </div>
        </div>
      )}
    </div>
  );
}
