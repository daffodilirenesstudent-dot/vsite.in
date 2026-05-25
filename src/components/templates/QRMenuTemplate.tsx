'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import CartSheet from './CartSheet';
import CheckoutScreen from './CheckoutScreen';
import CounterWaitingScreen from './CounterWaitingScreen';
import OrderConfirmedScreen from './OrderConfirmedScreen';

// ── VARIANT DESCRIPTION HELPERS ──────────────────────────────────────────────
// When a description is stored as "variant-info || dish-description", returns
// the dish-description part. Falls back to the full text when no separator is
// present (owner just typed a regular description).
function getVariantDishDesc(desc: string | null | undefined): string {
  if (!desc) return '';
  const idx = desc.indexOf(' || ');
  return (idx >= 0 ? desc.slice(idx + 4) : desc).trim();
}

function hasRealVariants(meta: Record<string, unknown> | null | undefined): boolean {
  const v = meta?.variants;
  return Array.isArray(v) && v.length > 0;
}

/** Convert a "|"-delimited description into a clean readable paragraph. */
function toParagraph(desc: string | null | undefined): string {
  if (!desc) return '';
  const parts = desc.split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/[.!?]+$/, ''));
  if (!parts.length) return '';
  return parts.join('. ') + '.';
}

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const T = {
  pink: '#EF59A1',
  vegGreen: '#13801C',
  nonvegRed: '#FB2C36',
  dark: '#191919',
  nameColor: '#333333',
  descColor: '#808080',
  chipText: '#0A0A0A',
  lightGray: '#C5C5C5',
  border: '#E6E6E6',
  chipBorder: '#D1D5DC',
  cardBg: '#FAFAFA',
  white: '#FFFFFF',
  amber: '#FFBC11',
  footerSub: '#484848',
} as const;

// ── TYPES ─────────────────────────────────────────────────────────────────────
export type Tier = 'view' | 'order' | 'order_no_pay';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  image_url?: string | null;
  variantSize?: string;
  food_type?: string | null;
}

export interface MenuProduct {
  id: string;
  name: string;
  selling_price: number;
  description?: string | null;
  image_url?: string | null;
  is_live?: boolean;
  category?: string | null;
  food_type?: string | null;
  metadata?: Record<string, unknown> | null;
  display_order?: number | null;
  ks_quadrant?: string | null;
  star_rating?: number | null;
}

export interface ShopBanner {
  id: string;
  name: string;
  image_url: string | null;
  description?: string | null;
}

