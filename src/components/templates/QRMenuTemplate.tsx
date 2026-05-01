'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';

// ── VARIANT DESCRIPTION HELPERS ──────────────────────────────────────────────
function getVariantDishDesc(desc: string | null | undefined): string {
  if (!desc) return '';
  const idx = desc.indexOf(' || ');
  return idx >= 0 ? desc.slice(idx + 4).trim() : '';
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
export type Tier = 'view' | 'order';

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
      position: 'absolute', bottom: 0, left: 0, right: 0,
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

// ── PRODUCT DETAIL BOTTOM SHEET ───────────────────────────────────────────────
function ProductDetailSheet({
  product, tier, onClose, onAddToCart,
}: {
  product: MenuProduct | null;
  tier: Tier;
  onClose: () => void;
  onAddToCart?: (product: MenuProduct, qty: number, variantSize?: string) => void;
}) {
  useBodyScrollLock();

  const meta = product?.metadata ?? {};
  const variants = Array.isArray(meta.variants) && (meta.variants as unknown[]).length > 0
    ? (meta.variants as { size: string; price: number | string }[]) : null;
  const toppings = Array.isArray(meta.toppings) && (meta.toppings as unknown[]).length > 0
    ? (meta.toppings as { name: string; price: number | string }[]) : null;
  const comboItems = Array.isArray(meta.comboItems) && (meta.comboItems as unknown[]).length > 0
    ? (meta.comboItems as { name: string; qty: number | string }[]) : null;

  const productType: 'variant' | 'combo' | 'single' =
    variants ? 'variant' : comboItems ? 'combo' : 'single';

  const [qty, setQty] = useState(1);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);

  useEffect(() => { setQty(1); setSelectedVariantIdx(0); }, [product?.id]);

  // Escape key closes sheet
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!product) return null;

  const selectedVariantPrice = variants
    ? Number(variants[selectedVariantIdx]?.price ?? product.selling_price)
    : product.selling_price;
  const totalPrice = selectedVariantPrice * qty;

  const discountOn = !!(meta.discount_enabled) && !!(meta.original_price);
  const discountPct = numMeta(meta.discount_pct);

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
        background: T.white, borderRadius: '20px 20px 0 0',
        animation: 'qrSlideUp 0.28s cubic-bezier(0.34,1.2,0.64,1)',
        maxHeight: '92dvh', overflowY: 'auto',
        position: 'relative',
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 10,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(0,0,0,0.08)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke={T.dark} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Drag handle */}
        <div style={{ padding: '12px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 36, height: 4, borderRadius: 100, background: T.border }} />
        </div>

        {/* Hero image */}
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

        {/* Info */}
        <div style={{ padding: '14px 20px 32px' }}>
          {/* Veg dot + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <VegDot foodType={product.food_type} />
            <span style={{
              fontFamily: "'Poppins',sans-serif", fontWeight: 500,
              fontSize: 16, lineHeight: '24px', color: '#333333',
            }}>{product.name}</span>
          </div>

          {/* SINGLE: price row */}
          {productType === 'single' && (
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <span style={{
                  fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                  fontSize: 24, lineHeight: '36px', letterSpacing: '0.0161em', color: '#000000',
                }}>₹{product.selling_price}</span>
                {discountOn && (
                  <span style={{
                    fontFamily: "'Poppins',sans-serif", fontWeight: 400,
                    fontSize: 10, lineHeight: '15px', letterSpacing: '0.0161em',
                    textDecoration: 'line-through', color: '#808080',
                    alignSelf: 'flex-end', paddingBottom: 4,
                  }}>MRP {numMeta(meta.original_price)}</span>
                )}
              </div>
              {discountOn && discountPct > 0 && (
                <div style={{
                  display: 'flex', flexDirection: 'row', justifyContent: 'center',
                  alignItems: 'center', padding: '2px 6px',
                  background: '#13801C', borderRadius: 3,
                }}>
                  <span style={{
                    fontFamily: "'Poppins',sans-serif", fontWeight: 500,
                    fontSize: 11, lineHeight: '16px', letterSpacing: '0.0161em', color: '#FFFFFF',
                  }}>Flat {discountPct}% Off</span>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {(() => {
            const dishDesc = productType === 'variant'
              ? getVariantDishDesc(product.description)
              : product.description;
            return dishDesc ? (
              <p style={{
                fontFamily: "'Manrope',sans-serif", fontWeight: 500, fontSize: 12,
                lineHeight: '18px', letterSpacing: '0.0161em',
                color: '#666666', margin: '0 0 14px',
              }}>{dishDesc}</p>
            ) : null;
          })()}

          {/* VARIANT: selectable size + price list */}
          {productType === 'variant' && variants && (
            <>
              <div style={{ height: 1, background: T.border, margin: '0 0 14px' }} />

              {discountOn && discountPct > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '2px 8px', background: '#13801C', borderRadius: 3,
                    fontFamily: "'Poppins',sans-serif", fontWeight: 500,
                    fontSize: 11, lineHeight: '16px', color: '#FFFFFF',
                  }}>Flat {discountPct}% Off</span>
                </div>
              )}

              <p style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                fontSize: 13, color: T.dark, margin: '0 0 8px',
              }}>Choose size</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {variants.map((v, i) => {
                  const selected = i === selectedVariantIdx;
                  return (
                    <button
                      key={v.size}
                      onClick={() => setSelectedVariantIdx(i)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderBottom: i < variants.length - 1 ? `1px solid ${T.border}` : 'none',
                        borderRadius: selected ? 8 : 0,
                        background: selected ? '#FFF0F8' : 'transparent',
                        border: selected ? `1.5px solid ${T.pink}` : 'none',
                        cursor: 'pointer', width: '100%', textAlign: 'left',
                        marginBottom: i < variants.length - 1 ? 4 : 0,
                      }}
                    >
                      <span style={{
                        fontFamily: "'Manrope',sans-serif", fontWeight: 500,
                        fontSize: 14, lineHeight: '19px', color: '#333333',
                      }}>{v.size}</span>
                      <span style={{
                        fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                        fontSize: 15, lineHeight: '19px',
                        color: selected ? T.pink : '#000000',
                      }}>₹{v.price}</span>
                    </button>
                  );
                })}
              </div>

              {/* Add-ons */}
              {toppings && (
                <>
                  <div style={{ height: 1, background: T.border, margin: '14px 0' }} />
                  <p style={{
                    fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                    fontSize: 13, color: T.dark, margin: '0 0 8px',
                  }}>Add-ons <span style={{ fontWeight: 400, color: T.descColor }}>(optional)</span></p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {toppings.map((t) => (
                      <div
                        key={t.name}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 0',
                          borderBottom: `1px solid ${T.border}`,
                        }}
                      >
                        <span style={{
                          fontFamily: "'Manrope',sans-serif", fontWeight: 500,
                          fontSize: 14, lineHeight: '19px', color: '#333333',
                        }}>{t.name}</span>
                        <span style={{
                          fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                          fontSize: 14, color: T.pink,
                        }}>+₹{t.price}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* COMBO: price + included items */}
          {productType === 'combo' && comboItems && (
            <>
              <div style={{ height: 1, background: T.border, margin: '0 0 14px' }} />
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <span style={{
                    fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                    fontSize: 24, lineHeight: '36px', letterSpacing: '0.0161em', color: '#000000',
                  }}>₹{product.selling_price}</span>
                  {discountOn && (
                    <span style={{
                      fontFamily: "'Poppins',sans-serif", fontWeight: 400,
                      fontSize: 10, lineHeight: '15px', letterSpacing: '0.0161em',
                      textDecoration: 'line-through', color: '#808080', alignSelf: 'center',
                    }}>MRP {numMeta(meta.original_price)}</span>
                  )}
                </div>
                {discountOn && discountPct > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    padding: '2px 6px', background: '#13801C', borderRadius: 3,
                  }}>
                    <span style={{
                      fontFamily: "'Poppins',sans-serif", fontWeight: 500,
                      fontSize: 11, lineHeight: '16px', letterSpacing: '0.0161em', color: '#FFFFFF',
                    }}>Flat {discountPct}% Off</span>
                  </div>
                )}
              </div>

              <p style={{
                fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                fontSize: 13, color: T.dark, margin: '0 0 8px',
              }}>What&apos;s included</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 14 }}>
                {comboItems.map((item) => (
                  <div
                    key={item.name}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 0', borderBottom: `1px solid ${T.border}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.pink, flexShrink: 0 }} />
                      <span style={{
                        fontFamily: "'Manrope',sans-serif", fontWeight: 500,
                        fontSize: 14, lineHeight: '19px', color: '#333333',
                      }}>{item.name}</span>
                    </div>
                    <span style={{
                      fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                      fontSize: 12, color: T.descColor,
                      background: '#F4F4F5', borderRadius: 6, padding: '2px 8px',
                    }}>×{item.qty}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ORDER CTA */}
          {tier === 'order' && (
            <>
              <div style={{ height: 1, background: T.border, margin: '0 0 20px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Qty stepper */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 18,
                  border: `1.5px solid ${T.border}`, borderRadius: 100, padding: '8px 16px',
                }}>
                  <button
                    onClick={() => setQty(q => Math.max(1, q - 1))}
                    aria-label="Decrease quantity"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: T.dark, lineHeight: 1, padding: 0 }}
                  >–</button>
                  <span style={{
                    fontFamily: "'Poppins',sans-serif", fontWeight: 600,
                    fontSize: 16, color: T.dark, minWidth: 20, textAlign: 'center',
                  }}>{qty}</span>
                  <button
                    onClick={() => setQty(q => Math.min(99, q + 1))}
                    aria-label="Increase quantity"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: T.pink, lineHeight: 1, padding: 0 }}
                  >+</button>
                </div>

                {/* Add to Cart */}
                <button
                  onClick={() => {
                    onAddToCart?.(
                      product,
                      qty,
                      productType === 'variant' && variants
                        ? variants[selectedVariantIdx]?.size
                        : undefined,
                    );
                    onClose();
                  }}
                  style={{
                    flex: 1, height: 52, background: T.pink,
                    border: 'none', borderRadius: 100, color: T.white,
                    fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16,
                    cursor: 'pointer', boxShadow: '0 4px 16px rgba(239,89,161,0.35)',
                  }}
                >
                  Add to Cart · ₹{totalPrice}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SEARCH OVERLAY ────────────────────────────────────────────────────────────
function SearchOverlay({
  products, categories, onClose, onSelectProduct, tier,
}: {
  products: MenuProduct[];
  categories: string[];
  onClose: () => void;
  onSelectProduct: (p: MenuProduct) => void;
  tier: Tier;
}) {
  useBodyScrollLock();

  const [query, setQuery] = useState('');
  const [foodFilter, setFoodFilter] = useState<'veg' | 'non_veg' | null>(null);
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

  const results = (q || foodFilter)
    ? products.filter(p => {
        const textMatch = !q || (
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q)
        );
        const foodMatch = !foodFilter || (
          foodFilter === 'veg'
            ? (p.food_type === 'veg')
            : (p.food_type === 'non_veg' || p.food_type === 'nonveg' || p.food_type === 'egg')
        );
        return textMatch && foodMatch;
      })
    : [];

  const handleSelect = (p: MenuProduct) => {
    onSelectProduct(p);
    // onClose is called by parent after onSelectProduct — don't double-call
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search menu"
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: T.white,
        display: 'flex', flexDirection: 'column',
        animation: 'qrFadeIn 0.15s ease',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        borderBottom: `1px solid ${T.border}`,
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          aria-label="Go back"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: T.dark }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke={T.dark} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <span style={{
          fontFamily: "'Poppins',sans-serif", fontWeight: 600,
          fontSize: 18, color: T.dark,
        }}>Search</span>
      </div>

      {/* Search input */}
      <div style={{ padding: '16px 16px 0', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#F4F4F5', borderRadius: 100, padding: '10px 16px',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="#9CA3AF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find your Craving's Partner"
            style={{
              flex: 1, border: 'none', background: 'transparent', outline: 'none',
              fontFamily: "'Poppins',sans-serif", fontWeight: 400,
              fontSize: 14, color: T.dark,
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="#9CA3AF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        {!q ? (
          <>
            <p style={{
              fontFamily: "'Poppins',sans-serif", fontWeight: 600,
              fontSize: 14, color: T.dark, margin: '0 0 14px',
            }}>Often Searched</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {[
                { label: 'Veg', value: 'veg' as const, activeColor: T.vegGreen },
                { label: 'Non Veg', value: 'non_veg' as const, activeColor: T.nonvegRed },
              ].map(({ label, value, activeColor }) => {
                const active = foodFilter === value;
                return (
                  <button key={value} onClick={() => setFoodFilter(active ? null : value)} style={{
                    padding: '7px 14px', borderRadius: 100,
                    border: `1px solid ${active ? activeColor : T.chipBorder}`,
                    background: active ? activeColor : T.white,
                    color: active ? T.white : T.dark,
                    fontFamily: "'Poppins',sans-serif", fontWeight: active ? 500 : 400,
                    fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>{label}</button>
                );
              })}
              {categories.map(cat => (
                <button key={cat} onClick={() => setQuery(cat)} style={{
                  padding: '7px 14px', borderRadius: 100,
                  border: `1px solid ${T.chipBorder}`,
                  background: T.white, color: T.dark,
                  fontFamily: "'Poppins',sans-serif", fontWeight: 400,
                  fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>{cat}</button>
              ))}
            </div>
            {foodFilter && (
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {results.length === 0 ? (
                  <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: T.lightGray, paddingTop: 24, textAlign: 'center' }}>
                    No {foodFilter === 'veg' ? 'vegetarian' : 'non-vegetarian'} items found.
                  </p>
                ) : results.map(p => (
                  <SearchResultCard key={p.id} product={p} tier={tier} onSelect={handleSelect} />
                ))}
              </div>
            )}
          </>
        ) : results.length === 0 ? (
          <div style={{ paddingTop: 48, textAlign: 'center' }}>
            <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: T.lightGray }}>
              No items found for &quot;{query}&quot;
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {results.map(p => (
              <SearchResultCard key={p.id} product={p} tier={tier} onSelect={handleSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SEARCH RESULT CARD (extracted to avoid IIFE in JSX) ───────────────────────
function SearchResultCard({
  product: p, tier, onSelect,
}: {
  product: MenuProduct;
  tier: Tier;
  onSelect: (p: MenuProduct) => void;
}) {
  const desc = p.metadata?.variants ? getVariantDishDesc(p.description) : p.description;
  const discountActive = p.metadata?.discount_enabled && p.metadata?.original_price;
  const discountPct = numMeta(p.metadata?.discount_pct);

  return (
    <div
      className="qr-card"
      onClick={() => onSelect(p)}
      style={{ position: 'relative', width: '100%', height: 102, background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 6 }}
    >
      <div style={{ position: 'absolute', right: 8, top: 8, width: 75, height: 75, borderRadius: 8, overflow: 'hidden', background: T.white }}>
        {p.image_url
          ? <img src={p.image_url} alt={p.name} loading="lazy" decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <ImgPlaceholder size={75} />
        }
        <QuadrantBadge quadrant={p.ks_quadrant} />
      </div>
      <div style={{ position: 'absolute', left: 8, top: 8, right: 91, display: 'flex', alignItems: 'center', gap: 6 }}>
        <VegDot foodType={p.food_type} />
        <p style={{
          margin: 0, flex: 1,
          fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, lineHeight: '21px',
          color: T.nameColor, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>{p.name}</p>
      </div>
      {desc && (
        <p style={{
          position: 'absolute', left: 8, top: 33, right: 91, margin: 0,
          fontFamily: "'Poppins',sans-serif", fontWeight: 300, fontSize: 10, lineHeight: '16px',
          color: T.descColor, display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        } as React.CSSProperties}>{desc}</p>
      )}
      {discountActive ? (
        <div style={{ position: 'absolute', left: 8, bottom: 8, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 15, lineHeight: '21px', color: T.pink }}>
            ₹{p.selling_price}
          </span>
          <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 400, fontSize: 9, textDecoration: 'line-through', color: T.descColor, alignSelf: 'center' }}>
            MRP {numMeta(p.metadata?.original_price)}
          </span>
          {discountPct > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', padding: '1px 5px',
              background: '#13801C', borderRadius: 3,
              fontFamily: "'Manrope',sans-serif", fontWeight: 600,
              fontSize: 9, color: '#FFFFFF', whiteSpace: 'nowrap',
            }}>Flat {discountPct}% Off</span>
          )}
        </div>
      ) : (
        <p style={{ position: 'absolute', left: 8, bottom: 8, margin: 0, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16, lineHeight: '24px', color: T.pink }}>
          ₹{p.selling_price}
        </p>
      )}
      {tier === 'order' && (
        <button
          onClick={e => { e.stopPropagation(); onSelect(p); }}
          aria-label={`Add ${p.name} to cart`}
          style={{
            position: 'absolute', right: 8, bottom: 8,
            width: 57, height: 26, borderRadius: 14,
            border: `1px solid ${T.pink}`, background: T.white, color: T.pink,
            fontFamily: "'Manrope',sans-serif", fontWeight: 700,
            fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >ADD</button>
      )}
    </div>
  );
}

// ── MAIN TEMPLATE ─────────────────────────────────────────────────────────────
export default function QRMenuTemplate({
  shopName, shopTagline, logoUrl, menuProducts, banners, tier, onAddToCart,
}: QRMenuTemplateProps) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeProduct, setActiveProduct] = useState<MenuProduct | null>(null);
  const [activeBanner, setActiveBanner] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bannerPaused, setBannerPaused] = useState(false);

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
  const openSearch = () => {
    window.history.pushState({ qrSheet: 'search' }, '');
    setSearchOpen(true);
  };
  const closeProduct = () => {
    if (window.history.state?.qrSheet === 'product') window.history.back();
    else setActiveProduct(null);
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
          <div style={{ width: 36 }} />

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

        {/* ── CATEGORY CHIPS ── */}
        {categories.length > 0 && (
          <div className="qr-chips">
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
        )}

        {/* ── PRODUCT SECTIONS ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
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
                  const desc = p.metadata?.variants ? getVariantDishDesc(p.description) : p.description;
                  const discountActive = p.metadata?.discount_enabled && p.metadata?.original_price;
                  const discountPct = numMeta(p.metadata?.discount_pct);

                  return (
                    <div
                      key={p.id}
                      className="qr-card"
                      onClick={() => openProduct(p)}
                      style={{
                        position: 'relative', width: '100%', height: 102,
                        background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 6,
                      }}
                    >
                      {/* Thumbnail */}
                      <div style={{
                        position: 'absolute', right: 8, top: 8,
                        width: 75, height: 75, borderRadius: 8, overflow: 'hidden', background: T.white,
                      }}>
                        {p.image_url
                          ? <img src={p.image_url} alt={p.name} loading="lazy" decoding="async"
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <ImgPlaceholder size={75} />
                        }
                        <QuadrantBadge quadrant={p.ks_quadrant} />
                      </div>

                      {/* Name row */}
                      <div style={{ position: 'absolute', left: 8, top: 8, right: 91, display: 'flex', alignItems: 'center', gap: 6 }}>
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
                          position: 'absolute', left: 8, top: 33, right: 91, margin: 0,
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
                              ₹{p.selling_price}
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
                        }}>₹{p.selling_price}</p>
                      )}

                      {/* ADD button */}
                      {tier === 'order' && (
                        <button
                          onClick={e => { e.stopPropagation(); openProduct(p); }}
                          aria-label={`Add ${p.name} to cart`}
                          style={{
                            position: 'absolute', right: 8, bottom: 8,
                            width: 57, height: 26, borderRadius: 14,
                            border: `1px solid ${T.pink}`, background: T.white, color: T.pink,
                            fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 12, lineHeight: '12px',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0px 2px 1px rgba(0,0,0,0.08)',
                          }}
                        >ADD</button>
                      )}
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

      {/* ── SEARCH OVERLAY ── */}
      {searchOpen && (
        <SearchOverlay
          products={menuProducts}
          categories={categories}
          tier={tier}
          onClose={closeSearch}
          onSelectProduct={p => { openProduct(p); setSearchOpen(false); }}
        />
      )}

      {/* ── DETAIL SHEET ── */}
      {activeProduct && (
        <ProductDetailSheet
          product={activeProduct}
          tier={tier}
          onClose={closeProduct}
          onAddToCart={onAddToCart}
        />
      )}
    </>
  );
}
