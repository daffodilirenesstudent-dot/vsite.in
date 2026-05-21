'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { CartItem } from './QRMenuTemplate';

// Razorpay Checkout SDK is loaded on demand the first time the customer
// clicks "Click to Pay". Caching it on window prevents a re-download on retry.
// (Type-only — `window.Razorpay` is declared elsewhere in the codebase.)
interface RazorpayCheckoutOptions {
  key:         string;
  order_id:    string;
  amount:      number;
  currency:    string;
  name:        string;
  description: string;
  prefill?:    { name?: string; email?: string; contact?: string };
  notes?:      Record<string, string>;
  theme?:      { color?: string };
  handler:     (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  modal?:      { ondismiss?: () => void };
}

const RAZORPAY_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load',  () => resolve(true),  { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = RAZORPAY_SCRIPT;
    s.async = true;
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

// Generate a stable idempotency key per checkout session so retries / double-taps
// don't create duplicate orders on the server.
function makeIdempotencyKey(): string {
  const cryptoObj = typeof globalThis !== 'undefined'
    ? (globalThis.crypto as Crypto | undefined)
    : undefined;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const C = {
  pink: '#EF59A1',
  dark: '#191919',
  headerBorder: '#CCCCCC',
  border: '#E6E6E6',
  white: '#FFFFFF',
  gray800: '#333333',
  gray500: '#555555',
  gray400: '#8F8F8F',
  inputBg: '#F3F3F3',
  black: '#000000',
};

interface CheckoutScreenProps {
  items: CartItem[];
  siteId: string;
  paymentMethod: 'online' | 'counter' | 'no_payment';
  tableNumber?: number;
  onClose: () => void;
  onOrderPlaced: (orderId: string, orderNumber: string, paymentMethod: 'online' | 'counter' | 'no_payment', counterNumber?: string, tokenNumber?: string) => void;
}

export default function CheckoutScreen({ items, siteId, paymentMethod, tableNumber, onClose, onOrderPlaced }: CheckoutScreenProps) {
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  // Phone is collected only for no_payment (qr_order) — Pay-Eat keeps email.
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showGateway, setShowGateway] = useState(false);

  // Stable across retries — server treats subsequent submits with the same
  // key as replays of the original.
  const idempotencyKeyRef = useRef<string>('');
  if (!idempotencyKeyRef.current) idempotencyKeyRef.current = makeIdempotencyKey();

  const subtotal = Math.round(items.reduce((sum, i) => sum + i.price * i.qty, 0) * 100) / 100;

  // Place the order server-side. For online payments this only *creates* the
  // local + Razorpay order — the customer hasn't paid yet. Returns the order
  // info (and Razorpay handoff fields) so the caller can either finalize
  // (counter / no_payment) or open the Razorpay Checkout modal.
  interface PlaceOrderResult {
    // counter / no_payment branch — order is created immediately
    orderId?:        string;
    orderNumber?:    string;
    counterNumber?:  string;
    tokenNumber?:    string;
    // online branch — no order yet, only a Razorpay handoff
    razorpayOrderId?:     string;
    razorpayKey?:         string;
    amount?:              number;
    deferredFinalization?: boolean;
  }

  async function placeOrder(): Promise<PlaceOrderResult | null> {
    setError('');
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'Idempotency-Key': idempotencyKeyRef.current,
      },
      body: JSON.stringify({
        siteId,
        customerName:  name.trim(),
        customerEmail: paymentMethod === 'no_payment' ? '' : (email.trim() || ''),
        customerPhone: paymentMethod === 'no_payment' ? phone.trim() : '',
        paymentMethod,
        items: items.map(i => ({
          id: i.id,
          qty: i.qty,
          variantSize: i.variantSize,
        })),
        clientRequestId: idempotencyKeyRef.current,
        ...(tableNumber ? { tableNumber } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to place order. Please try again.');
      return null;
    }
    return data as PlaceOrderResult;
  }

  // Counter / no-payment: just place the order and we're done.
  async function submitNonOnlineOrder() {
    setLoading(true);
    try {
      const data = await placeOrder();
      if (!data || !data.orderId || !data.orderNumber) { setLoading(false); return; }
      onOrderPlaced(data.orderId, data.orderNumber, paymentMethod, data.counterNumber, data.tokenNumber);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  }

  // Step 1: validate, then for online show gateway / for counter submit directly
  async function handlePlaceOrder() {
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (paymentMethod === 'no_payment') {
      // Indian phones are 10 digits; allow 7–15 to be safe for international
      // customers. Strip formatting before counting digits.
      const digits = phone.replace(/[^\d]/g, '');
      if (digits.length < 7 || digits.length > 15) {
        setError('Please enter a valid phone number.'); return;
      }
    } else {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError('Please enter a valid email address.'); return;
      }
    }
    setError('');

    if (paymentMethod === 'counter' || paymentMethod === 'no_payment') {
      await submitNonOnlineOrder();
    } else {
      setShowGateway(true);
    }
  }

  // Step 2 (online only): create the order + Razorpay order on the server,
  // then open Razorpay Checkout. On success, verify with our server and
  // hand off to onOrderPlaced.
  async function handleClickToPay() {
    setLoading(true);
    setError('');
    try {
      const sdkReady = await loadRazorpayScript();
      if (!sdkReady || !window.Razorpay) {
        setError('Could not load the payment SDK. Check your connection and try again.');
        setLoading(false);
        return;
      }

      const data = await placeOrder();
      if (!data) { setLoading(false); return; }

      if (!data.razorpayOrderId || !data.razorpayKey || !data.amount) {
        setError('Online payment is unavailable for this store right now.');
        setLoading(false);
        return;
      }

      // NOTE: there's no local orderId yet — the order isn't created until the
      // customer actually pays. /api/orders just returned a Razorpay order id;
      // we open Checkout, and on success /finalize-payment is what creates the
      // real `orders` row and gives us back an order number / token number.
      const RazorpayCtor = window.Razorpay as unknown as new (options: RazorpayCheckoutOptions) => { open: () => void };
      const rzp = new RazorpayCtor({
        key:         data.razorpayKey,
        order_id:    data.razorpayOrderId,
        amount:      data.amount,
        currency:    'INR',
        name:        'Order Payment',
        description: 'Order Payment',
        prefill: { name: name.trim(), email: email.trim() },
        notes:   { site_id: siteId },
        theme:   { color: C.pink },
        handler: async (resp) => {
          try {
            const v = await fetch('/api/orders/finalize-payment', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_order_id:   resp.razorpay_order_id,
                razorpay_signature:  resp.razorpay_signature,
              }),
            });
            const vData = await v.json();
            if (!v.ok) {
              setError(vData.error ?? 'Payment could not be confirmed. Please contact the store.');
              setLoading(false);
              return;
            }
            onOrderPlaced(vData.orderId, vData.orderNumber, 'online', undefined, vData.tokenNumber);
          } catch {
            setError('Could not confirm your payment. Please contact the store with your payment id.');
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            // Customer closed the modal without paying. No order was created;
            // the only DB trace is a short-lived `pending_online_orders` row
            // that a cron cleans up. Nothing reaches the admin panel.
            setLoading(false);
          },
        },
      });
      rzp.open();
    } catch (err) {
      console.error('[CheckoutScreen] razorpay open failed:', err);
      setError('Could not open the payment screen. Please try again.');
      setLoading(false);
    }
  }

  // Suppress unused-warning when an environment doesn't show the gateway screen.
  useEffect(() => { /* mount only */ }, []);

  // ── PAYMENT GATEWAY SCREEN (online only) ─────────────────────────────────
  if (showGateway) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: C.white,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        maxWidth: 560, margin: '0 auto',
        animation: 'qrFadeIn 0.18s ease',
      }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          <h1 style={{
            fontFamily: "'Poppins',sans-serif", fontWeight: 500,
            fontSize: 24, lineHeight: '36px', color: '#000000',
            margin: '0 0 2px', textAlign: 'center',
          }}>Payment</h1>

          <p style={{
            fontFamily: "'Poppins',sans-serif", fontWeight: 400,
            fontSize: 14, lineHeight: '21px', color: '#676767',
            margin: '0 0 8px', textAlign: 'center',
          }}>Secure payment via Razorpay</p>

          <p style={{
            fontFamily: "'Poppins',sans-serif", fontWeight: 600,
            fontSize: 18, color: C.dark,
            margin: '0 0 32px', textAlign: 'center',
          }}>₹{subtotal}</p>

          {error && (
            <p style={{
              fontFamily: "'Manrope',sans-serif", fontSize: 13,
              color: '#FB2C36', marginBottom: 16, textAlign: 'center',
            }}>{error}</p>
          )}

          <button
            onClick={handleClickToPay}
            disabled={loading}
            style={{
              width: 157, height: 46,
              background: loading ? '#F9B8D9' : C.pink,
              border: 'none', borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading ? (
              <div style={{
                width: 20, height: 20,
                border: '2.5px solid rgba(255,255,255,0.4)',
                borderTopColor: '#fff', borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
              }} />
            ) : (
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                fontSize: 18, lineHeight: '27px', color: '#272727',
              }}>Click to Pay</span>
            )}
          </button>

          {!loading && (
            <button
              onClick={() => { setShowGateway(false); setError(''); }}
              style={{
                marginTop: 16, background: 'none', border: 'none',
                fontFamily: "'Poppins',sans-serif", fontSize: 13,
                color: C.gray400, cursor: 'pointer',
              }}
            >
              ← Go back
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 250,
      background: C.white,
      display: 'flex', flexDirection: 'column',
      animation: 'qrFadeIn 0.18s ease',
      maxWidth: 560, margin: '0 auto',
    }}>
      {/* ── HEADER ── */}
      <div style={{
        width: '100%', height: 54, flexShrink: 0,
        background: C.white, borderBottom: `1px solid ${C.headerBorder}`,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px',
      }}>
        <button
          onClick={onClose}
          aria-label="Go back"
          style={{
            width: 24, height: 24, background: 'none', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke={C.dark} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <span style={{
          fontFamily: "'Poppins',sans-serif", fontWeight: 500,
          fontSize: 18, lineHeight: '27px', color: C.gray800,
        }}>Check Out</span>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 16px' }}>
        <h2 style={{
          fontFamily: "'Poppins',sans-serif", fontWeight: 600,
          fontSize: 20, lineHeight: '30px', color: C.gray800,
          margin: '0 0 12px',
        }}>You&apos;re almost done!</h2>

        <p style={{
          fontFamily: "'Manrope',sans-serif", fontWeight: 500,
          fontSize: 12, lineHeight: '18px', color: C.gray400,
          margin: '0 0 32px', maxWidth: 337,
        }}>
          {paymentMethod === 'counter'
            ? 'Enter your name and email so we can send you updates when your order is ready.'
            : paymentMethod === 'no_payment'
            ? 'Enter your name and phone number so we can call you when your order is ready.'
            : 'Enter your name and email to complete your order. We\'ll redirect you to payment.'}
        </p>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            fontFamily: "'Manrope',sans-serif", fontWeight: 500,
            fontSize: 14, lineHeight: '19px', color: C.gray500,
            display: 'block', marginBottom: 8,
          }}>Name</label>
          <div style={{
            width: '100%', height: 45,
            background: C.inputBg, border: `1px solid ${C.border}`,
            borderRadius: 6, display: 'flex', alignItems: 'center', padding: '0 12px',
          }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your name"
              style={{
                width: '100%', height: '100%', border: 'none',
                background: 'transparent', outline: 'none',
                fontFamily: "'Manrope',sans-serif", fontWeight: 600,
                fontSize: 14, lineHeight: '19px', color: C.black,
              }}
            />
          </div>
        </div>

        {/* Phone — no_payment only; the kitchen calls the customer when ready.  */}
        {paymentMethod === 'no_payment' && (
          <div style={{ marginBottom: 32 }}>
            <label style={{
              fontFamily: "'Manrope',sans-serif", fontWeight: 500,
              fontSize: 14, lineHeight: '19px', color: C.gray500,
              display: 'block', marginBottom: 8,
            }}>Phone Number</label>
            <div style={{
              width: '100%', height: 45,
              background: C.inputBg, border: `1px solid ${C.border}`,
              borderRadius: 6, display: 'flex', alignItems: 'center', padding: '0 12px',
            }}>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="e.g. 98765 43210"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                style={{
                  width: '100%', height: '100%', border: 'none',
                  background: 'transparent', outline: 'none',
                  fontFamily: "'Manrope',sans-serif", fontWeight: 600,
                  fontSize: 14, lineHeight: '19px', color: C.black,
                }}
              />
            </div>
          </div>
        )}

        {/* Email — required for online/counter (Pay-Eat). */}
        {paymentMethod !== 'no_payment' && (
          <div style={{ marginBottom: 32 }}>
            <label style={{
              fontFamily: "'Manrope',sans-serif", fontWeight: 500,
              fontSize: 14, lineHeight: '19px', color: C.gray500,
              display: 'block', marginBottom: 8,
            }}>Email Address</label>
            <div style={{
              width: '100%', height: 45,
              background: C.inputBg, border: `1px solid ${C.border}`,
              borderRadius: 6, display: 'flex', alignItems: 'center', padding: '0 12px',
            }}>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email"
                type="email"
                inputMode="email"
                autoComplete="email"
                style={{
                  width: '100%', height: '100%', border: 'none',
                  background: 'transparent', outline: 'none',
                  fontFamily: "'Manrope',sans-serif", fontWeight: 600,
                  fontSize: 14, lineHeight: '19px', color: C.black,
                }}
              />
            </div>
          </div>
        )}

        {error && (
          <p style={{
            fontFamily: "'Manrope',sans-serif", fontSize: 13,
            color: '#FB2C36', marginBottom: 16, textAlign: 'center',
          }}>{error}</p>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <button
          onClick={handlePlaceOrder}
          disabled={loading}
          style={{
            width: '100%', height: 43,
            background: loading ? '#F9B8D9' : C.pink,
            border: 'none', borderRadius: 0, color: C.white,
            fontFamily: "'Poppins',sans-serif", fontWeight: 500,
            fontSize: 16, lineHeight: '24px',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading ? (
            <>
              <div style={{
                width: 18, height: 18,
                border: '2.5px solid rgba(255,255,255,0.4)',
                borderTopColor: '#fff', borderRadius: '50%',
                animation: 'spin 0.7s linear infinite',
              }} />
              {paymentMethod === 'counter' || paymentMethod === 'no_payment' ? 'Placing order…' : 'Processing…'}
            </>
          ) : (
            paymentMethod === 'counter' || paymentMethod === 'no_payment' ? 'Place Order' : 'Proceed to Pay'
          )}
        </button>
      </div>
    </div>
  );
}