interface QRMenuTemplateProps {
  shopName: string;
  shopTagline?: string;
  logoUrl?: string | null;
  menuProducts: MenuProduct[];
  banners: ShopBanner[];
  tier: Tier;
  shopId: string;
  shopSlug: string;
  tableNumber?: number;
  /** Server-snapshotted GST rate (5 / 18 / 0). Used only to preview tax on the cart;
   *  the server recomputes authoritatively at order creation. */
  gstRatePct?: number;
  /** When true and tier === 'order_no_pay', placing an order writes a lightweight
   *  row and redirects to wa.me instead of going through the token / confirm flow. */
  whatsappOrderTaking?: boolean;
  /** Display currency code — only changes the symbol shown; numbers are the same. */
  currencyCode?: 'INR' | 'AED';
  onAddToCart?: (product: MenuProduct, qty: number, variantSize?: string) => void;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function numMeta(val: unknown): number {
  return typeof val === 'number' ? val : 0;
}

// ── VEG/EGG/NONVEG DOT ───────────────────────────────────────────────────────
function VegDot({ foodType }: { foodType?: string | null }) {
  const isNonveg = foodType === 'nonveg' || foodType === 'non_veg';
  const isEgg = foodType === 'egg';
  const color = isNonveg ? T.nonvegRed : isEgg ? T.amber : T.vegGreen;
  return (
    <div style={{
      width: 14, height: 14, flexShrink: 0,
      border: `0.5px solid ${color}`, borderRadius: 4,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
    </div>
  );
}

// ── IMAGE PLACEHOLDER ─────────────────────────────────────────────────────────
function ImgPlaceholder({ size }: { size: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: '#F0F0F0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 32 32" fill="none">
        <rect x="3" y="7" width="26" height="20" rx="3" stroke="#D1D5DC" strokeWidth="1.5" />
        <circle cx="11" cy="14" r="2.5" stroke="#D1D5DC" strokeWidth="1.5" />
        <path d="M3 23l7-5 5 4 4-3 9 7" stroke="#D1D5DC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── QUADRANT BADGE ────────────────────────────────────────────────────────────
function QuadrantBadge({ quadrant }: { quadrant?: string | null }) {
  if (!quadrant || quadrant === 'Dog') return null;
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    Star:      { label: '★ Best Seller', bg: '#FFF3C4', color: '#92600A' },
    Plowhorse: { label: '🔥 Popular',    bg: '#FEE2E2', color: '#991B1B' },
    Puzzle:    { label: '✦ Chef\'s Pick', bg: '#EDE9FE', color: '#5B21B6' },
  };
  const c = cfg[quadrant];
  if (!c) return null;
  return (
    <span aria-hidden="true" style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2px 0', background: c.bg,
      fontFamily: "'Manrope',sans-serif", fontWeight: 700,
      fontSize: 8, lineHeight: '11px', color: c.color,
      whiteSpace: 'nowrap', letterSpacing: '0.02em',
    }}>
      {c.label}
    </span>
  );
}

// ── BODY SCROLL LOCK ──────────────────────────────────────────────────────────
function useBodyScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
}

// ── RADIO CIRCLE ─────────────────────────────────────────────────────────────
function RadioCircle({ selected }: { selected: boolean }) {
  const color = selected ? '#EF59A1' : '#B3B3B3';
  return (
    <div style={{
      width: 20, height: 20, borderRadius: '50%',
      border: `2px solid ${color}`, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {selected && <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />}
    </div>
  );
}

// ── PRODUCT DETAIL BOTTOM SHEET ───────────────────────────────────────────────
function ProductDetailSheet({
  product, tier, onClose, onAddToCart, editingCartItem, onReplaceCartItem, currencyCode = 'INR',
}: {
  product: MenuProduct | null;
  tier: Tier;
  onClose: () => void;
  onAddToCart?: (product: MenuProduct, qty: number, variantSize?: string, priceOverride?: number) => void;
  editingCartItem?: CartItem | null;
  onReplaceCartItem?: (old: CartItem, product: MenuProduct, qty: number, variantSize?: string, priceOverride?: number) => void;
  currencyCode?: 'INR' | 'AED';
}) {
  useBodyScrollLock();
  const CURR = currencyCode === 'AED' ? 'AED ' : '₹';

  const meta = product?.metadata ?? {};
  const variants = Array.isArray(meta.variants) && (meta.variants as unknown[]).length > 0
    ? (meta.variants as { size: string; price: number | string; recommended?: boolean }[]) : null;
  const toppings = Array.isArray(meta.toppings) && (meta.toppings as unknown[]).length > 0
    ? (meta.toppings as { name: string; price: number | string }[]) : null;
  const comboItems = Array.isArray(meta.comboItems) && (meta.comboItems as unknown[]).length > 0
    ? (meta.comboItems as { name: string; qty: number | string }[]) : null;

  const productType: 'variant' | 'combo' | 'single' =
    variants ? 'variant' : comboItems ? 'combo' : 'single';

  const isEditing = !!(editingCartItem && onReplaceCartItem);

  const [qty, setQty] = useState(1);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [selectedToppingIdx, setSelectedToppingIdx] = useState<number | null>(null);
  // Re-entry guard — prevents a rapid double-tap from adding the item twice
  // while the parent's history.back() close animation is still in flight.
  const submittingRef = useRef(false);

  useEffect(() => {
    if (editingCartItem?.variantSize && variants) {
      const idx = variants.findIndex(v => v.size === editingCartItem.variantSize);
      setSelectedVariantIdx(idx >= 0 ? idx : 0);
    } else {
      setSelectedVariantIdx(0);
    }
    setQty(editingCartItem?.qty ?? 1);
    setSelectedToppingIdx(null);
    submittingRef.current = false;
  }, [product?.id, editingCartItem?.variantSize]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!product) return null;

  const selectedVariantPrice = variants
    ? Number(variants[selectedVariantIdx]?.price ?? product.selling_price)
    : product.selling_price;
  const selectedToppingPrice = toppings && selectedToppingIdx !== null
    ? Number(toppings[selectedToppingIdx]?.price ?? 0) : 0;
  const totalPrice = (selectedVariantPrice + selectedToppingPrice) * qty;

  const discountOn = !!(meta.discount_enabled) && !!(meta.original_price);
  const discountPct = numMeta(meta.discount_pct);


  // ── VARIANT LAYOUT (Figma design) ─────────────────────────────────────────
  if (productType === 'variant' && variants) {
    const dishDesc = getVariantDishDesc(product.description);
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          animation: 'qrFadeIn 0.15s ease',
        }}
      >
        <div style={{
          width: '100%', maxWidth: 560,
          borderRadius: '30px 30px 0 0',
          animation: 'qrSlideUp 0.28s cubic-bezier(0.34,1.2,0.64,1)',
          maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
          overflow: 'hidden', background: '#F1F0F5',
        }}>
          {/* ── COMPACT HEADER ── */}
          <div style={{
            background: T.white, borderRadius: '30px 30px 0 0', flexShrink: 0,
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 54, height: 54, borderRadius: 6, overflow: 'hidden',
              flexShrink: 0, background: '#F0F0F0',
            }}>
              {product.image_url
                ? <img src={product.image_url} alt={product.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : <ImgPlaceholder size={54} />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16,
                lineHeight: '24px', color: '#333333', margin: 0,
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}>{product.name}</p>
              {product.category && (
                <p style={{
                  fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 12,
                  lineHeight: '18px', color: '#999999', margin: 0,
                }}>{product.category}</p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'rgba(0,0,0,0.75)', border: 'none', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* ── SCROLLABLE GRAY BODY ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>

            {/* Offer banner — prioritized when discount is active */}
            {discountOn && discountPct > 0 && (() => {
              const orig = numMeta(meta.original_price);
              const baseSelling = Number(product.selling_price);
              const savings = Math.max(0, orig - baseSelling);
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'linear-gradient(90deg, #ECFDF5 0%, #F7FEE7 100%)',
                  border: '1px dashed #16A34A', borderRadius: 8,
                  padding: '10px 12px', marginBottom: 12,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: '#16A34A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="7" cy="7" r="1.2" fill="#FFFFFF"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13, lineHeight: '18px', color: '#15803D' }}>Flat {discountPct}% OFF applied</p>
                    {savings > 0 && (
                      <p style={{ margin: '1px 0 0', fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 11, lineHeight: '15px', color: '#166534' }}>You save {CURR}{savings} on this item</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Description — paragraph; muted when an offer is taking priority */}
            {dishDesc && (() => {
              const paragraph = toParagraph(dishDesc);
              const offerActive = discountOn && discountPct > 0;
              return (
                <p style={{
                  fontFamily: "'Poppins',sans-serif",
                  fontWeight: 400,
                  fontSize: offerActive ? 12 : 13,
                  lineHeight: offerActive ? '18px' : '20px',
                  color: offerActive ? '#6B7280' : '#4B5563',
                  margin: '0 0 14px',
                }}>{paragraph}</p>
              );
            })()}

            {/* Prefer Quantity */}
            <p style={{
              fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 14,
              lineHeight: '12px', color: '#4C4C4C', margin: '0 0 10px 4px',
            }}>Prefer Quantity</p>
            <div style={{
              background: T.white, border: '1px solid #E6E6E6', borderRadius: 10,
              overflow: 'hidden', marginBottom: 16,
            }}>
              {variants.map((v, i) => (
                <button
                  key={v.size}
                  onClick={() => setSelectedVariantIdx(i)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 12px', width: '100%', textAlign: 'left',
                    background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: i < variants.length - 1 ? '1px solid #F0F0F0' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontFamily: "'Manrope',sans-serif", fontWeight: 500,
                      fontSize: 14, lineHeight: '19px', color: '#333333',
                    }}>{v.size}</span>
                    {v.recommended && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '2px 6px', background: '#FFEDE4', borderRadius: 17,
                        fontFamily: "'Manrope',sans-serif", fontWeight: 600,
                        fontSize: 11, lineHeight: '15px', letterSpacing: '0.0161em', color: '#F18145',
                        whiteSpace: 'nowrap',
                      }}>Recommended</span>
                    )}
                    <span style={{
                      fontFamily: "'Poppins',sans-serif", fontWeight: 500,
                      fontSize: 12, color: '#999999',
                    }}>{CURR}{v.price}</span>
                  </div>
                  <RadioCircle selected={i === selectedVariantIdx} />
                </button>
              ))}
            </div>

            {/* Toppings */}
            {toppings && (
              <>
                <p style={{
                  fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 14,
                  lineHeight: '12px', color: '#4C4C4C', margin: '0 0 10px 4px',
                }}>Toppings</p>
                <div style={{
                  background: T.white, border: '1px solid #E6E6E6', borderRadius: 10,
                  overflow: 'hidden',
                }}>
                  {toppings.map((t, i) => {
                    const toppingPrice = Number(t.price ?? 0);
                    return (
                      <button
                        key={t.name}
                        onClick={() => setSelectedToppingIdx(i === selectedToppingIdx ? null : i)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 12px', width: '100%', textAlign: 'left',
                          background: 'none', border: 'none', cursor: 'pointer',
                          borderBottom: i < toppings.length - 1 ? '1px solid #F0F0F0' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontFamily: "'Manrope',sans-serif", fontWeight: 500,
                            fontSize: 14, lineHeight: '19px', color: '#333333',
                          }}>{t.name}</span>
                          {toppingPrice > 0 && (
                            <span style={{
                              fontFamily: "'Poppins',sans-serif", fontWeight: 500,
                              fontSize: 12, color: '#999999',
                            }}>+{CURR}{toppingPrice}</span>
                          )}
                        </div>
                        <RadioCircle selected={i === selectedToppingIdx} />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── BOTTOM BAR ── */}
          {(tier === 'order' || tier === 'order_no_pay') && (
            <div style={{
              height: 70, flexShrink: 0,
              background: 'linear-gradient(271.36deg, #FFFFFF 1.97%, #FFF3E6 126.56%)',
              display: 'flex', alignItems: 'center',
              padding: '0 12px', gap: 12,
            }}>
              {/* Qty pill */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: 140, height: 46, flexShrink: 0,
                border: `1px solid ${T.pink}`, borderRadius: 100, padding: '0 14px',
              }}>
                <button
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14" stroke={T.pink} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
                <span style={{
                  fontFamily: "'Poppins',sans-serif", fontWeight: 700,
                  fontSize: 18, lineHeight: '27px', letterSpacing: '0.0161em', color: T.pink,
                }}>{qty}</span>
                <button
                  onClick={() => setQty(q => Math.min(99, q + 1))}
                  aria-label="Increase quantity"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke={T.pink} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Add / Update button */}
              <button
                onClick={() => {
                  if (submittingRef.current) return;
                  submittingRef.current = true;
                  const variantSize = variants[selectedVariantIdx]?.size;
                  const pricePerItem = selectedVariantPrice + selectedToppingPrice;
                  if (isEditing) {
                    onReplaceCartItem!(editingCartItem!, product, qty, variantSize, pricePerItem);
                  } else {
                    onAddToCart?.(product, qty, variantSize, pricePerItem);
                  }
                  onClose();
                }}
                style={{
                  flex: 1, height: 46, background: T.pink, border: 'none',
                  borderRadius: 6, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{
                    fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                    fontSize: 14, lineHeight: '21px', color: T.white,
                  }}>{CURR}{totalPrice}</span>
                  <span style={{
                    fontFamily: "'Poppins',sans-serif", fontWeight: 400,
                    fontSize: 12, lineHeight: '18px', color: T.white,
                  }}>Total</span>
                </div>
                <div style={{ width: 1, height: 34, background: '#F4D2A7', margin: '0 14px' }} />
                <span style={{
                  fontFamily: "'Poppins',sans-serif", fontWeight: 400,
                  fontSize: 14, lineHeight: '21px', color: T.white,
                }}>{isEditing ? 'Update' : 'Add'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SINGLE / COMBO LAYOUT (existing design) ───────────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
        animation: 'qrFadeIn 0.15s ease',
      }}
    >
      {/* Floating close button — centered above sheet, Zomato/Swiggy pattern */}
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: '#FFFFFF', border: 'none', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="#1A1A1A" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      </button>

      <div style={{
        width: '100%', maxWidth: 560,
        background: T.white, borderRadius: '20px 20px 0 0',
        animation: 'qrSlideUp 0.28s cubic-bezier(0.34,1.2,0.64,1)',
        maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Image with overlay close button (Swiggy/Zomato pattern) */}
        <div style={{ position: 'relative' }}>
          {product.image_url
            ? <img src={product.image_url} alt={product.name}
                style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
            : <div style={{
                width: '100%', aspectRatio: '4/3',
                background: 'linear-gradient(135deg,#fce4ee,#f9e8f2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ImgPlaceholder size={80} />
              </div>
          }
          {/* Drag handle pinned to top of image */}
          <div style={{
            position: 'absolute', left: '50%', top: 10, transform: 'translateX(-50%)',
            width: 44, height: 4, borderRadius: 100, background: 'rgba(255,255,255,0.85)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }} />
          {/* Bestseller chip — top-left of image */}
          {product.ks_quadrant === 'star' && (
            <div style={{
              position: 'absolute', top: 12, left: 12,
              background: 'rgba(255,255,255,0.96)', borderRadius: 6,
              padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#F59E0B">
                <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.6L6 22l1.5-7.2L2 10l7.1-1.1L12 2z"/>
              </svg>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 11, color: '#92400E' }}>Bestseller</span>
            </div>
          )}
        </div>

        <div style={{ padding: '18px 16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ paddingTop: 6 }}>
              <VegDot foodType={product.food_type} />
            </div>
            <h2 style={{
              fontFamily: "'Poppins',sans-serif", fontWeight: 700,
              fontSize: 22, lineHeight: '30px', color: '#1A1A1A', margin: 0, flex: 1,
            }}>{product.name}</h2>
          </div>

          {/* Price row — unified for single & combo */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: "'Poppins',sans-serif", fontWeight: 700,
              fontSize: 20, lineHeight: '28px', color: '#1A1A1A',
            }}>{CURR}{product.selling_price}</span>
            {discountOn && (
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 500,
                fontSize: 13, lineHeight: '18px',
                textDecoration: 'line-through', color: '#9CA3AF',
              }}>{CURR}{numMeta(meta.original_price)}</span>
            )}
            {discountOn && discountPct > 0 && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', padding: '3px 8px',
                background: '#DCFCE7', borderRadius: 4,
              }}>
                <span style={{
                  fontFamily: "'Poppins',sans-serif", fontWeight: 700,
                  fontSize: 11, color: '#15803D', letterSpacing: '0.02em',
                }}>{discountPct}% OFF</span>
              </div>
            )}
          </div>

          {/* Offer banner — prioritized when discount is active (works for single & combo) */}
          {discountOn && discountPct > 0 && (() => {
            const orig = numMeta(meta.original_price);
            const savings = Math.max(0, orig - Number(product.selling_price));
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'linear-gradient(90deg, #ECFDF5 0%, #F7FEE7 100%)',
                border: '1px dashed #16A34A', borderRadius: 8,
                padding: '10px 12px',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: '#16A34A',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="7" cy="7" r="1.2" fill="#FFFFFF"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontFamily: "'Poppins',sans-serif", fontWeight: 700,
                    fontSize: 13, lineHeight: '18px', color: '#15803D',
                  }}>Flat {discountPct}% OFF applied</p>
                  {savings > 0 && (
                    <p style={{
                      margin: '1px 0 0', fontFamily: "'Poppins',sans-serif", fontWeight: 500,
                      fontSize: 11, lineHeight: '15px', color: '#166534',
                    }}>You save {CURR}{savings} on this {productType === 'combo' ? 'combo' : 'item'}</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Description paragraph — muted when an offer is taking priority */}
          {product.description && (() => {
            const paragraph = toParagraph(product.description);
            const offerActive = discountOn && discountPct > 0;
            return (
              <p style={{
                fontFamily: "'Poppins',sans-serif",
                fontWeight: 400,
                fontSize: offerActive ? 12 : 13,
                lineHeight: offerActive ? '18px' : '20px',
                color: offerActive ? '#6B7280' : '#4B5563',
                margin: 0,
              }}>{paragraph}</p>
            );
          })()}

          {/* Combo items — "What's included" list */}
          {productType === 'combo' && comboItems && (
            <>
              <div style={{ height: 1, background: '#F1F1F1', margin: '4px 0 2px' }} />
              <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13, color: '#1A1A1A', margin: '0 0 4px', letterSpacing: '0.02em' }}>What&apos;s included</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {comboItems.map((item) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.pink, flexShrink: 0 }} />
                      <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 500, fontSize: 14, lineHeight: '19px', color: '#333333' }}>{item.name}</span>
                    </div>
                    <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 12, color: T.descColor, background: '#F4F4F5', borderRadius: 6, padding: '2px 8px' }}>×{item.qty}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        </div>

        {(tier === 'order' || tier === 'order_no_pay') && (
          <div style={{
            width: '100%', flexShrink: 0,
            background: T.white, borderTop: `1px solid ${T.border}`,
            boxShadow: '0 -4px 14px rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'center',
            padding: '12px 16px 20px', gap: 12,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: 112, height: 48, border: `1.5px solid ${T.pink}`, borderRadius: 10,
              padding: '0 10px', flexShrink: 0, background: T.white,
            }}>
              <button onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Decrease quantity"
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 4px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14" stroke={T.pink} strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 17, color: T.pink, minWidth: 16, textAlign: 'center' }}>{qty}</span>
              <button onClick={() => setQty(q => Math.min(99, q + 1))} aria-label="Increase quantity"
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 4px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke={T.pink} strokeWidth="2.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <button
              onClick={() => {
                if (submittingRef.current) return;
                submittingRef.current = true;
                if (isEditing) {
                  onReplaceCartItem!(editingCartItem!, product, qty, undefined, undefined);
                } else {
                  onAddToCart?.(product, qty);
                }
                onClose();
              }}
              style={{
                flex: 1, height: 48, background: T.pink, border: 'none',
                borderRadius: 10, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(239,89,161,0.35)',
                padding: '0 12px',
              }}
            >
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 700,
                fontSize: 15, lineHeight: '20px', color: '#FFFFFF',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{isEditing ? 'Update' : 'Add Item'} · {CURR}{totalPrice}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── BROWSE OVERLAY ────────────────────────────────────────────────────────────
function SearchOverlay({
  products, categories, onClose, onSelectProduct, tier, currencyCode = 'INR',
}: {
  products: MenuProduct[];
  categories: string[];
  onClose: () => void;
  onSelectProduct: (p: MenuProduct) => void;
  tier: Tier;
  currencyCode?: 'INR' | 'AED';
}) {
  useBodyScrollLock();

  const [query, setQuery] = useState('');
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => inputRef.current?.focus(), 80);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // Escape key closes overlay
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();

  const results = (q || activeChip)
    ? products.filter(p => {
        const textMatch = !q || (
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q)
        );
        const chipMatch = !activeChip || (p.category ?? '').toLowerCase() === activeChip.toLowerCase();
        return textMatch && chipMatch;
      })
    : [];

  const handleSelect = (p: MenuProduct) => {
    onSelectProduct(p);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Browse menu"
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: T.white,
        display: 'flex', flexDirection: 'column',
        animation: 'qrFadeIn 0.15s ease',
        maxWidth: 560, margin: '0 auto',
      }}
    >
      {/* ── PILL INPUT BAR ── */}
      <div style={{ padding: '20px 16px 0', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0,
          background: '#F9F9F9', border: '1px solid #EBEBEB',
          borderRadius: 100, padding: '0 16px',
          height: 43,
        }}>
          {/* Back arrow */}
          <button
            onClick={onClose}
            aria-label="Go back"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, display: 'flex', alignItems: 'center',
              marginRight: 8,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="#000000" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Text input — 15px prevents iOS auto-zoom on focus */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search for dishes, cuisines…"
            style={{
              flex: 1, border: 'none', background: 'transparent', outline: 'none',
              fontFamily: "'Poppins',sans-serif", fontWeight: 500,
              fontSize: 15, lineHeight: '20px', color: '#191919',
            }}
          />

          {/* Close X */}
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, display: 'flex', alignItems: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="#000000" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── CATEGORY CHIP ROW ── */}
      <div style={{
        padding: '16px 16px 0', flexShrink: 0,
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{
          display: 'flex', flexDirection: 'row', alignItems: 'center',
          gap: 12, width: 'max-content',
        }}>
          {/* "All" chip — clears category filter; honest about its behavior (no fake dropdown) */}
          <button
            onClick={() => setActiveChip(null)}
            style={{
              display: 'flex', alignItems: 'center',
              padding: '8px 16px', height: 36,
              border: `0.65px solid ${!activeChip ? T.pink : '#D1D5DC'}`,
              borderRadius: 40, background: !activeChip ? '#FFF0F8' : T.white,
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <span style={{
              fontFamily: "'Poppins',sans-serif", fontWeight: !activeChip ? 600 : 400,
              fontSize: 14, lineHeight: '20px', letterSpacing: '-0.15px',
              color: !activeChip ? T.pink : '#0A0A0A', whiteSpace: 'nowrap',
            }}>All</span>
          </button>

          {/* Category chips */}
          {categories.map(cat => {
            const isActive = activeChip === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveChip(isActive ? null : cat)}
                style={{
                  display: 'flex', alignItems: 'center',
                  padding: '8px 12px', height: 36,
                  border: `0.65px solid ${isActive ? T.pink : '#D1D5DC'}`,
                  borderRadius: 40,
                  background: isActive ? '#FFF0F8' : T.white,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                <span style={{
                  fontFamily: "'Poppins',sans-serif", fontWeight: 400,
                  fontSize: 14, lineHeight: '20px', letterSpacing: '-0.15px',
                  color: '#0A0A0A', whiteSpace: 'nowrap',
                }}>{cat}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── RESULTS LIST ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 80px' }}>
        {(q || activeChip) ? (
          results.length === 0 ? (
            <div style={{ paddingTop: 48, textAlign: 'center' }}>
              <p style={{
                fontFamily: "'Poppins',sans-serif", fontSize: 14, color: T.lightGray,
              }}>No items found</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {results.map(p => (
                <BrowseResultCard key={p.id} product={p} tier={tier} onSelect={handleSelect} currencyCode={currencyCode} />
              ))}
            </div>
          )
        ) : (
          <div style={{ paddingTop: 48, textAlign: 'center' }}>
            <p style={{
              fontFamily: "'Poppins',sans-serif", fontSize: 14, color: T.lightGray,
            }}>Type to find dishes or tap a category above</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── BROWSE RESULT CARD ────────────────────────────────────────────────────────
function BrowseResultCard({
  product: p, tier, onSelect, currencyCode = 'INR',
}: {
  product: MenuProduct;
  tier: Tier;
  onSelect: (p: MenuProduct) => void;
  currencyCode?: 'INR' | 'AED';
}) {
  const CURR = currencyCode === 'AED' ? 'AED ' : '₹';
  const desc = hasRealVariants(p.metadata) ? getVariantDishDesc(p.description) : p.description;

  return (
    <div
      className="qr-card"
      onClick={() => onSelect(p)}
      style={{
        position: 'relative', width: '100%', height: 138,
        background: T.cardBg, border: `1px solid ${T.border}`,
        borderRadius: 6, cursor: 'pointer',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        position: 'absolute', right: 8, top: 8,
        width: 108, height: 108, borderRadius: 10, overflow: 'hidden',
        background: T.white,
      }}>
        {p.image_url
          ? <img src={p.image_url} alt={p.name} loading="lazy" decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <ImgPlaceholder size={108} />
        }
        <QuadrantBadge quadrant={p.ks_quadrant} />
      </div>

      {/* Veg dot + Name */}
      <div style={{
        position: 'absolute', left: 8, top: 8, right: 124,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <VegDot foodType={p.food_type} />
        <p style={{
          margin: 0, flex: 1,
          fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14,
          lineHeight: '21px', color: T.nameColor,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>{p.name}</p>
      </div>

      {/* Description */}
      {desc && (
        <p style={{
          position: 'absolute', left: 8, top: 33, right: 124, margin: 0,
          fontFamily: "'Poppins',sans-serif", fontWeight: 300, fontSize: 10,
          lineHeight: '16px', letterSpacing: '0.0161em', color: T.descColor,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        } as React.CSSProperties}>{desc}</p>
      )}

      {/* Price */}
      <p style={{
        position: 'absolute', left: 8, bottom: 8, margin: 0,
        fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16,
        lineHeight: '24px', color: T.pink,
      }}>{CURR}{p.selling_price}</p>

      {/* ADD button */}
      {(tier === 'order' || tier === 'order_no_pay') && (
        <button
          onClick={e => { e.stopPropagation(); onSelect(p); }}
          aria-label={`Add ${p.name} to cart`}
          style={{
            position: 'absolute', right: 33, bottom: 6,
            width: 57, height: 26, borderRadius: 14,
            border: `1px solid ${T.pink}`, background: T.white, color: T.pink,
            fontFamily: "'Manrope',sans-serif", fontWeight: 700,
            fontSize: 12, cursor: 'pointer',
            boxShadow: '0px 2px 6px rgba(0,0,0,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >ADD</button>
      )}
    </div>
  );
}

// ── MAIN TEMPLATE ─────────────────────────────────────────────────────────────
export default function QRMenuTemplate({
  shopName, shopTagline, logoUrl, menuProducts, banners, tier, shopId, shopSlug, tableNumber, gstRatePct = 0, whatsappOrderTaking = false, currencyCode = 'INR',
}: QRMenuTemplateProps) {
  const CURR = currencyCode === 'AED' ? 'AED ' : '₹';
  const canOrder = tier === 'order' || tier === 'order_no_pay';
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeProduct, setActiveProduct] = useState<MenuProduct | null>(null);
  const [activeBanner, setActiveBanner] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [myOrdersOpen, setMyOrdersOpen] = useState(false);
  const [bannerPaused, setBannerPaused] = useState(false);
  // Whether the restaurant has connected a Razorpay account. Default to true so
  // the option doesn't flicker off on slow networks; we hide it once we know.
  const [onlineEnabled, setOnlineEnabled] = useState(true);
  useEffect(() => {
    if (!canOrder || tier === 'order_no_pay') return;
    let cancelled = false;
    fetch(`/api/shop/payment-options?siteId=${encodeURIComponent(shopId)}`)
      .then(r => r.ok ? r.json() : { onlineEnabled: false })
      .then(d => { if (!cancelled) setOnlineEnabled(!!d.onlineEnabled); })
      .catch(() => { if (!cancelled) setOnlineEnabled(false); });
    return () => { cancelled = true; };
  }, [shopId, canOrder, tier]);

  // ── MY ORDERS (localStorage-backed, today only, this shop only) ───────────
  const LS_ORDERS = `bys_orders_${shopId}`;
  interface SavedOrder { orderId: string; orderNumber: string; tokenNumber?: string; counterNumber?: string; paymentMethod?: string; tableNumber?: number; ts: number; }

  const saveOrder = useCallback((o: SavedOrder) => {
    try {
      const today = new Date().toDateString();
      const existing: SavedOrder[] = JSON.parse(localStorage.getItem(LS_ORDERS) ?? '[]');
      const todayOnly = existing.filter(x => new Date(x.ts).toDateString() === today);
      const deduped = todayOnly.filter(x => x.orderId !== o.orderId);
      localStorage.setItem(LS_ORDERS, JSON.stringify([o, ...deduped].slice(0, 20)));
    } catch { /* quota */ }
  }, [LS_ORDERS]);

  const getTodayOrders = useCallback((): SavedOrder[] => {
    try {
      const today = new Date().toDateString();
      const all: SavedOrder[] = JSON.parse(localStorage.getItem(LS_ORDERS) ?? '[]');
      return all.filter(x => new Date(x.ts).toDateString() === today);
    } catch { return []; }
  }, [LS_ORDERS]);

  const [todayOrders, setTodayOrders] = useState<SavedOrder[]>([]);
  useEffect(() => { setTodayOrders(getTodayOrders()); }, [getTodayOrders]);

  // ── CART STATE (sessionStorage-backed so refreshes don't lose the flow) ──
  // Start with empty defaults so SSR and initial client render match (no hydration mismatch).
  // sessionStorage is restored in useEffect after mount.
  const SS_CART      = `bys_cart_${shopId}`;
  const SS_WAITING   = `bys_waiting_${shopId}`;
  const SS_CONFIRMED = `bys_confirmed_${shopId}`;

  const [cart, setCartRaw] = useState<CartItem[]>([]);
  const setCart = useCallback((updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    setCartRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { sessionStorage.setItem(SS_CART, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, [SS_CART]);

  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'online' | 'counter'>('online');
  const effectivePaymentMethod = tier === 'order_no_pay' ? 'no_payment' : selectedPaymentMethod;
  const [billReqState, setBillReqState] = useState<'idle' | 'confirming' | 'sending' | 'sent' | 'cooldown'>('idle');
  const [confirmedOrder, setConfirmedOrderRaw] = useState<{
    id: string; number: string; paymentMethod: 'online' | 'counter' | 'no_payment'; tokenNumber?: string;
  } | null>(null);
  // Snapshot of cart items at confirm time — survives refresh so the bill still renders correctly
  const [confirmedCart, setConfirmedCart] = useState<CartItem[]>([]);
  const [confirmedSubtotal, setConfirmedSubtotal] = useState(0);

  const setConfirmedOrder = useCallback((
    val: { id: string; number: string; paymentMethod: 'online' | 'counter' | 'no_payment'; tokenNumber?: string } | null,
    cartSnapshot?: CartItem[],
    subtotalSnapshot?: number,
  ) => {
    setConfirmedOrderRaw(val);
    if (cartSnapshot !== undefined) setConfirmedCart(cartSnapshot);
    if (subtotalSnapshot !== undefined) setConfirmedSubtotal(subtotalSnapshot);
    try {
      if (val) {
        sessionStorage.setItem(SS_CONFIRMED, JSON.stringify({
          order: val,
          cart: cartSnapshot ?? [],
          subtotal: subtotalSnapshot ?? 0,
        }));
      } else {
        sessionStorage.removeItem(SS_CONFIRMED);
      }
    } catch { /* quota */ }
  }, [SS_CONFIRMED]);
  const [counterWaiting, setCounterWaitingRaw] = useState<{
    id: string; counterNumber: string;
  } | null>(null);
  const setCounterWaiting = useCallback((val: { id: string; counterNumber: string } | null) => {
    setCounterWaitingRaw(val);
    try {
      if (val) sessionStorage.setItem(SS_WAITING, JSON.stringify(val));
      else sessionStorage.removeItem(SS_WAITING);
    } catch { /* quota */ }
  }, [SS_WAITING]);

  // Restore persisted state from sessionStorage after hydration
  useEffect(() => {
    try {
      const cartRaw = sessionStorage.getItem(SS_CART);
      if (cartRaw) setCartRaw(JSON.parse(cartRaw) as CartItem[]);
    } catch { /* ignore */ }
    try {
      const waitingRaw = sessionStorage.getItem(SS_WAITING);
      if (waitingRaw) setCounterWaitingRaw(JSON.parse(waitingRaw));
    } catch { /* ignore */ }
    try {
      const confirmedRaw = sessionStorage.getItem(SS_CONFIRMED);
      if (confirmedRaw) {
        const parsed = JSON.parse(confirmedRaw) as {
          order: { id: string; number: string; paymentMethod: 'online' | 'counter' | 'no_payment'; tokenNumber?: string };
          cart: CartItem[];
          subtotal: number;
        };
        setConfirmedOrderRaw(parsed.order);
        setConfirmedCart(parsed.cart);
        setConfirmedSubtotal(parsed.subtotal);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cartItemCount = cart.reduce((sum, i) => sum + i.qty, 0);
  const cartSubtotal  = Math.round(cart.reduce((sum, i) => sum + i.price * i.qty, 0) * 100) / 100;

  const addToCart = useCallback((product: MenuProduct, qty: number, variantSize?: string, priceOverride?: number) => {
    const variants = Array.isArray(product.metadata?.variants)
      ? (product.metadata!.variants as { size: string; price: number | string }[])
      : [];
    const basePrice = variantSize
      ? Number(variants.find(v => v.size === variantSize)?.price ?? product.selling_price)
      : product.selling_price;
    const price = priceOverride ?? basePrice;

    setCart(prev => {
      const key = `${product.id}-${variantSize ?? ''}`;
      const existing = prev.find(i => `${i.id}-${i.variantSize ?? ''}` === key);
      if (existing) {
        return prev.map(i =>
          `${i.id}-${i.variantSize ?? ''}` === key
            ? { ...i, price, qty: Math.min(99, i.qty + qty) } : i,
        );
      }
      return [...prev, { id: product.id, name: product.name, price, qty, image_url: product.image_url, variantSize, food_type: product.food_type }];
    });
  }, []);

  const updateQty = useCallback((id: string, variantSize: string | undefined, delta: number) => {
    setCart(prev => prev.map(i =>
      i.id === id && i.variantSize === variantSize
        ? { ...i, qty: Math.min(99, Math.max(1, i.qty + delta)) } : i,
    ));
  }, []);

  const removeFromCart = useCallback((id: string, variantSize: string | undefined) => {
    setCart(prev => prev.filter(i => !(i.id === id && i.variantSize === variantSize)));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    try { sessionStorage.removeItem(SS_CART); } catch { /* quota */ }
  }, [setCart, SS_CART]);

  // ── EDIT MODE ─────────────────────────────────────────────────────────────
  const [editingCartItem, setEditingCartItem] = useState<CartItem | null>(null);
  const editingCartItemRef = useRef<CartItem | null>(null);

  const replaceInCart = useCallback((
    oldItem: CartItem,
    product: MenuProduct,
    qty: number,
    variantSize?: string,
    priceOverride?: number,
  ) => {
    const variants = Array.isArray(product.metadata?.variants)
      ? (product.metadata!.variants as { size: string; price: number | string }[]) : [];
    const basePrice = variantSize
      ? Number(variants.find(v => v.size === variantSize)?.price ?? product.selling_price)
      : product.selling_price;
    const price = priceOverride ?? basePrice;
    setCart(prev => {
      const oldKey = `${oldItem.id}-${oldItem.variantSize ?? ''}`;
      const newKey = `${product.id}-${variantSize ?? ''}`;
      const filtered = prev.filter(i => `${i.id}-${i.variantSize ?? ''}` !== oldKey);
      const existing = filtered.find(i => `${i.id}-${i.variantSize ?? ''}` === newKey);
      if (existing) {
        return filtered.map(i =>
          `${i.id}-${i.variantSize ?? ''}` === newKey
            ? { ...i, price, qty: Math.min(99, i.qty + qty) } : i,
        );
      }
      return [...filtered, { id: product.id, name: product.name, price, qty, image_url: product.image_url, variantSize, food_type: product.food_type }];
    });
  }, []);

  // Memoized derived data
  const categories = useMemo(
    () => Array.from(new Set(menuProducts.map(p => p.category).filter(Boolean) as string[])),
    [menuProducts],
  );

  const visibleBanners = useMemo(
    () => banners.filter(b => b.image_url),
    [banners],
  );

  const sections = useMemo(() => {
    if (activeCategory !== 'All') {
      return [{ category: activeCategory, products: menuProducts.filter(p => p.category === activeCategory) }];
    }
    const map = new Map<string, MenuProduct[]>();
    for (const p of menuProducts) {
      const cat = p.category ?? 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return Array.from(map.entries()).map(([category, products]) => ({ category, products }));
  }, [menuProducts, activeCategory]);

  // Keep activeBanner in bounds when banners change
  useEffect(() => {
    if (activeBanner >= visibleBanners.length) setActiveBanner(0);
  }, [visibleBanners.length, activeBanner]);

  // Back-navigation: push a history entry for each overlay
  const openProduct = (p: MenuProduct) => {
    window.history.pushState({ qrSheet: 'product' }, '');
    setActiveProduct(p);
  };
  const openProductForEdit = (p: MenuProduct, item: CartItem) => {
    editingCartItemRef.current = item;
    setEditingCartItem(item);
    setCartOpen(false);
    setActiveProduct(p); // no history push — edit mode manages its own close
  };
  const openSearch = () => {
    window.history.pushState({ qrSheet: 'search' }, '');
    setSearchOpen(true);
  };
  const closeProduct = () => {
    if (editingCartItemRef.current) {
      // Edit mode: return to cart regardless
      editingCartItemRef.current = null;
      setEditingCartItem(null);
      setActiveProduct(null);
      setCartOpen(true);
      return;
    }
    // Unmount the modal synchronously so the user sees instant feedback and
    // a rapid second tap can't re-trigger any handlers on a still-mounted sheet.
    // Then call history.back() to clean up the history entry we pushed on open.
    setActiveProduct(null);
    if (window.history.state?.qrSheet === 'product') window.history.back();
  };
  const closeSearch = () => {
    if (window.history.state?.qrSheet === 'search') window.history.back();
    else setSearchOpen(false);
  };

  useEffect(() => {
    const onPop = () => {
      const sheet = window.history.state?.qrSheet;
      if (sheet === 'product') setActiveProduct(null);
      else if (sheet === 'search') setSearchOpen(false);
      else { setActiveProduct(null); setSearchOpen(false); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Auto-slide banners — pause when overlays are open or user manually interacted
  useEffect(() => {
    if (visibleBanners.length <= 1 || bannerPaused || activeProduct || searchOpen) return;
    const id = setInterval(() => {
      setActiveBanner(i => (i + 1) % visibleBanners.length);
    }, 3000);
    return () => clearInterval(id);
  }, [visibleBanners.length, bannerPaused, activeProduct, searchOpen]);

  const handleDotClick = (i: number) => {
    setActiveBanner(i);
    setBannerPaused(true);
    setTimeout(() => setBannerPaused(false), 8000);
  };

  return (
    <>
      <style>{`
        @keyframes qrFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes qrSlideUp { from{transform:translateY(40px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes qrCartIn  { from{transform:translate(-50%,80px);opacity:0} to{transform:translate(-50%,0);opacity:1} }
        .qr-wrap * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
        .qr-wrap *::-webkit-scrollbar { display:none; }
        .qr-wrap * { scrollbar-width:none; }
        .qr-shell { width:100%; min-height:100dvh; background:${T.white}; display:flex; flex-direction:column; }
        .qr-chips { display:flex; flex-direction:row; align-items:center; padding:12px 16px; gap:12px; overflow-x:auto; background:${T.white}; min-height:60px; }
        .qr-card { cursor:pointer; transition:box-shadow 0.12s; }
        .qr-card:hover  { box-shadow:0 2px 12px rgba(0,0,0,0.07); }
        .qr-card:active { box-shadow:none; opacity:0.9; }
        .qr-section-hdr { display:flex; flex-direction:row; justify-content:space-between; align-items:center; padding:0px 10px 0px 16px; width:100%; height:24px; }
      `}</style>

      <div className="qr-wrap qr-shell">

        {/* ── STICKY HEADER ── */}
        <header style={{
          background: T.white, borderBottom: `1px solid ${T.border}`,
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 50,
        }}>
          <button
            aria-label="My orders"
            onClick={() => { setTodayOrders(getTodayOrders()); setMyOrdersOpen(true); }}
            style={{ position: 'relative', width: 36, height: 36, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.dark} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M9 12h6M9 16h4"/>
            </svg>
            {todayOrders.length > 0 && (
              <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: T.pink, border: `2px solid ${T.white}` }} />
            )}
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {logoUrl && (
                <img src={logoUrl} alt={shopName}
                  style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
              )}
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16,
                color: T.pink, letterSpacing: '0.5px', textTransform: 'uppercase',
              }}>{shopName}</span>
            </div>
            {shopTagline && (
              <span style={{
                fontFamily: "'Manrope',sans-serif", fontWeight: 400, fontSize: 11,
                color: T.descColor, letterSpacing: '0.01em',
              }}>{shopTagline}</span>
            )}
          </div>

          <button
            aria-label="Search menu"
            onClick={openSearch}
            style={{
              width: 36, height: 36, border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke={T.dark} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </button>
        </header>

        {/* ── BANNER ── */}
        {visibleBanners.length > 0 && (
          <div style={{ padding: '10px 12px 0' }}>
            <div
              role="region"
              aria-label="Promotional banners"
              style={{ position: 'relative', borderRadius: 6, overflow: 'hidden' }}
            >
              <div style={{
                display: 'flex',
                transform: `translateX(-${activeBanner * 100}%)`,
                transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                willChange: 'transform',
              }}>
                {visibleBanners.map((b, i) => (
                  <img
                    key={b.id}
                    src={b.image_url!}
                    alt={b.name}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding={i === 0 ? 'sync' : 'async'}
                    style={{
                      width: '100%', flexShrink: 0,
                      aspectRatio: '351/134', objectFit: 'cover', display: 'block',
                    }}
                  />
                ))}
              </div>
              {visibleBanners.length > 1 && (
                <div
                  role="tablist"
                  aria-label="Banner navigation"
                  style={{
                    position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', gap: 4,
                  }}
                >
                  {visibleBanners.map((_, i) => (
                    <button
                      key={i}
                      role="tab"
                      aria-label={`Banner ${i + 1} of ${visibleBanners.length}`}
                      aria-selected={i === activeBanner}
                      onClick={() => handleDotClick(i)}
                      style={{
                        width: i === activeBanner ? 18 : 6, height: 6, borderRadius: 100,
                        background: i === activeBanner ? T.white : 'rgba(255,255,255,0.55)',
                        border: 'none', padding: 0, cursor: 'pointer', transition: 'width 0.25s',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CATEGORY CHIPS + REQUEST BILL ── */}
        {(categories.length > 0 || (tier === 'order_no_pay' && tableNumber)) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: T.white, minHeight: 60 }}>
            {/* Category chips — scrollable */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {['All', ...categories].map(cat => {
                const on = cat === activeCategory;
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                    flexShrink: 0,
                    display: 'flex', flexDirection: 'row', alignItems: 'center',
                    padding: '8px 12px', gap: 8,
                    height: 36, borderRadius: 40,
                    border: `0.65px solid ${on ? T.pink : T.chipBorder}`,
                    background: on ? T.pink : T.white,
                    color: on ? T.white : T.chipText,
                    fontFamily: "'Poppins',sans-serif", fontWeight: 400, fontSize: 14,
                    lineHeight: '20px', letterSpacing: '-0.15px',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}>{cat}</button>
                );
              })}
            </div>

            {/* Request Bill — inline, right side of chip row */}
            {tier === 'order_no_pay' && tableNumber && (
              <button
                onClick={() => billReqState === 'idle' && setBillReqState('confirming')}
                disabled={billReqState === 'cooldown' || billReqState === 'sending' || billReqState === 'sent'}
                style={{
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                  height: 36, padding: '0 14px', borderRadius: 40,
                  border: billReqState === 'sent' || billReqState === 'cooldown'
                    ? '0.65px solid #86EFAC' : '0.65px solid #191919',
                  background: billReqState === 'sent' || billReqState === 'cooldown'
                    ? '#F0FDF4' : '#191919',
                  color: billReqState === 'sent' || billReqState === 'cooldown'
                    ? '#166534' : '#FFFFFF',
                  fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 13,
                  cursor: billReqState === 'idle' ? 'pointer' : 'default',
                  whiteSpace: 'nowrap', transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 14 }}>🧾</span>
                {billReqState === 'sent' || billReqState === 'cooldown' ? 'Bill Sent' : 'Request Bill'}
              </button>
            )}
          </div>
        )}

        {/* ── PRODUCT SECTIONS ── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', gap: 20,
          // Reserve space for the floating cart bar (64px) + 14px float margin + safe-area, plus a touch of breathing room
          paddingBottom: canOrder && cartItemCount > 0 ? 'calc(110px + env(safe-area-inset-bottom, 0px))' : 24,
        }}>
          {sections.map(({ category, products }) => (
            <div key={category} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: 0, gap: 10, width: '100%',
            }}>
              <div className="qr-section-hdr">
                <span style={{
                  fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 16,
                  lineHeight: '24px', color: T.dark,
                }}>{category}</span>
              </div>

              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
                width: '100%', padding: '0 16px',
              }}>
                {products.map(p => {
                  const desc = hasRealVariants(p.metadata) ? getVariantDishDesc(p.description) : p.description;
                  const discountActive = p.metadata?.discount_enabled && p.metadata?.original_price;
                  const discountPct = numMeta(p.metadata?.discount_pct);

                  return (
                    <div
                      key={p.id}
                      className="qr-card"
                      onClick={() => openProduct(p)}
                      style={{
                        position: 'relative', width: '100%', height: 138,
                        background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 6,
                      }}
                    >
                      {/* Thumbnail */}
                      <div style={{
                        position: 'absolute', right: 8, top: 8,
                        width: 108, height: 108, borderRadius: 10, overflow: 'hidden', background: T.white,
                      }}>
                        {p.image_url
                          ? <img src={p.image_url} alt={p.name} loading="lazy" decoding="async"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <ImgPlaceholder size={108} />
                        }
                        <QuadrantBadge quadrant={p.ks_quadrant} />
                      </div>

                      {/* Name row */}
                      <div style={{ position: 'absolute', left: 8, top: 8, right: 124, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <VegDot foodType={p.food_type} />
                        <p style={{
                          margin: 0, flex: 1,
                          fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14,
                          lineHeight: '21px', color: T.nameColor,
                          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                        }}>{p.name}</p>
                      </div>

                      {/* Description */}
                      {desc && (
                        <p style={{
                          position: 'absolute', left: 8, top: 33, right: 124, margin: 0,
                          fontFamily: "'Poppins',sans-serif", fontWeight: 300, fontSize: 10,
                          lineHeight: '16px', letterSpacing: '0.0161em', color: T.descColor,
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        } as React.CSSProperties}>{desc}</p>
                      )}

                      {/* Price */}
                      {discountActive && discountPct > 0 ? (
                        <div style={{ position: 'absolute', left: 11, bottom: 8, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                            <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 18, lineHeight: '25px', letterSpacing: '0.0161em', color: T.pink }}>
                              {CURR}{p.selling_price}
                            </span>
                            <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 400, fontSize: 10, lineHeight: '14px', textDecoration: 'line-through', color: T.descColor, alignSelf: 'center' }}>
                              MRP {numMeta(p.metadata?.original_price)}
                            </span>
                          </div>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            padding: '2px 6px', background: '#13801C', borderRadius: 3,
                            fontFamily: "'Manrope',sans-serif", fontWeight: 600,
                            fontSize: 11, lineHeight: '15px', color: '#FFFFFF', whiteSpace: 'nowrap',
                          }}>Flat {discountPct}% Off</span>
                        </div>
                      ) : (
                        <p style={{
                          position: 'absolute', left: 8, bottom: 8, margin: 0,
                          fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16,
                          lineHeight: '24px', color: T.pink,
                        }}>{CURR}{p.selling_price}</p>
                      )}

                      {/* ADD / Qty stepper */}
                      {canOrder && (() => {
                        const cartQty = cart.filter(i => i.id === p.id).reduce((s, i) => s + i.qty, 0);
                        const hasVariants = Array.isArray(p.metadata?.variants) && (p.metadata!.variants as unknown[]).length > 0;
                        if (cartQty > 0 && hasVariants) {
                          return (
                            <div
                              onClick={e => e.stopPropagation()}
                              style={{
                                position: 'absolute', right: 20, bottom: 6,
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                width: 84, height: 28, borderRadius: 14,
                                background: T.pink,
                                boxShadow: '0px 4px 10px rgba(239,89,161,0.45)',
                              }}
                            >
                              <button
                                onClick={e => { e.stopPropagation(); openProduct(p); }}
                                aria-label="Edit variants"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px', display: 'flex', alignItems: 'center' }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round"/></svg>
                              </button>
                              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13, color: '#FFFFFF' }}>{cartQty}</span>
                              <button
                                onClick={e => { e.stopPropagation(); openProduct(p); }}
                                aria-label="Add more"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px', display: 'flex', alignItems: 'center' }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round"/></svg>
                              </button>
                            </div>
                          );
                        }
                        if (cartQty > 0 && !hasVariants) {
                          return (
                            <div
                              onClick={e => e.stopPropagation()}
                              style={{
                                position: 'absolute', right: 20, bottom: 6,
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                width: 84, height: 28, borderRadius: 14,
                                background: T.pink,
                                boxShadow: '0px 4px 10px rgba(239,89,161,0.45)',
                              }}
                            >
                              <button
                                onClick={e => { e.stopPropagation(); if (cartQty > 1) { updateQty(p.id, undefined, -1); } else { removeFromCart(p.id, undefined); } }}
                                aria-label="Decrease"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px', display: 'flex', alignItems: 'center' }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round"/></svg>
                              </button>
                              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 13, color: '#FFFFFF' }}>{cartQty}</span>
                              <button
                                onClick={e => { e.stopPropagation(); addToCart(p, 1); }}
                                aria-label="Increase"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px', display: 'flex', alignItems: 'center' }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round"/></svg>
                              </button>
                            </div>
                          );
                        }
                        return (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (hasVariants) { openProduct(p); }
                              else { addToCart(p, 1); }
                            }}
                            aria-label={`Add ${p.name} to cart`}
                            style={{
                              position: 'absolute', right: 33, bottom: 6,
                              width: 57, height: 26, borderRadius: 14,
                              border: `1px solid ${T.pink}`, background: T.white, color: T.pink,
                              fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 12, lineHeight: '12px',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: '0px 2px 6px rgba(0,0,0,0.12)',
                            }}
                          >ADD</button>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {sections.length === 0 && (
            <div style={{ padding: '56px 16px', textAlign: 'center' }}>
              <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: T.lightGray }}>
                No items available right now.
              </p>
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          padding: '32px 16px 48px', background: T.white,
          borderTop: `1px solid ${T.border}`,
          position: 'relative', overflow: 'hidden',
        }}>
          <p style={{
            fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 26,
            lineHeight: '37px', color: T.lightGray, margin: '0 0 8px', maxWidth: 256,
          }}>Skip the queue. Scan &amp; order</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 13.5S1.5 9.5 1.5 5.5A3.5 3.5 0 0 1 8 3.2 3.5 3.5 0 0 1 14.5 5.5C14.5 9.5 8 13.5 8 13.5Z" fill="#F9595F" />
            </svg>
            <span style={{
              fontFamily: "'Manrope',sans-serif", fontWeight: 600, fontSize: 12,
              lineHeight: '16px', color: T.footerSub,
            }}>Crafted in தமிழ்நாடு</span>
          </div>
        </div>

      </div>

      {/* ── FLOATING CART BAR (original design — floats with edge margin) ── */}
      {canOrder && cartItemCount > 0 && !cartOpen && !checkoutOpen && !confirmedOrder && !counterWaiting && (
        <div style={{
          position: 'fixed',
          bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
          left: '50%', transform: 'translateX(-50%)',
          zIndex: 100,
          width: 'calc(100% - 28px)', maxWidth: 532, height: 70,
          background: 'linear-gradient(271.56deg, #FFFFFF 1.98%, #FFF6EB 99.55%)',
          borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px',
          boxShadow: '0 10px 26px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)',
          animation: 'qrCartIn 0.34s cubic-bezier(0.34,1.32,0.64,1)',
        }}>
          {/* Left: dish thumbnails + text */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Overlapping dish image circles */}
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: Math.min(cart.length, 3) * 20 + 12, height: 32, flexShrink: 0 }}>
              {cart.slice(0, 3).map((item, i) => (
                <div key={`${item.id}-${item.variantSize ?? ''}`} style={{
                  position: 'absolute', left: i * 20, top: 0,
                  width: 32, height: 32, borderRadius: 20,
                  background: T.white, border: '1px solid #EEEAFF',
                  overflow: 'hidden', zIndex: 3 - i,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {i < 2 && item.image_url ? (
                    <img src={item.image_url} alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : i === 2 && cart.length > 3 ? (
                    <div style={{
                      width: '100%', height: '100%',
                      background: item.image_url
                        ? `linear-gradient(0deg, rgba(0,0,0,0.34), rgba(0,0,0,0.34)), url(${item.image_url}) center/cover`
                        : 'rgba(0,0,0,0.34)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{
                        fontFamily: "'Manrope',sans-serif", fontWeight: 700,
                        fontSize: 12, lineHeight: '16px', color: '#FFFFFF',
                      }}>+{cart.length - 2}</span>
                    </div>
                  ) : item.image_url ? (
                    <img src={item.image_url} alt={item.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#F0F0F0' }} />
                  )}
                </div>
              ))}
            </div>

            {/* Text: "X Dishes Added" */}
            <span style={{
              fontFamily: "'Poppins',sans-serif", fontWeight: 500,
              fontSize: 14, lineHeight: '21px', color: '#333333',
            }}>{cartItemCount} Dish{cartItemCount !== 1 ? 'es' : ''} Added</span>
          </div>

          {/* Right: View Cart button */}
          <button
            onClick={() => setCartOpen(true)}
            style={{
              display: 'flex', alignItems: 'center',
              height: 46, background: '#00A63E',
              border: 'none', borderRadius: 8, cursor: 'pointer',
              boxShadow: '0px 2px 6px rgba(0,166,62,0.30)',
              padding: '0 16px', gap: 12, flexShrink: 0,
            }}
          >
            {/* Price + Total label */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                fontSize: 14, lineHeight: '21px', color: '#FFFFFF',
              }}>{CURR}{cartSubtotal}</span>
              <span style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 400,
                fontSize: 12, lineHeight: '18px', color: '#FFFFFF',
              }}>Total</span>
            </div>

            {/* Vertical divider */}
            <div style={{ width: 1, height: 34, background: '#FFFFFF', opacity: 0.5 }} />

            {/* View Cart text */}
            <span style={{
              fontFamily: "'Poppins',sans-serif", fontWeight: 400,
              fontSize: 14, lineHeight: '21px', color: '#FFFFFF',
              whiteSpace: 'nowrap',
            }}>View Cart</span>
          </button>
        </div>
      )}

      {/* ── SEARCH OVERLAY ── */}
      {searchOpen && (
        <SearchOverlay
          products={menuProducts}
          categories={categories}
          tier={tier}
          onClose={closeSearch}
          onSelectProduct={p => { openProduct(p); setSearchOpen(false); }}
          currencyCode={currencyCode}
        />
      )}

      {/* ── DETAIL SHEET ── */}
      {activeProduct && (
        <ProductDetailSheet
          product={activeProduct}
          tier={tier}
          onClose={closeProduct}
          onAddToCart={addToCart}
          editingCartItem={editingCartItem}
          onReplaceCartItem={replaceInCart}
          currencyCode={currencyCode}
        />
      )}

      {/* ── CART SHEET ── */}
      {cartOpen && (
        <CartSheet
          items={cart}
          onClose={() => setCartOpen(false)}
          onUpdateQty={updateQty}
          onRemove={removeFromCart}
          onAddMore={() => setCartOpen(false)}
          paymentMode={tier === 'order_no_pay' ? 'no_payment' : undefined}
          onlineEnabled={onlineEnabled}
          gstRatePct={gstRatePct}
          currencyCode={currencyCode}
          whatsappMode={whatsappOrderTaking && tier === 'order_no_pay'}
          onCheckout={(pm) => { if (pm !== 'no_payment') setSelectedPaymentMethod(pm); setCartOpen(false); setCheckoutOpen(true); }}
          onEditItem={(item) => {
            const product = menuProducts.find(p => p.id === item.id);
            if (product) openProductForEdit(product, item);
          }}
        />
      )}

      {/* ── CHECKOUT SCREEN ── */}
      {checkoutOpen && (
        <CheckoutScreen
          items={cart}
          siteId={shopId}
          paymentMethod={effectivePaymentMethod}
          tableNumber={tableNumber}
          gstRatePct={gstRatePct}
          currencyCode={currencyCode}
          whatsappMode={whatsappOrderTaking && tier === 'order_no_pay'}
          onClose={() => setCheckoutOpen(false)}
          onOrderPlaced={(id, number, pm, counterNumber, tokenNumber) => {
            setCheckoutOpen(false);
            if (pm === 'counter' && counterNumber) {
              setCounterWaiting({ id, counterNumber });
              saveOrder({ orderId: id, orderNumber: number, counterNumber, ts: Date.now() });
            } else {
              setConfirmedOrder({ id, number, paymentMethod: pm, tokenNumber }, cart, cartSubtotal);
              saveOrder({ orderId: id, orderNumber: number, tokenNumber, paymentMethod: pm, tableNumber, ts: Date.now() });
              setTodayOrders(getTodayOrders());
            }
          }}
        />
      )}

      {/* ── COUNTER WAITING SCREEN ── */}
      {counterWaiting && (
        <CounterWaitingScreen
          orderId={counterWaiting.id}
          counterNumber={counterWaiting.counterNumber}
          items={cart}
          subtotal={cartSubtotal}
          onTokenReceived={(tokenNumber) => {
            const waitingId = counterWaiting!.id;
            setCounterWaiting(null);
            setConfirmedOrder({ id: waitingId, number: tokenNumber, paymentMethod: 'counter', tokenNumber }, cart, cartSubtotal);
            saveOrder({ orderId: waitingId, orderNumber: tokenNumber, tokenNumber, ts: Date.now() });
            setTodayOrders(getTodayOrders());
          }}
          onCancel={() => { setCounterWaiting(null); clearCart(); }}
        />
      )}

      {/* ── ORDER CONFIRMED ── */}
      {confirmedOrder && (
        <OrderConfirmedScreen
          orderId={confirmedOrder.id}
          orderNumber={confirmedOrder.number}
          shopName={shopName}
          items={confirmedCart.length > 0 ? confirmedCart : cart}
          subtotal={confirmedSubtotal > 0 ? confirmedSubtotal : cartSubtotal}
          paymentMethod={confirmedOrder.paymentMethod}
          tokenNumber={confirmedOrder.tokenNumber}
          tableNumber={tableNumber}
          gstRatePct={gstRatePct}
          currencyCode={currencyCode}
          onDone={() => { clearCart(); setConfirmedOrder(null); }}
        />
      )}

      {/* ── MY ORDERS PANEL ── */}
      {myOrdersOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column' }}>
          {/* Backdrop */}
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.4)' }} onClick={() => setMyOrdersOpen(false)} />
          {/* Sheet */}
          <div style={{ background: T.white, borderRadius: '20px 20px 0 0', padding: '0 0 32px', maxHeight: '75vh', overflowY: 'auto' }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border }} />
            </div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px 16px' }}>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 17, color: T.dark }}>My Orders Today</span>
              <button onClick={() => setMyOrdersOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.lightGray} strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {todayOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 24px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={T.border} strokeWidth="1.8" strokeLinecap="round" style={{ marginBottom: 12 }}>
                  <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                  <rect x="9" y="3" width="6" height="4" rx="1"/>
                  <path d="M9 12h6M9 16h4"/>
                </svg>
                <p style={{ margin: 0, fontSize: 14, color: T.descColor }}>No orders placed today</p>
              </div>
            ) : (
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {todayOrders.map(o => {
                  const isNoPayment = o.paymentMethod === 'no_payment';
                  const displayId = isNoPayment
                    ? (o.tableNumber ? `Table ${o.tableNumber}` : (o.tokenNumber ?? `#${o.orderNumber}`))
                    : (o.tokenNumber ?? o.counterNumber ?? `#${o.orderNumber}`);
                  const isToken = !!o.tokenNumber && !isNoPayment;
                  const isCounter = !!o.counterNumber && !o.tokenNumber && !isNoPayment;
                  const timeStr = new Date(o.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                  return (
                    <a
                      key={o.orderId}
                      href={`/shop/${shopSlug}/order/${o.orderId}`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: T.cardBg, borderRadius: 12, textDecoration: 'none' }}
                    >
                      <div>
                        <p style={{ margin: '0 0 3px', fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 20, color: T.pink, lineHeight: 1 }}>{displayId}</p>
                        <p style={{ margin: 0, fontSize: 12, color: T.descColor }}>
                          {isNoPayment ? 'Order placed · ' : isToken ? 'Token ready · ' : isCounter ? 'Awaiting payment · ' : 'Online · '}{timeStr}
                        </p>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.descColor} strokeWidth="2.5" strokeLinecap="round">
                        <path d="M9 18l6-6-6-6"/>
                      </svg>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}


      {/* ── REQUEST BILL CONFIRMATION DIALOG ── */}
      {(billReqState === 'confirming' || billReqState === 'sending') && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setBillReqState('idle')}
        >
          <div
            style={{ background: '#FFFFFF', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '28px 24px 40px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🧾</div>
              <p style={{ margin: '0 0 6px', fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 18, color: '#191919' }}>Request Bill?</p>
              <p style={{ margin: 0, fontSize: 14, color: '#808080' }}>Notify staff to bring the bill for Table {tableNumber}.</p>
            </div>
            <button
              onClick={async () => {
                setBillReqState('sending');
                try {
                  const res = await fetch('/api/bill-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ siteId: shopId, tableNumber }),
                  });
                  if (res.ok || res.status === 429) {
                    setBillReqState('sent');
                    setTimeout(() => setBillReqState('cooldown'), 8000);
                  } else {
                    setBillReqState('idle');
                  }
                } catch {
                  setBillReqState('idle');
                }
              }}
              disabled={billReqState === 'sending'}
              style={{
                width: '100%', height: 52, borderRadius: 12, border: 'none',
                background: '#191919', color: '#FFFFFF',
                fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16,
                cursor: 'pointer', marginBottom: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {billReqState === 'sending' ? (
                <div style={{ width: 20, height: 20, border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              ) : 'Yes, call staff'}
            </button>
            <button
              onClick={() => setBillReqState('idle')}
              style={{ width: '100%', height: 44, borderRadius: 12, border: '1.5px solid #E6E6E6', background: '#FFFFFF', color: '#555555', fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 15, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
