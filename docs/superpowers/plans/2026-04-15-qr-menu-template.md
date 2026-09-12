# QR Menu Template — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `MenuKioskTemplate.tsx` with a pixel-perfect `QRMenuTemplate.tsx` matching the Figma design, wired into a scalable template registry.

**Architecture:** Single `QRMenuTemplate.tsx` file with all sub-components co-located (no separate files for sub-components — they are only used here). A `src/components/templates/index.ts` registry maps template name strings to components so `ShopPageClient` stays decoupled. `tier='view'` hides ordering UI; `tier='order'` is stubbed for later.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS (inline styles for template-specific tokens), Poppins + Manrope via next/font/google, Supabase for data (already fetched by server component).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| CREATE | `src/components/templates/index.ts` | Template registry — maps name → component |
| CREATE | `src/components/templates/QRMenuTemplate.tsx` | Full menu template UI |
| MODIFY | `src/app/layout.tsx` | Add Poppins + Manrope font variables |
| MODIFY | `src/app/shop/[slug]/ShopPageClient.tsx` | Use registry instead of direct import |
| MODIFY | `src/app/shop/[slug]/page.tsx` | Remove MenuKioskTemplate type imports |
| DELETE | `src/components/templates/MenuKioskTemplate.tsx` | Gone — replaced by QRMenuTemplate |

---

## Task 1: Add Poppins + Manrope fonts to layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update font imports**

Replace the entire `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Outfit, Poppins, Manrope } from "next/font/google";
import "./globals.css";
import ToastProvider from "@/components/ToastProvider";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-outfit",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vsite — Create Your Digital Store",
  description: "Set up your digital store and menu in minutes. Powered by AI.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className={`${outfit.variable} ${poppins.variable} ${manrope.variable} antialiased font-sans`}>
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Add font variables to tailwind.config.ts**

In `tailwind.config.ts`, inside `theme.extend.fontFamily`, add:

```ts
"poppins": ["var(--font-poppins)", "sans-serif"],
"manrope": ["var(--font-manrope)", "sans-serif"],
```

So the full `fontFamily` block becomes:

```ts
fontFamily: {
  "sans":    ["var(--font-outfit)", "sans-serif"],
  "display": ["var(--font-outfit)", "sans-serif"],
  "poppins": ["var(--font-poppins)", "sans-serif"],
  "manrope": ["var(--font-manrope)", "sans-serif"],
},
```

- [ ] **Step 3: Verify build compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx tailwind.config.ts
git commit -m "feat: add Poppins and Manrope font variables for QR menu template"
```

---

## Task 2: Create template registry

**Files:**
- Create: `src/components/templates/index.ts`

- [ ] **Step 1: Create the registry file**

Create `src/components/templates/index.ts`:

```ts
// Template registry — add new templates here. One line per template.
// ShopPageClient resolves the template component from site.template string.

import { lazy } from 'react';

// Lazy-load templates so bundle only includes what's rendered
export const TEMPLATE_MAP = {
  'qr-menu': lazy(() => import('./QRMenuTemplate')),
} as const;

export type TemplateName = keyof typeof TEMPLATE_MAP;
export const DEFAULT_TEMPLATE: TemplateName = 'qr-menu';
```

- [ ] **Step 2: Verify TypeScript accepts this**

```bash
npx tsc --noEmit
```

Expected: No errors. (QRMenuTemplate doesn't exist yet — tsc will error on the import. That's fine; fix in next step by creating the file. If tsc errors only on the missing module, proceed to Task 3.)

---

## Task 3: Build QRMenuTemplate.tsx

**Files:**
- Create: `src/components/templates/QRMenuTemplate.tsx`

This is the main task. Build it section by section.

### Design tokens (inline — not Tailwind — so they travel with the template)

```ts
const T = {
  pink:        '#ef59a1',
  pinkLight:   '#fdf2f8',
  vegGreen:    '#13801c',
  nonvegRed:   '#fb2c36',
  dark:        '#191919',
  mid:         '#333333',
  gray:        '#666666',
  lightGray:   '#999999',
  border:      '#e6e6e6',
  surface:     '#f5f5f5',
  white:       '#ffffff',
  amber:       '#ffbc11',
} as const;
```

