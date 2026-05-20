'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { CartItem } from './QRMenuTemplate';

const C = {
  pink: '#EF59A1',
  pinkBg: 'rgba(239,89,161,0.10)',
  dark: '#1A1A2E',
  border: '#E6E6E6',
  white: '#FFFFFF',
  gray500: '#555555',
  gray400: '#8F8F8F',
  amber: '#F59E0B',
  amberBg: '#FFFBEB',
  amberBorder: '#FDE68A',
  amberText: '#92400E',
  green: '#16A34A',
  greenBg: 'rgba(22,163,74,0.08)',
};

interface CounterWaitingScreenProps {
  orderId: string;
  counterNumber: string;
  items: CartItem[];
  subtotal: number;
  onTokenReceived: (tokenNumber: string) => void;
  onCancel?: () => void;
}

const POLL_TIMEOUT_MS = 15 * 60_000;

export default function CounterWaitingScreen({
  orderId, counterNumber, items, subtotal, onTokenReceived, onCancel,
}: CounterWaitingScreenProps) {
  const onTokenReceivedRef = useRef(onTokenReceived);
  onTokenReceivedRef.current = onTokenReceived;

  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let stopped = false;
    const startedAt = Date.now();
    let timeoutId: ReturnType<typeof setTimeout>;

    // Exponential backoff: 2s → 4s → 8s → 12s (cap), with ±20% jitter.
    // Keeps the customer feedback fast on the first few polls (payment just
    // happened), then backs off to avoid thundering-herd at 200+ concurrent
    // users each waiting for counter confirmation.
    let delay = 2_000;
    const MAX_DELAY = 12_000;

    async function poll() {
      if (stopped) return;
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, { cache: 'no-store' });
        if (res.ok) {
          const data: { token_number: string | null; payment_status: string } = await res.json();
          if (data.token_number && data.payment_status === 'paid') {
            if (!stopped) onTokenReceivedRef.current(data.token_number);
            return; // done — no more polling
          }
        }
      } catch {
        // network hiccup — retry at current delay
      }
      // Back off: multiply by 1.5, cap, apply ±20% jitter so concurrent
      // customers don't all fire at the same instant.
      delay = Math.min(delay * 1.5, MAX_DELAY);
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      if (!stopped) timeoutId = setTimeout(poll, delay + jitter);
    }

    // First poll after a short initial delay (payment may have just been confirmed).
    timeoutId = setTimeout(poll, 2_000);
    return () => { stopped = true; clearTimeout(timeoutId); };
  }, [orderId]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 250,
      background: '#FFF8F5',
      display: 'flex', flexDirection: 'column',
      maxWidth: 560, margin: '0 auto',
      animation: 'cwFadeIn 0.22s ease',
      fontFamily: "'Manrope', sans-serif",
    }}>
      <style>{`
        @keyframes cwFadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes cwSpin { to { transform: rotate(360deg) } }
        @keyframes cwGlow {
          0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.22), 0 0 0 8px rgba(245,158,11,0.08); }
          50%      { box-shadow: 0 0 0 10px rgba(245,158,11,0.12), 0 0 0 18px rgba(245,158,11,0.04); }
        }
      `}</style>

      {/* ── SCROLLABLE BODY ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── HERO ── */}
        <div style={{
          padding: '36px 24px 28px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          {/* Counter badge — rectangle */}
          <div style={{
            background: C.white,
            border: `2px solid ${C.amber}`,
            borderRadius: 16,
            padding: '18px 36px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            animation: 'cwGlow 2.4s ease-in-out infinite',
            marginBottom: 24,
            minWidth: 160,
          }}>
            <span style={{
              fontWeight: 600, fontSize: 11, color: C.amber,
              letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4,
            }}>Code</span>
            <span style={{
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 900, fontSize: 42, color: C.amber,
              lineHeight: '48px', letterSpacing: '0.02em',
            }}>{counterNumber}</span>
          </div>

          <h1 style={{
            fontFamily: "'Poppins', sans-serif",
            fontWeight: 800, fontSize: 21, color: C.dark,
            margin: '0 0 10px', textAlign: 'center', lineHeight: '30px',
          }}>
            Reach the counter &amp; pay<br />for order confirmation
          </h1>

          <p style={{
            fontWeight: 500, fontSize: 13, color: C.gray500,
            textAlign: 'center', margin: '0 0 24px',
            maxWidth: 290, lineHeight: '20px',
          }}>
            Show this screen at counter{' '}
            <strong style={{ color: C.dark }}>{counterNumber}</strong>, pay{' '}
            <strong style={{ color: C.dark }}>₹{subtotal}</strong>, and your order
            will be confirmed instantly.
          </p>



          {/* Waiting pill */}
          {!timedOut ? (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 20px',
              background: C.pinkBg,
              borderRadius: 100,
            }}>
              {/* Clock icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={C.pink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span style={{ fontWeight: 700, fontSize: 13, color: C.pink }}>
                Waiting for payment...
              </span>
            </div>
          ) : (
            <div style={{
              padding: '12px 18px',
              background: '#FFF7ED', border: `1px solid #FDBA74`,
              borderRadius: 10, maxWidth: 300, textAlign: 'center',
            }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: C.amberText, margin: '0 0 4px' }}>
                Still waiting?
              </p>
              <p style={{ fontWeight: 400, fontSize: 12, color: C.amberText, margin: 0, lineHeight: '17px' }}>
                Show counter <strong>{counterNumber}</strong> and order ref{' '}
                <strong style={{ fontFamily: 'monospace' }}>
                  {orderId.slice(0, 8).toUpperCase()}
                </strong>{' '}
                to staff for help.
              </p>
              {onCancel && (
                <button
                  onClick={onCancel}
                  style={{
                    marginTop: 10, padding: '6px 16px',
                    background: 'none', border: `1px solid ${C.border}`,
                    borderRadius: 100, cursor: 'pointer',
                    fontWeight: 600, fontSize: 12, color: C.gray500,
                  }}
                >Back to menu</button>
              )}
            </div>
          )}
        </div>

        {/* ── YOUR ITEMS ── */}
        <div style={{ padding: '0 16px 32px' }}>
          {/* Section header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginBottom: 14,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: C.greenBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 01-8 0" />
              </svg>
            </div>
            <span style={{
              fontWeight: 700, fontSize: 12, color: C.gray400,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>Your Items</span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          {/* Item list */}
          <div style={{
            border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
            marginBottom: 12,
          }}>
            {items.map((item, idx) => (
              <div key={`${item.id}-${item.variantSize ?? ''}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px',
                borderBottom: idx < items.length - 1 ? `1px solid ${C.border}` : 'none',
                background: C.white,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {item.image_url && (
                    <img src={item.image_url} alt={item.name}
                      style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 14, color: C.dark, margin: 0 }}>{item.name}</p>
                    <p style={{ fontWeight: 500, fontSize: 12, color: C.gray400, margin: 0 }}>
                      {item.variantSize ? `${item.variantSize} · ` : ''}Qty: {item.qty}
                    </p>
                  </div>
                </div>
                <p style={{
                  fontFamily: "'Poppins', sans-serif",
                  fontWeight: 600, fontSize: 14, color: C.dark, margin: 0, flexShrink: 0,
                }}>₹{item.price * item.qty}</p>
              </div>
            ))}
          </div>

          {/* Total row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: C.white, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '13px 14px', marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: C.greenBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </div>
              <span style={{ fontWeight: 600, fontSize: 14, color: C.gray500 }}>
                Total to pay at counter
              </span>
            </div>
            <span style={{
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 800, fontSize: 17, color: C.green,
            }}>₹{subtotal}</span>
          </div>

          {/* Footer note */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: C.white, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '12px 14px',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: C.greenBg, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            <p style={{ fontWeight: 500, fontSize: 12, color: C.gray500, margin: 0, lineHeight: '17px' }}>
              Your order will be confirmed after successful payment at the counter.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
