'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { CartItem } from './QRMenuTemplate';

const C = {
  white: '#FFFFFF',
  dark: '#171717',
  gray500: '#525252',
  gray400: '#737373',
  border: '#E5E5E5',
  green: '#00A63E',
  greenBg: '#F0FDF4',
  greenBorder: '#BBF7D0',
  tokenBorder: '#FFE2BD',
  pink: '#EF59A1',
  saveBg: '#FFF7ED',
  saveAccent: '#F97316',
  cardBg: '#F5F5F5',
};

interface OrderConfirmedScreenProps {
  orderId: string;
  orderNumber: string;
  shopName: string;
  items: CartItem[];
  subtotal: number;
  paymentMethod: 'online' | 'counter' | 'no_payment';
  tokenNumber?: string;
  tableNumber?: number;
  /** Same rate used by the server. Display-only — server is authoritative. */
  gstRatePct?: number;
  currencyCode?: 'INR' | 'AED';
  onDone: () => void;
}

function consolidateItems(items: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const item of items) {
    const key = `${item.name}||${item.variantSize ?? ''}`;
    const existing = map.get(key);
    if (existing) {
      map.set(key, { ...existing, qty: existing.qty + item.qty });
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

export default function OrderConfirmedScreen({
  orderNumber, shopName, items, subtotal, paymentMethod, tokenNumber, tableNumber, gstRatePct = 0, currencyCode = 'INR', onDone,
}: OrderConfirmedScreenProps) {
  const CURR = currencyCode === 'AED' ? 'AED ' : '₹';
  const displayItems = consolidateItems(items);
  const showGst    = gstRatePct > 0;
  const taxAmount  = showGst ? Math.round(subtotal * gstRatePct) / 100 : 0;
  const cgstAmount = Math.round(taxAmount * 50) / 100;
  const sgstAmount = Math.round((taxAmount - cgstAmount) * 100) / 100;
  const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100;
  const splitRate  = gstRatePct / 2;
  const [phase, setPhase] = useState<'success' | 'details'>('success');
  const [downloading, setDownloading] = useState(false);
  const billRef = useRef<HTMLDivElement>(null);
  const saveBillCardRef = useRef<HTMLDivElement>(null);

  const isNoPayment = paymentMethod === 'no_payment';
  // For no_payment: table orders use tableNumber, takeaway orders use tokenNumber ("Takeaway X")
  const isTakeawayNoPayment = isNoPayment && !tableNumber;
  const isTokenOrder = !!tokenNumber && !isNoPayment;
  const displayToken = tokenNumber ?? `#${orderNumber.slice(-6).toUpperCase()}`;
  const paymentLabel = paymentMethod === 'online' ? 'Paid Online' : isNoPayment ? 'Order Placed' : 'Payment Confirmed';

  const orderTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  useEffect(() => {
    if (phase === 'success') {
      const timer = setTimeout(() => setPhase('details'), 2500);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  async function handleDownload() {
    if (!billRef.current) return;
    setDownloading(true);

    // Hide the save-bill card so it doesn't appear in the captured image
    if (saveBillCardRef.current) saveBillCardRef.current.style.display = 'none';

    // Scroll the fixed overlay back to top so html2canvas always captures
    // from the same position — second+ downloads otherwise clip or offset
    const scrollParent = billRef.current.closest('[style*="overflow-y"]') as HTMLElement | null;
    const prevScroll = scrollParent?.scrollTop ?? 0;
    if (scrollParent) scrollParent.scrollTop = 0;

    try {
      const html2canvas = (await import('html2canvas')).default;
      const el = billRef.current;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        // explicitly size the canvas to the element's full content
        width: el.offsetWidth,
        height: el.scrollHeight,
        scrollX: 0,
        scrollY: 0,
        windowWidth: el.offsetWidth,
        windowHeight: el.scrollHeight,
      });
      const link = document.createElement('a');
      link.download = `bill-${orderNumber}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      window.print();
    } finally {
      if (saveBillCardRef.current) saveBillCardRef.current.style.display = 'block';
      if (scrollParent) scrollParent.scrollTop = prevScroll;
      setDownloading(false);
    }
  }

  // ── PHASE 1: SUCCESS ANIMATION ──
  if (phase === 'success') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: C.white,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        maxWidth: 560, margin: '0 auto',
      }}>
        <style>{`
          @keyframes checkPop {
            0%   { transform: scale(0.5); opacity: 0; }
            60%  { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes ringDraw {
            0%   { stroke-dashoffset: 440; }
            100% { stroke-dashoffset: 0; }
          }
        `}</style>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
          <div style={{
            position: 'relative', width: 154, height: 154,
            animation: 'checkPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards',
          }}>
            <svg width="154" height="154" viewBox="0 0 154 154" fill="none" style={{ position: 'absolute', inset: 0 }}>
              <circle cx="77" cy="77" r="72" stroke="#EF59A1" strokeWidth="1.5"
                strokeDasharray="440" strokeDashoffset="440" strokeLinecap="round"
                style={{ animation: 'ringDraw 1s 0.3s ease forwards' }} />
            </svg>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 120, height: 120, borderRadius: '50%',
              background: 'linear-gradient(180deg, #E8E8E8 0%, #D9D9D9 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path d="M12 24l10 10 14-16" stroke="#FFFFFF" strokeWidth="4"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <h1 style={{
            fontFamily: "'Poppins',sans-serif", fontWeight: 500,
            fontSize: 20, lineHeight: '30px', color: '#000000',
            margin: 0, textAlign: 'center',
          }}>Order Placed Successfully</h1>
        </div>
      </div>
    );
  }

  // ── PHASE 2: ORDER DETAILS SCREEN ──
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: C.white,
      display: 'flex', flexDirection: 'column',
      animation: 'qrFadeIn 0.3s ease',
      maxWidth: 560, margin: '0 auto',
      overflowY: 'auto',
    }}>
      {/* ── TOP HEADER ── */}
      <div style={{
        width: '100%', padding: '24px 16px 20px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: C.greenBg, border: `2px solid ${C.greenBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 4,
        }}>
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <path d="M6 16.5l7 7 13-14" stroke={C.green} strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 style={{
          fontFamily: "'Poppins',sans-serif", fontWeight: 700,
          fontSize: 20, lineHeight: '28px', color: C.dark,
          margin: 0, textAlign: 'center',
        }}>Order Confirmed</h2>
        <p style={{
          fontFamily: "'Poppins',sans-serif", fontWeight: 400,
          fontSize: 13, color: C.gray400, margin: 0, textAlign: 'center',
        }}>{shopName}</p>
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div style={{ flex: 1, padding: '20px 16px 0' }}>

        {/* ── PRINTABLE BILL — billRef captures everything; saveBillCardRef hidden during export ── */}
        <div ref={billRef} style={{ background: C.white }}>

          {/* Shop name + payment badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 15, color: C.dark }}>{shopName}</span>
            <span style={{
              fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12, color: C.green,
              background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 20, padding: '3px 10px',
            }}>✓ {paymentLabel}</span>
          </div>

          {/* ── TABLE CARD (no_payment + table scan) ── */}
          {isNoPayment && !isTakeawayNoPayment ? (
            <div style={{
              width: '100%', padding: '20px 24px',
              border: `2px solid #FED7AA`, borderRadius: 16,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 8, marginBottom: 14, background: '#FFF7ED',
            }}>
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', color: '#9A3412',
              }}>Your Table</span>
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 800,
                fontSize: 42, lineHeight: 1, textAlign: 'center', color: C.dark,
              }}>Table {tableNumber}</span>
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 400,
                fontSize: 12, color: '#C2410C', textAlign: 'center',
              }}>Your order is being prepared — we&apos;ll bring it to you</span>
            </div>

          /* ── TAKEAWAY TOKEN CARD (no_payment + takeaway scan) ── */
          ) : isTakeawayNoPayment ? (
            <div style={{
              width: '100%', padding: '20px 24px',
              border: `2px solid #FED7AA`, borderRadius: 16,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 8, marginBottom: 14, background: '#FFF7ED',
            }}>
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', color: '#9A3412',
              }}>Takeaway Number</span>
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 800,
                fontSize: 56, lineHeight: 1, textAlign: 'center', color: C.dark,
              }}>{tokenNumber ?? 'Takeaway'}</span>
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 400,
                fontSize: 12, color: '#C2410C', textAlign: 'center',
              }}>Show this number when collecting your order from the counter</span>
            </div>
          ) : (
            /* ── TOKEN CARD (online / counter) ── */
            <div style={{
              width: '100%', padding: '20px 24px',
              border: `2px solid ${C.tokenBorder}`, borderRadius: 16,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 6, marginBottom: 14,
            }}>
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                fontSize: 11, letterSpacing: '1px', textTransform: 'uppercase', color: C.gray400,
              }}>{isTokenOrder ? 'Token Number' : 'Order Reference'}</span>
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 800,
                fontSize: 56, lineHeight: 1, textAlign: 'center', color: C.dark,
              }}>{displayToken}</span>
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 400,
                fontSize: 12, color: C.gray500, textAlign: 'center',
              }}>{isTokenOrder ? 'Show this when collecting your order' : 'Your order is being prepared'}</span>
            </div>
          )}

          {/* ── SAVE BILL (hidden during download via saveBillCardRef) ── */}
          <div ref={saveBillCardRef} style={{
            width: '100%', padding: '14px 18px',
            background: C.saveBg, borderRadius: 16,
            display: 'flex', alignItems: 'center', gap: 14,
            marginBottom: 14,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: '#FED7AA',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.saveAccent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, color: '#9A3412', margin: '0 0 1px' }}>
                Save your bill for reference
              </p>
              <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: '#C2410C', margin: 0 }}>
                Download a copy in case you need it later.
              </p>
            </div>
            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{
                flexShrink: 0, background: C.saveAccent, border: 'none', borderRadius: 8,
                padding: '8px 14px', cursor: downloading ? 'not-allowed' : 'pointer',
                opacity: downloading ? 0.7 : 1,
              }}
            >
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12, color: '#fff' }}>
                {downloading ? '…' : 'Download'}
              </span>
            </button>
          </div>

          {/* ── ORDER DETAILS CARD ── */}
          <div style={{
            width: '100%', padding: '20px',
            border: `1px solid ${C.border}`, borderRadius: 16,
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: C.gray400 }}>Order No.</span>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: C.dark }}>#{orderNumber}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, color: C.gray400 }}>Time</span>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: C.dark }}>{orderTime}</span>
              </div>
            </div>

            <div style={{ width: '100%', height: 1, background: C.border, marginBottom: 16 }} />

            {displayItems.map(item => (
              <div key={`${item.id}-${item.variantSize ?? ''}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <p style={{
                    fontFamily: "'Poppins',sans-serif", fontWeight: 500,
                    fontSize: 14, color: C.dark, margin: '0 0 2px',
                  }}>{item.name}{item.variantSize ? ` (${item.variantSize})` : ''}</p>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: C.gray400 }}>Qty: {item.qty}</span>
                </div>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 14, color: C.dark }}>
                  ₹{item.price * item.qty}
                </span>
              </div>
            ))}

            <div style={{ width: '100%', height: 1, background: C.border, marginBottom: 14 }} />

            {showGst && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 13, color: C.gray500 }}>Subtotal</span>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 13, color: C.dark }}>{CURR}{subtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 13, color: C.gray500 }}>CGST ({splitRate}%)</span>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 13, color: C.dark }}>{CURR}{cgstAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 13, color: C.gray500 }}>SGST ({splitRate}%)</span>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 13, color: C.dark }}>{CURR}{sgstAmount.toFixed(2)}</span>
                </div>
                <div style={{ width: '100%', height: 1, background: C.border, marginBottom: 14 }} />
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15, color: C.dark }}>
                Total {showGst && <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 11, color: C.gray400 }}>(incl. GST)</span>}
              </span>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 20, color: C.dark }}>{CURR}{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
        {/* end billRef */}

        {/* ── ESTIMATED WAIT TIME (screen only, not in download) ── */}
        <div style={{
          width: '100%', padding: '18px 20px',
          border: `1px solid ${C.border}`, borderRadius: 16,
          display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 14, marginTop: 14,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', background: C.cardBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8.33" stroke={C.gray500} strokeWidth="1.67" fill="none" />
              <path d="M10 5v5l3.33 1.67" stroke={C.gray500} strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 14, color: C.dark, margin: 0 }}>
              Estimated Wait Time
            </p>
            <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: C.gray400 }}>5-10 minutes</span>
          </div>
        </div>

        {/* ── NEXT STEPS (screen only, not in download) ── */}
        <div style={{
          width: '100%', padding: '20px',
          border: `1px solid ${C.border}`, borderRadius: 16,
          marginBottom: 14,
        }}>
          <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: C.dark, margin: '0 0 12px' }}>
            Next Steps
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(isNoPayment ? (isTakeawayNoPayment ? [
              'Your order has been placed!',
              'The kitchen has been notified',
              `Show "${tokenNumber ?? 'your takeaway number'}" when collecting your order`,
            ] : [
              'Your order has been placed!',
              'The kitchen has been notified',
              'Relax — your food will be brought to your table',
            ]) : isTokenOrder ? [
              'Your payment was confirmed',
              'Wait for your token number to be called',
              'Show this screen when collecting your order',
            ] : [
              'Your order is being prepared',
              'Payment received — nothing more needed',
              'Enjoy your meal!',
            ]).map((text, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: C.dark,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 11, color: '#fff' }}>{i + 1}</span>
                </div>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, color: C.gray500 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOTTOM BUTTON ── */}
      <div style={{ width: '100%', padding: '12px 16px 24px', background: C.white, flexShrink: 0 }}>
        <button
          onClick={onDone}
          style={{
            width: '100%', height: 46,
            background: C.pink, border: 'none', borderRadius: 6,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16, color: '#fff' }}>
            Return to Home
          </span>
        </button>
      </div>
    </div>
  );
}