- [ ] **Step 1: Create the file with types and tokens**

Create `src/components/templates/QRMenuTemplate.tsx`:

```tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const T = {
  pink:      '#ef59a1',
  pinkLight: '#fdf2f8',
  vegGreen:  '#13801c',
  nonvegRed: '#fb2c36',
  dark:      '#191919',
  mid:       '#333333',
  gray:      '#666666',
  lightGray: '#999999',
  border:    '#e6e6e6',
  surface:   '#f5f5f5',
  white:     '#ffffff',
  amber:     '#ffbc11',
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
  food_type?: string | null;   // 'veg' | 'nonveg' | 'egg'
  metadata?: Record<string, unknown> | null;
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
}

export default function QRMenuTemplate(_props: QRMenuTemplateProps) {
  return <div>TODO</div>;
}
```

- [ ] **Step 2: Verify TypeScript accepts the types**

```bash
npx tsc --noEmit
```

Expected: No errors (or only the lazy import error from index.ts which resolves once the default export exists).

- [ ] **Step 3: Build ShopHeader sub-component**

Replace the `export default function QRMenuTemplate` with the full implementation below. Add sub-components above it:

```tsx
// ── SHOP HEADER ───────────────────────────────────────────────────────────────
function ShopHeader({ shopName, logoUrl }: { shopName: string; logoUrl?: string | null }) {
  return (
    <header style={{
      background: T.white,
      borderBottom: `1px solid ${T.border}`,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <div style={{ width: 32 }} /> {/* spacer for centering */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {logoUrl && (
          <img
            src={logoUrl}
            alt={shopName}
            style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
          />
        )}
        <span style={{
          fontFamily: 'var(--font-poppins)',
          fontWeight: 600,
          fontSize: 18,
          color: T.dark,
          letterSpacing: '-0.3px',
        }}>
          {shopName}
        </span>
      </div>
      <button
        aria-label="Search"
        style={{
          width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.dark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
      </button>
    </header>
  );
}
```

- [ ] **Step 4: Build HeroBanner sub-component**

Add after ShopHeader:

```tsx
// ── HERO BANNER ───────────────────────────────────────────────────────────────
function HeroBanner({ banners }: { banners: ShopBanner[] }) {
  const [active, setActive] = useState(0);
  const visible = banners.filter(b => b.image_url);

  if (visible.length === 0) return null;

  return (
    <div style={{ padding: '12px 16px 0' }}>
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
        <img
          src={visible[active].image_url!}
          alt={visible[active].name}
          style={{ width: '100%', aspectRatio: '16/7', objectFit: 'cover', display: 'block' }}
        />
        {visible.length > 1 && (
          <div style={{
            position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 4,
          }}>
            {visible.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                style={{
                  width: i === active ? 16 : 6,
                  height: 6,
                  borderRadius: 100,
                  background: i === active ? T.white : 'rgba(255,255,255,0.5)',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'width 0.2s',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Build CategoryChips sub-component**

Add after HeroBanner:

```tsx
// ── CATEGORY CHIPS ────────────────────────────────────────────────────────────
function CategoryChips({
  categories,
  active,
  onChange,
}: {
  categories: string[];
  active: string;
  onChange: (c: string) => void;
}) {
  const all = ['All', ...categories];
  return (
    <div style={{
      padding: '12px 16px',
      overflowX: 'auto',
      display: 'flex',
      gap: 8,
      scrollbarWidth: 'none',
      WebkitOverflowScrolling: 'touch',
    }}>
      {all.map(cat => {
        const isActive = cat === active;
        return (
          <button
            key={cat}
            onClick={() => onChange(cat)}
            style={{
              flexShrink: 0,
              padding: '6px 16px',
              borderRadius: 100,
              border: `1px solid ${isActive ? T.dark : T.border}`,
              background: isActive ? T.dark : T.white,
              color: isActive ? T.white : T.gray,
              fontFamily: 'var(--font-poppins)',
              fontWeight: 500,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Build VegDot sub-component**

Add after CategoryChips:

```tsx
// ── VEG DOT ───────────────────────────────────────────────────────────────────
function VegDot({ foodType }: { foodType?: string | null }) {
  const color = foodType === 'nonveg' ? T.nonvegRed : T.vegGreen;
  return (
    <div style={{
      width: 14, height: 14,
      border: `1.5px solid ${color}`,
      borderRadius: 2,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <div style={{
        width: 7, height: 7,
        borderRadius: '50%',
        background: color,
      }} />
    </div>
  );
}
```

- [ ] **Step 7: Build ProductRow sub-component**

Add after VegDot:

```tsx
// ── PRODUCT ROW ───────────────────────────────────────────────────────────────
function ProductRow({
  product,
  tier,
  onTap,
}: {
  product: MenuProduct;
  tier: Tier;
  onTap: (p: MenuProduct) => void;
}) {
  return (
    <div
      onClick={() => onTap(product)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 16px',
        borderBottom: `1px solid ${T.border}`,
        cursor: 'pointer',
        background: T.white,
      }}
    >
      {/* Left: text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <VegDot foodType={product.food_type} />
        <p style={{
          fontFamily: 'var(--font-poppins)',
          fontWeight: 600,
          fontSize: 14,
          color: T.dark,
          margin: '4px 0 2px',
          lineHeight: 1.3,
        }}>
          {product.name}
        </p>
        {product.description && (
          <p style={{
            fontFamily: 'var(--font-manrope)',
            fontSize: 12,
            color: T.lightGray,
            margin: '0 0 6px',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {product.description}
          </p>
        )}
        <p style={{
          fontFamily: 'var(--font-poppins)',
          fontWeight: 700,
          fontSize: 15,
          color: T.dark,
          margin: 0,
        }}>
          ₹{product.selling_price}
        </p>
      </div>

      {/* Right: image + ADD */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            style={{ width: 88, height: 88, borderRadius: 12, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: 88, height: 88, borderRadius: 12,
            background: T.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill={T.border}/>
            </svg>
          </div>
        )}
        {tier === 'order' && (
          <button
            onClick={e => { e.stopPropagation(); onTap(product); }}
            style={{
              position: 'absolute',
              bottom: -10, left: '50%', transform: 'translateX(-50%)',
              padding: '4px 14px',
              borderRadius: 8,
              border: `1.5px solid ${T.pink}`,
              background: T.white,
              color: T.pink,
              fontFamily: 'var(--font-poppins)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(239,89,161,0.15)',
            }}
          >
            ADD
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Build ProductDetailSheet sub-component**

Add after ProductRow:

```tsx
// ── PRODUCT DETAIL SHEET ──────────────────────────────────────────────────────
function ProductDetailSheet({
  product,
  tier,
  onClose,
}: {
  product: MenuProduct | null;
  tier: Tier;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(1);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Reset qty when product changes
  useEffect(() => { setQty(1); }, [product]);

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!product) return null;

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        ref={sheetRef}
        style={{
          width: '100%',
          maxWidth: 430,
          margin: '0 auto',
          background: T.white,
          borderRadius: '20px 20px 0 0',
          overflow: 'hidden',
          animation: 'slideUp 0.25s ease',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Drag handle */}
        <div style={{ padding: '10px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 4, borderRadius: 100, background: T.border }} />
        </div>

        {/* Hero image */}
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', aspectRatio: '4/3',
            background: T.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="4" fill={T.border}/>
            </svg>
          </div>
        )}

        {/* Info */}
        <div style={{ padding: '16px 20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <VegDot foodType={product.food_type} />
            <span style={{
              fontFamily: 'var(--font-manrope)',
              fontSize: 12,
              color: product.food_type === 'nonveg' ? T.nonvegRed : T.vegGreen,
              fontWeight: 600,
            }}>
              {product.food_type === 'nonveg' ? 'Non-Veg' : 'Veg'}
            </span>
          </div>

          <h2 style={{
            fontFamily: 'var(--font-poppins)',
            fontWeight: 600,
            fontSize: 20,
            color: T.dark,
            margin: '0 0 8px',
            lineHeight: 1.25,
          }}>
            {product.name}
          </h2>

          <p style={{
            fontFamily: 'var(--font-poppins)',
            fontWeight: 700,
            fontSize: 22,
            color: T.dark,
            margin: '0 0 12px',
          }}>
            ₹{product.selling_price}
          </p>

          {product.description && (
            <p style={{
              fontFamily: 'var(--font-manrope)',
              fontSize: 14,
              color: T.gray,
              lineHeight: 1.6,
              margin: '0 0 16px',
            }}>
              {product.description}
            </p>
          )}

          {/* CTA — only for order tier */}
          {tier === 'order' && (
            <>
              <div style={{ height: 1, background: T.border, margin: '16px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Qty */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  border: `1px solid ${T.border}`,
                  borderRadius: 100,
                  padding: '6px 12px',
                }}>
                  <button
                    onClick={() => setQty(q => Math.max(1, q - 1))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.dark, lineHeight: 1, padding: 0 }}
                  >–</button>
                  <span style={{ fontFamily: 'var(--font-poppins)', fontWeight: 600, fontSize: 16, color: T.dark, minWidth: 16, textAlign: 'center' }}>
                    {qty}
                  </span>
                  <button
                    onClick={() => setQty(q => q + 1)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.pink, lineHeight: 1, padding: 0 }}
                  >+</button>
                </div>

                {/* Add to cart */}
                <button style={{
                  flex: 1, marginLeft: 12,
                  height: 50,
                  background: T.pink,
                  border: 'none',
                  borderRadius: 100,
                  color: T.white,
                  fontFamily: 'var(--font-poppins)',
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: 'pointer',
                }}>
                  Add to Cart — ₹{product.selling_price * qty}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Build the main QRMenuTemplate component**

Add after ProductDetailSheet:

```tsx
// ── FOOTER ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <div style={{ padding: '24px 16px 40px', textAlign: 'center' }}>
      <p style={{
        fontFamily: 'var(--font-poppins)',
        fontSize: 14,
        color: T.lightGray,
        margin: '0 0 4px',
      }}>
        <span style={{ color: T.pink }}>♥</span> Skip the queue. Scan &amp; order.
      </p>
      <p style={{
        fontFamily: 'var(--font-manrope)',
        fontSize: 11,
        color: T.lightGray,
        margin: 0,
      }}>
        Crafted in தமிழ்நாடு
      </p>
    </div>
  );
}

// ── MAIN TEMPLATE ─────────────────────────────────────────────────────────────
export default function QRMenuTemplate({
  shopName,
  shopTagline,
  logoUrl,
  menuProducts,
  banners,
  tier,
}: QRMenuTemplateProps) {
  // Derive categories from products
  const categories = Array.from(
    new Set(menuProducts.map(p => p.category).filter(Boolean) as string[])
  );

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [activeProduct, setActiveProduct] = useState<MenuProduct | null>(null);

  // Filter products by selected category
  const filtered = activeCategory === 'All'
    ? menuProducts
    : menuProducts.filter(p => p.category === activeCategory);

  // Group by category for section headers
  const sections = (() => {
    if (activeCategory !== 'All') {
      return [{ category: activeCategory, products: filtered }];
    }
    const map = new Map<string, MenuProduct[]>();
    for (const p of menuProducts) {
      const cat = p.category ?? 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return Array.from(map.entries()).map(([category, products]) => ({ category, products }));
  })();

  return (
    <>
      {/* Keyframe animations */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      <div style={{
        minHeight: '100dvh',
        background: '#fafafa',
        maxWidth: 430,
        margin: '0 auto',
        position: 'relative',
      }}>
        <ShopHeader shopName={shopName} logoUrl={logoUrl} />
        <HeroBanner banners={banners} />

        {categories.length > 0 && (
          <CategoryChips
            categories={categories}
            active={activeCategory}
            onChange={setActiveCategory}
          />
        )}

        {/* Product sections */}
        <div style={{ background: T.white }}>
          {sections.map(({ category, products }) => (
            <div key={category}>
              {/* Section header */}
              <div style={{
                padding: '14px 16px 10px',
                borderBottom: `1px solid ${T.border}`,
              }}>
                <h3 style={{
                  fontFamily: 'var(--font-poppins)',
                  fontWeight: 600,
                  fontSize: 16,
                  color: T.dark,
                  margin: 0,
                }}>
                  {category}
                </h3>
                <p style={{
                  fontFamily: 'var(--font-manrope)',
                  fontSize: 12,
                  color: T.lightGray,
                  margin: '2px 0 0',
                }}>
                  {products.length} item{products.length !== 1 ? 's' : ''}
                </p>
              </div>
              {products.map(p => (
                <ProductRow
                  key={p.id}
                  product={p}
                  tier={tier}
                  onTap={setActiveProduct}
                />
              ))}
            </div>
          ))}

          {sections.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-poppins)', fontSize: 14, color: T.lightGray }}>
                No items available
              </p>
            </div>
          )}
        </div>

        <Footer />

        {/* Product detail bottom sheet */}
        {activeProduct && (
          <ProductDetailSheet
            product={activeProduct}
            tier={tier}
            onClose={() => setActiveProduct(null)}
          />
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 10: Type-check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 11: Commit**

```bash
git add src/components/templates/QRMenuTemplate.tsx src/components/templates/index.ts
git commit -m "feat: add QRMenuTemplate and template registry"
```

---

## Task 4: Wire ShopPageClient to use the registry

**Files:**
- Modify: `src/app/shop/[slug]/ShopPageClient.tsx`
- Modify: `src/app/shop/[slug]/page.tsx`

- [ ] **Step 1: Rewrite ShopPageClient.tsx**

Replace the entire file with:

```tsx
'use client';

import { Suspense } from 'react';
import { Shop } from '@/lib/supabase';
import { TEMPLATE_MAP, DEFAULT_TEMPLATE, type TemplateName } from '@/components/templates/index';
import type { MenuProduct, ShopBanner } from '@/components/templates/QRMenuTemplate';

export type { MenuProduct, ShopBanner };

export default function ShopPageClient({
  shop,
  menuProducts,
  banners,
}: {
  shop: Shop;
  menuProducts: MenuProduct[];
  banners: ShopBanner[];
}) {
  const templateKey = (shop.type === 'Menu' ? 'qr-menu' : DEFAULT_TEMPLATE) as TemplateName;
  const Template = TEMPLATE_MAP[templateKey] ?? TEMPLATE_MAP[DEFAULT_TEMPLATE];

  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e6e6e6', borderTopColor: '#ef59a1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <Template
        shopName={shop.name}
        shopTagline={shop.tagline ?? undefined}
        logoUrl={shop.image_url}
        menuProducts={menuProducts}
        banners={banners}
        tier="view"
      />
    </Suspense>
  );
}
```

- [ ] **Step 2: Update page.tsx imports**

In `src/app/shop/[slug]/page.tsx`, change line 4 from:

```ts
import type { MenuProduct, ShopBanner } from '@/components/templates/MenuKioskTemplate';
```

to:

```ts
import type { MenuProduct, ShopBanner } from './ShopPageClient';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/shop/[slug]/ShopPageClient.tsx src/app/shop/[slug]/page.tsx
git commit -m "feat: wire ShopPageClient to template registry"
```

---

## Task 5: Delete MenuKioskTemplate and verify

**Files:**
- Delete: `src/components/templates/MenuKioskTemplate.tsx`

- [ ] **Step 1: Delete the old template**

```bash
git rm src/components/templates/MenuKioskTemplate.tsx
```

- [ ] **Step 2: Grep for any remaining references**

```bash
grep -r "MenuKioskTemplate" src/
```

Expected: No output (zero references).

- [ ] **Step 3: Full type-check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: Build completes with no errors. (Warnings about images/ESLint are fine.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove MenuKioskTemplate — replaced by QRMenuTemplate"
```

---

## Done ✓

After Task 5 passes:
- `MenuKioskTemplate.tsx` is gone with zero references
- `QRMenuTemplate.tsx` renders shop banner, category chips, sectioned product list, product detail sheet
- Template registry in `index.ts` — new template = one line
- `tier='view'` hides ADD button and cart CTA
- Poppins + Manrope fonts load via CSS variables
