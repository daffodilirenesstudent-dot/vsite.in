'use client';

import React, { useState } from 'react';
import type { CartItem } from './QRMenuTemplate';

const C = {
  pink: '#EF59A1',
  dark: '#191919',
  border: '#E6E6E6',
  headerBorder: '#CCCCCC',
  white: '#FFFFFF',
  gray400: '#999999',
  gray600: '#666666',
  gray800: '#333333',
  gray900: '#191919',
  sectionBg: '#F5F5F5',
  vegGreen: '#00A63E',
  nonvegRed: '#FB2C36',
  clearRed: '#BE3F45',
  editRed: '#FB2C36',
  black: '#000000',
};

function VegDot({ foodType }: { foodType?: string | null }) {
  const isNonveg = foodType === 'nonveg' || foodType === 'non_veg';
  const isEgg = foodType === 'egg';
  const color = isNonveg ? C.nonvegRed : isEgg ? '#FFBC11' : C.vegGreen;
  return (
    <div style={{
      width: 16, height: 16, flexShrink: 0,
      border: `1px solid ${color}`, borderRadius: 3,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
    </div>
  );
}

function QtyStepper({ qty, onMinus, onPlus }: { qty: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      width: 96, height: 32,
      border: `1.5px solid ${C.pink}`, borderRadius: 6,
      background: C.white, flexShrink: 0,
    }}>
      <button onClick={onMinus} aria-label="Decrease" style={{
        flex: 1, height: '100%', background: 'none', border: 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="13" height="2" viewBox="0 0 13 2" fill="none">
          <path d="M1 1h11" stroke={C.pink} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <span style={{
        fontFamily: "'Poppins',sans-serif", fontWeight: 700,
        fontSize: 15, color: C.pink, minWidth: 22, textAlign: 'center',
      }}>{qty}</span>
      <button onClick={onPlus} aria-label="Increase" style={{
        flex: 1, height: '100%', background: 'none', border: 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1v11M1 6.5h11" stroke={C.pink} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// ── UPI BRAND LOGOS (monochrome SVG marks) ────────────────────────────────────
function UpiLogoStrip() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
      {/* GPay pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: '#F8F8F8', border: '1px solid #E0E0E0',
        borderRadius: 4, padding: '2px 7px',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 11.5v1.5h3.5c-.15.813-.73 2.5-3.5 2.5-2.1 0-3.8-1.74-3.8-3.9S9.9 7.7 12 7.7c1.19 0 2 .51 2.46.94l1.63-1.57C15.04 6.12 13.65 5.5 12 5.5 8.97 5.5 6.5 7.97 6.5 11S8.97 16.5 12 16.5c3.17 0 5.27-2.23 5.27-5.37 0-.36-.04-.63-.09-.88H12z" fill="#4285F4"/>
        </svg>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10, fontWeight: 600, color: '#333' }}>GPay</span>
      </div>
      {/* PhonePe pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: '#F8F8F8', border: '1px solid #E0E0E0',
        borderRadius: 4, padding: '2px 7px',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#5F259F"/>
          <path d="M7 6h5.5c2.5 0 4.5 2 4.5 4.5S15 15 12.5 15H11v3H7V6z" fill="white"/>
        </svg>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 10, fontWeight: 600, color: '#333' }}>PhonePe</span>
      </div>
      {/* UPI pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        background: '#F8F8F8', border: '1px solid #E0E0E0',
        borderRadius: 4, padding: '2px 7px',
      }}>
        <svg width="14" height="10" viewBox="0 0 52 30" fill="none">
          <rect width="52" height="30" rx="4" fill="#097939"/>
          <text x="8" y="22" fontFamily="sans-serif" fontWeight="bold" fontSize="16" fill="white">UPI</text>
        </svg>
      </div>
    </div>
  );
}

interface CartSheetProps {
  items: CartItem[];
  onClose: () => void;
  onUpdateQty: (id: string, variantSize: string | undefined, delta: number) => void;
  onRemove: (id: string, variantSize: string | undefined) => void;
  onCheckout: (paymentMethod: 'online' | 'counter' | 'no_payment') => void;
  paymentMode?: 'online' | 'counter' | 'no_payment';
  /** Restaurant has Razorpay connected. When false the "Pay Online" option
   *  is hidden and the cart defaults to "Pay at Counter". */
  onlineEnabled?: boolean;
  /** GST rate (5 / 18 / 0). When > 0, CGST/SGST split shown and total = subtotal + tax. */
  gstRatePct?: number;
  currencyCode?: 'INR' | 'AED';
  /** True when the store has WhatsApp order-taking enabled — relabels the CTA. */
  whatsappMode?: boolean;
  onAddMore?: () => void;
  onEditItem?: (item: CartItem) => void;
}

export default function CartSheet({ items, onClose, onUpdateQty, onRemove, onCheckout, paymentMode, onlineEnabled = true, gstRatePct = 0, currencyCode = 'INR', whatsappMode = false, onAddMore, onEditItem }: CartSheetProps) {
  const CURR = currencyCode === 'AED' ? 'AED ' : '₹';
  const initialMethod: 'online' | 'counter' | 'no_payment' = paymentMode
    ?? (onlineEnabled ? 'online' : 'counter');
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'counter' | 'no_payment'>(initialMethod);
  // If the online flag flips to false after mount, snap selection off online.
  React.useEffect(() => {
    if (!onlineEnabled && paymentMethod === 'online') setPaymentMethod('counter');
  }, [onlineEnabled, paymentMethod]);

  const subtotal = Math.round(items.reduce((sum, i) => sum + i.price * i.qty, 0) * 100) / 100;
  // Preview only — the server-side RPC re-computes the authoritative tax.
  const taxAmount   = gstRatePct > 0 ? Math.round(subtotal * gstRatePct) / 100 : 0;
  const cgstAmount  = Math.round(taxAmount * 50) / 100;          // half, 2dp
  const sgstAmount  = Math.round((taxAmount - cgstAmount) * 100) / 100;
  const grandTotal  = Math.round((subtotal + taxAmount) * 100) / 100;
  const splitRate   = gstRatePct / 2;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your cart"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: C.sectionBg,
        display: 'flex', flexDirection: 'column',
        animation: 'qrFadeIn 0.15s ease',
        maxWidth: 560, margin: '0 auto',
      }}
    >
      {/* ── HEADER ── */}
      <div style={{
        width: '100%', height: 54, flexShrink: 0,
        background: C.white, borderBottom: `1px solid ${C.headerBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} aria-label="Go back" style={{
            width: 24, height: 24, background: 'none', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke={C.gray900} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <div>
            <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, color: C.gray800, display: 'block' }}>My Cart</span>
            {items.length > 0 && (
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 12, color: C.gray400 }}>
                {items.reduce((s, i) => s + i.qty, 0)} item{items.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        {items.length > 0 && (
          <button
            onClick={() => items.forEach(item => onRemove(item.id, item.variantSize))}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: C.clearRed,
            }}
          >Clear All</button>
        )}
      </div>

      {/* ── SCROLLABLE CONTENT ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {items.length === 0 ? (
          <div style={{ paddingTop: 80, textAlign: 'center' }}>
            <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 16, color: '#C5C5C5', fontWeight: 500 }}>Your cart is empty</p>
            <button onClick={onAddMore} style={{
              marginTop: 16, background: C.pink, border: 'none', borderRadius: 8,
              padding: '12px 24px', cursor: 'pointer',
              fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: C.white,
            }}>Browse Menu</button>
          </div>
        ) : (
          <>
            {/* ── CART ITEMS ── */}
            <div style={{ background: C.white, marginBottom: 8 }}>
              <div style={{ padding: '14px 16px 4px' }}>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12, color: C.gray600, letterSpacing: '0.05em' }}>YOUR ORDER</span>
              </div>

              {items.map((item, idx) => (
                <div key={`${item.id}-${item.variantSize ?? ''}`} style={{
                  padding: '14px 16px',
                  borderBottom: idx < items.length - 1 ? `1px solid ${C.border}` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ paddingTop: 3 }}>
                      <VegDot foodType={item.food_type} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: C.gray800 }}>{item.name}</p>
                      {item.variantSize && (
                        <p style={{ margin: '2px 0 0', fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 11, color: C.gray400 }}>{item.variantSize}</p>
                      )}
                      {item.variantSize && onEditItem && (
                        <button onClick={() => onEditItem(item)} style={{
                          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          display: 'flex', alignItems: 'center', gap: 2, marginTop: 4,
                        }}>
                          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 11, color: C.editRed }}>Edit</span>
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path d="M4.5 2.5l3.5 3.5-3.5 3.5" stroke={C.editRed} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <QtyStepper
                        qty={item.qty}
                        onMinus={() => item.qty === 1 ? onRemove(item.id, item.variantSize) : onUpdateQty(item.id, item.variantSize, -1)}
                        onPlus={() => onUpdateQty(item.id, item.variantSize, 1)}
                      />
                      <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15, color: C.gray800 }}>{CURR}{item.price * item.qty}</span>
                    </div>
                  </div>
                </div>
              ))}

              <div style={{ padding: '8px 16px 16px' }}>
                <button onClick={onAddMore} style={{
                  background: 'none', border: `1.5px dashed ${C.pink}`, borderRadius: 8,
                  width: '100%', padding: '10px 0', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke={C.pink} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, color: C.pink }}>Add more items</span>
                </button>
              </div>
            </div>

            {/* ── PAYMENT METHOD CARD (hidden for no_payment tier) ── */}
            {paymentMethod !== 'no_payment' && (
              <div style={{ background: C.white, marginBottom: 8, padding: '16px' }}>
                <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15, color: C.gray900, margin: '0 0 12px' }}>
                  Payment Method
                </p>

                {/* Online payment row — only when the restaurant has Razorpay connected. */}
                {onlineEnabled && (
                <button
                  onClick={() => setPaymentMethod('online')}
                  style={{
                    width: '100%', padding: '14px 12px',
                    border: `2px solid ${paymentMethod === 'online' ? C.pink : C.border}`,
                    borderRadius: 10,
                    background: paymentMethod === 'online' ? '#FFF0F7' : C.white,
                    cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12,
                    marginBottom: 10, textAlign: 'left',
                  }}
                >
                  {/* Radio */}
                  <div style={{
                    width: 20, height: 20, borderRadius: 10, marginTop: 2, flexShrink: 0,
                    border: `2px solid ${paymentMethod === 'online' ? C.pink : '#CCC'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {paymentMethod === 'online' && <div style={{ width: 10, height: 10, borderRadius: 5, background: C.pink }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Wallet icon */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <rect x="2" y="6" width="20" height="14" rx="3" stroke={paymentMethod === 'online' ? C.pink : C.gray600} strokeWidth="1.5"/>
                        <path d="M16 13a1 1 0 100-2 1 1 0 000 2z" fill={paymentMethod === 'online' ? C.pink : C.gray600}/>
                        <path d="M2 10h20" stroke={paymentMethod === 'online' ? C.pink : C.gray600} strokeWidth="1.5"/>
                        <path d="M6 4l4-1 8 2" stroke={paymentMethod === 'online' ? C.pink : C.gray600} strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: C.gray800 }}>Pay Online</span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 11, color: C.gray400 }}>
                      UPI, Net Banking, Cards &amp; more
                    </p>
                    <UpiLogoStrip />
                  </div>
                </button>
                )}

                {/* Counter payment row */}
                <button
                  onClick={() => setPaymentMethod('counter')}
                  style={{
                    width: '100%', padding: '14px 12px',
                    border: `2px solid ${paymentMethod === 'counter' ? C.pink : C.border}`,
                    borderRadius: 10,
                    background: paymentMethod === 'counter' ? '#FFF0F7' : C.white,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                  }}
                >
                  {/* Radio */}
                  <div style={{
                    width: 20, height: 20, borderRadius: 10, flexShrink: 0,
                    border: `2px solid ${paymentMethod === 'counter' ? C.pink : '#CCC'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {paymentMethod === 'counter' && <div style={{ width: 10, height: 10, borderRadius: 5, background: C.pink }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Counter/store icon */}
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M3 21h18M3 7v14M21 7v14M6 11h4M6 15h4M14 11h4M14 15h4M10 21v-4a2 2 0 014 0v4"
                          stroke={paymentMethod === 'counter' ? C.pink : C.gray600} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M1 7l11-4 11 4" stroke={paymentMethod === 'counter' ? C.pink : C.gray600} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: C.gray800 }}>Pay at Counter</span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 11, color: C.gray400 }}>
                      Cash or card after your order is placed
                    </p>
                  </div>
                </button>
              </div>
            )}

            {/* ── ORDER DETAILS ── */}
            <div style={{ background: C.white, marginBottom: 8, padding: '16px' }}>
              <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15, color: C.gray900, margin: '0 0 14px' }}>Order Details</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map(item => (
                  <div key={`bill-${item.id}-${item.variantSize ?? ''}`}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 13, color: C.gray800, flex: 1, marginRight: 8 }}>
                      {item.name}{item.variantSize ? ` (${item.variantSize})` : ''} × {item.qty}
                    </span>
                    <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 13, color: C.gray800 }}>{CURR}{item.price * item.qty}</span>
                  </div>
                ))}

                <div style={{ height: 1, background: C.border, margin: '4px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 14, color: C.black }}>Item total</span>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 14, color: C.black }}>{CURR}{subtotal}</span>
                </div>
                {gstRatePct > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 13, color: C.gray800 }}>CGST ({splitRate}%)</span>
                      <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 13, color: C.gray800 }}>{CURR}{cgstAmount.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 13, color: C.gray800 }}>SGST ({splitRate}%)</span>
                      <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 13, color: C.gray800 }}>{CURR}{sgstAmount.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 14, color: C.black }}>Order total</span>
                  <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 14, color: C.black }}>{CURR}{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div style={{
                marginTop: 14, padding: '14px 12px',
                background: C.pink, borderRadius: 8,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15, color: C.white }}>Amount Payable</span>
                <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 15, color: C.white }}>{CURR}{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ height: 110 }} />
          </>
        )}
      </div>

      {/* ── BOTTOM CHECKOUT BAR ── */}
      {items.length > 0 && (
        <div style={{
          width: '100%', flexShrink: 0,
          background: C.white, borderTop: `1px solid ${C.border}`,
          boxShadow: '0px -4px 12px rgba(0,0,0,0.08)',
          padding: '12px 16px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          {/* Passive payment readout — hidden in WhatsApp mode */}
          {!whatsappMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 10, color: C.gray600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {paymentMethod === 'online' ? 'Paying via' : paymentMethod === 'no_payment' ? 'Order type' : 'Pay after order'}
              </span>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, color: C.gray800 }}>
                {paymentMethod === 'online' ? 'Online / UPI' : paymentMethod === 'no_payment' ? 'Table Order' : 'At Counter'}
              </span>
            </div>
          )}

          {/* Checkout button */}
          <button
            onClick={() => onCheckout(paymentMethod)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 16px', height: 52, flex: 1, minWidth: 0,
              background: C.pink, borderRadius: 8,
              border: 'none', cursor: 'pointer', gap: 8,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flexShrink: 0 }}>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 14, color: C.white, whiteSpace: 'nowrap' }}>{CURR}{grandTotal.toFixed(2)}</span>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 11, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>
                {gstRatePct > 0 ? 'Total (incl. GST)' : 'Total'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: C.white, whiteSpace: 'nowrap' }}>
                {whatsappMode ? 'Order on WhatsApp' : paymentMethod === 'online' ? 'Place Order' : paymentMethod === 'no_payment' ? 'Place Order' : 'Check out'}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke={C.white} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
