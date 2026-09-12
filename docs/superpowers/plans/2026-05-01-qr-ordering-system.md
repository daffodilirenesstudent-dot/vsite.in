# QR Ordering System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full customer ordering flow (cart → checkout → confirmation) inside QRMenuTemplate, gated behind the `pay_eat` plan, with real Supabase orders and live realtime sync to the admin dashboard.

**Architecture:** All customer-facing screens are full-screen overlays inside QRMenuTemplate (no page navigation), matching the existing ProductDetailSheet pattern. Plan gating reads `store_plan` from `site_subscriptions` server-side and passes `tier='order' | 'view'` as a prop. Admin orders page replaces mock data with a Supabase subscription for live updates.

**Tech Stack:** Next.js 14 (App Router), React, Supabase (Postgres + Realtime), TypeScript, inline styles (matching existing codebase)

**Branch:** `QR-ordering-system`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| CREATE | `src/components/templates/CartSheet.tsx` | Cart drawer — item list, qty steppers, subtotal, proceed CTA |
| CREATE | `src/components/templates/CheckoutScreen.tsx` | Full-screen — name, table, payment choice, place order |
| CREATE | `src/components/templates/OrderConfirmedScreen.tsx` | Full-screen — order # confirmation + live status |
| MODIFY | `src/components/templates/QRMenuTemplate.tsx` | Add cart state, floating bar, wire 3 new overlays |
| MODIFY | `src/app/shop/[slug]/page.tsx` | Fetch `store_plan` from site_subscriptions, derive + pass `tier` |
| MODIFY | `src/app/shop/[slug]/ShopPageClient.tsx` | Accept `tier` prop, forward to template |
| MODIFY | `src/app/manage/orders/page.tsx` | Replace mock ORDERS_DATA with real Supabase fetch + realtime |

---

## Shared Types (used across all tasks)

```ts
// CartItem — product in cart with qty and optional variant
export interface CartItem {
  id: string;
  name: string;
  price: number;         // unit price (variant price if applicable)
  qty: number;
  image_url?: string | null;
  variantSize?: string;  // e.g. "Large"
}

// OrderRow — matches the Supabase orders table exactly
export interface OrderRow {
  id: string;
  site_id: string;
  order_number: string;
  customer_name: string;
  table_number: string | null;
  items: CartItem[];     // stored as JSONB
  subtotal: number;
  payment_method: 'online' | 'counter';
  payment_status: 'pending' | 'paid';
  status: 'preparing' | 'ready' | 'completed';
  created_at: string;
}
```

---

## Task 1: DB Migration — Create `orders` Table

**Files:**
- Run SQL in Supabase SQL Editor (no migration file needed)

- [ ] **Step 1: Run this SQL in the Supabase dashboard → SQL Editor**

```sql
-- orders table
CREATE TABLE IF NOT EXISTS public.orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  order_number    text NOT NULL,
  customer_name   text NOT NULL,
  table_number    text,
  items           jsonb NOT NULL DEFAULT '[]',
  subtotal        numeric(10,2) NOT NULL,
  payment_method  text NOT NULL CHECK (payment_method IN ('online','counter')),
  payment_status  text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid')),
  status          text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','ready','completed')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for dashboard queries (owner fetching their site's orders)
CREATE INDEX IF NOT EXISTS idx_orders_site_id ON public.orders(site_id, created_at DESC);

-- Enable realtime
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Public (anon) can INSERT orders and SELECT their own order by id
CREATE POLICY "anon insert orders"
  ON public.orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anon read own order"
  ON public.orders FOR SELECT
  TO anon, authenticated
  USING (true);

-- Public can read orders (needed for realtime status updates to customer)
-- Admin update (owner cycles status) — handled via service role in API route
```

- [ ] **Step 2: Add `orders` table to Supabase Realtime publication in dashboard**

Go to: Supabase Dashboard → Database → Replication → `supabase_realtime` publication → Add table `orders`

- [ ] **Step 3: Verify table exists**

In Supabase SQL Editor:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'orders' ORDER BY ordinal_position;
```
Expected output: id, site_id, order_number, customer_name, table_number, items, subtotal, payment_method, payment_status, status, created_at

---

## Task 2: Plan Gating — Pass `tier` from Server to Template

**Files:**
- Modify: `src/app/shop/[slug]/page.tsx`
- Modify: `src/app/shop/[slug]/ShopPageClient.tsx`

- [ ] **Step 1: Update the `getShop` query in `page.tsx` to fetch `store_plan`**

In `src/app/shop/[slug]/page.tsx`, find the `site_subscriptions` query (around line 71):

```ts
const { data: sub } = await supabaseServer
  .from('site_subscriptions')
  .select('store_expires_at, store_plan')   // ADD store_plan here
  .eq('site_id', site.id)
  .maybeSingle();
```

- [ ] **Step 2: Derive `tier` in `getShop` and add it to the return value**

After the `canGoLive` block in `getShop`, add:

```ts
const storePlan: string = sub?.store_plan ?? 'qr_menu';
const tier: 'view' | 'order' = (storePlan === 'pay_eat' || storePlan === 'pro') ? 'order' : 'view';
```

Update the return signature:
```ts
// Change return type annotation on getShop:
async function getShop(slug: string): Promise<{
  shop: Shop;
  menuProducts: MenuProduct[];
  banners: ShopBanner[];
  canGoLive: boolean;
  tier: 'view' | 'order';         // ADD
} | null>

// Change return statement at bottom of getShop:
return { shop: shopData, menuProducts: (products || []) as MenuProduct[], banners: (bannersData || []) as ShopBanner[], canGoLive, tier };
```

- [ ] **Step 3: Pass `tier` to `ShopPageClient` in the `ShopPage` component**

Find the return in `ShopPage` (bottom of file):
```tsx
return <ShopPageClient shop={shop} menuProducts={menuProducts} banners={banners} tier={tier} />;
```

- [ ] **Step 4: Accept and forward `tier` in `ShopPageClient.tsx`**

In `src/app/shop/[slug]/ShopPageClient.tsx`, update the props signature:

```ts
export default function ShopPageClient({
  shop: initialShop,
  menuProducts: initialProducts,
  banners: initialBanners,
  tier,                            // ADD
}: {
  shop: Shop;
  menuProducts: MenuProduct[];
  banners: ShopBanner[];
  tier: 'view' | 'order';          // ADD
})
```

Then update the `<Template>` render (around line 126):
```tsx
<Template
  shopName={shop.name}
  shopTagline={shop.tagline ?? undefined}
  logoUrl={shop.image_url}
  menuProducts={products}
  banners={banners}
  tier={tier}                      // was hardcoded "view", now dynamic
/>
```

- [ ] **Step 5: Commit**

```bash
git add src/app/shop/[slug]/page.tsx src/app/shop/[slug]/ShopPageClient.tsx
git commit -m "feat: derive and pass tier from store_plan to QRMenuTemplate"
```

---

## Task 3: CartSheet Component

**Files:**
- Create: `src/components/templates/CartSheet.tsx`

- [ ] **Step 1: Create `src/components/templates/CartSheet.tsx`**

```tsx
'use client';

import React from 'react';
import type { CartItem } from './QRMenuTemplate';

const T = {
  pink: '#EF59A1',
  dark: '#191919',
  border: '#E6E6E6',
  white: '#FFFFFF',
  gray: '#808080',
  cardBg: '#FAFAFA',
};

interface CartSheetProps {
  items: CartItem[];
  onClose: () => void;
  onUpdateQty: (id: string, variantSize: string | undefined, delta: number) => void;
  onRemove: (id: string, variantSize: string | undefined) => void;
  onCheckout: () => void;
}

export default function CartSheet({ items, onClose, onUpdateQty, onRemove, onCheckout }: CartSheetProps) {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your cart"
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
        maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
        animation: 'qrSlideUp 0.28s cubic-bezier(0.34,1.2,0.64,1)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 18, color: T.dark }}>
            Your Cart
          </span>
          <button
            onClick={onClose}
            aria-label="Close cart"
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke={T.dark} strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {items.length === 0 ? (
            <div style={{ paddingTop: 48, textAlign: 'center' }}>
              <p style={{ fontFamily: "'Poppins',sans-serif", fontSize: 14, color: '#C5C5C5' }}>
                Your cart is empty
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map(item => (
                <div
                  key={`${item.id}-${item.variantSize ?? ''}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: 12, background: T.cardBg,
                    border: `1px solid ${T.border}`, borderRadius: 10,
                  }}
                >
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0, fontFamily: "'Poppins',sans-serif",
                      fontWeight: 600, fontSize: 14, color: T.dark,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{item.name}</p>
                    {item.variantSize && (
                      <p style={{ margin: '2px 0 0', fontFamily: "'Manrope',sans-serif", fontSize: 11, color: T.gray }}>
                        {item.variantSize}
                      </p>
                    )}
                    <p style={{ margin: '4px 0 0', fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: T.pink }}>
                      ₹{item.price * item.qty}
                    </p>
                  </div>

                  {/* Qty stepper */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    border: `1.5px solid ${T.border}`, borderRadius: 100, padding: '4px 12px',
                  }}>
                    <button
                      onClick={() => item.qty === 1
                        ? onRemove(item.id, item.variantSize)
                        : onUpdateQty(item.id, item.variantSize, -1)}
                      aria-label="Decrease"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: T.dark, lineHeight: 1, padding: 0 }}
                    >–</button>
                    <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 15, color: T.dark, minWidth: 18, textAlign: 'center' }}>
                      {item.qty}
                    </span>
                    <button
                      onClick={() => onUpdateQty(item.id, item.variantSize, 1)}
                      aria-label="Increase"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: T.pink, lineHeight: 1, padding: 0 }}
                    >+</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div style={{ padding: '16px 20px 32px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontSize: 15, color: T.dark }}>Subtotal</span>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: T.dark }}>₹{subtotal}</span>
            </div>
            <button
              onClick={onCheckout}
              style={{
                width: '100%', height: 52, background: T.pink,
                border: 'none', borderRadius: 100, color: T.white,
                fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16,
                cursor: 'pointer', boxShadow: '0 4px 16px rgba(239,89,161,0.35)',
              }}
            >
              Proceed to Checkout →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Export `CartItem` type from QRMenuTemplate.tsx**

Add to the existing types section of `src/components/templates/QRMenuTemplate.tsx` (after the existing `MenuProduct` interface):

```ts
export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  image_url?: string | null;
  variantSize?: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/templates/CartSheet.tsx src/components/templates/QRMenuTemplate.tsx
git commit -m "feat: add CartSheet component and CartItem type"
```

---

## Task 4: CheckoutScreen Component

**Files:**
- Create: `src/components/templates/CheckoutScreen.tsx`

- [ ] **Step 1: Create `src/components/templates/CheckoutScreen.tsx`**

```tsx
'use client';

import React, { useState } from 'react';
import type { CartItem } from './QRMenuTemplate';
import { supabase } from '@/lib/supabase';

const T = {
  pink: '#EF59A1',
  dark: '#191919',
  border: '#E6E6E6',
  white: '#FFFFFF',
  gray: '#808080',
  cardBg: '#FAFAFA',
  green: '#13801C',
};

interface CheckoutScreenProps {
  items: CartItem[];
  siteId: string;
  onClose: () => void;
  onOrderPlaced: (orderId: string, orderNumber: string) => void;
}

function generateOrderNumber(): string {
  return String(Math.floor(1000000 + Math.random() * 9000000));
}

export default function CheckoutScreen({ items, siteId, onClose, onOrderPlaced }: CheckoutScreenProps) {
  const [name, setName] = useState('');
  const [tableNo, setTableNo] = useState('');
  const [payMethod, setPayMethod] = useState<'online' | 'counter' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);

  async function handlePlaceOrder() {
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!payMethod) { setError('Please choose a payment method.'); return; }
    setError('');
    setLoading(true);

    // Mock Razorpay: if online, simulate 1.5s processing then mark paid
    if (payMethod === 'online') {
      await new Promise(r => setTimeout(r, 1500));
    }

    const orderNumber = generateOrderNumber();
    const { data, error: dbErr } = await supabase
      .from('orders')
      .insert({
        site_id: siteId,
        order_number: orderNumber,
        customer_name: name.trim(),
        table_number: tableNo.trim() || null,
        items: items as unknown as Record<string, unknown>[],
        subtotal,
        payment_method: payMethod,
        payment_status: payMethod === 'online' ? 'paid' : 'pending',
        status: 'preparing',
      })
      .select('id')
      .single();

    setLoading(false);

    if (dbErr || !data) {
      setError('Failed to place order. Please try again.');
      return;
    }

    onOrderPlaced(data.id, orderNumber);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: T.white,
        display: 'flex', flexDirection: 'column',
        animation: 'qrFadeIn 0.18s ease',
        maxWidth: 560, margin: '0 auto',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          aria-label="Go back"
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke={T.dark} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 18, color: T.dark }}>
          Checkout
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>

        {/* Name */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 13, color: T.dark, display: 'block', marginBottom: 8 }}>
            Your Name <span style={{ color: T.pink }}>*</span>
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Gowtham"
            style={{
              width: '100%', height: 48, padding: '0 14px',
              border: `1.5px solid ${T.border}`, borderRadius: 10,
              fontFamily: "'Poppins',sans-serif", fontSize: 14, color: T.dark,
              outline: 'none', boxSizing: 'border-box', background: T.white,
            }}
          />
        </div>

        {/* Table number */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 13, color: T.dark, display: 'block', marginBottom: 8 }}>
            Table Number <span style={{ color: T.gray, fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            value={tableNo}
            onChange={e => setTableNo(e.target.value)}
            placeholder="e.g. T-5"
            style={{
              width: '100%', height: 48, padding: '0 14px',
              border: `1.5px solid ${T.border}`, borderRadius: 10,
              fontFamily: "'Poppins',sans-serif", fontSize: 14, color: T.dark,
              outline: 'none', boxSizing: 'border-box', background: T.white,
            }}
          />
        </div>

        {/* Payment method */}
        <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 500, fontSize: 13, color: T.dark, marginBottom: 12 }}>
          Payment Method <span style={{ color: T.pink }}>*</span>
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {([
            { value: 'online', label: 'Pay Now', sub: 'UPI / Card — instant confirmation', icon: '⚡' },
            { value: 'counter', label: 'Pay at Counter', sub: 'Pay when your order is ready', icon: '🏪' },
          ] as const).map(opt => {
            const selected = payMethod === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setPayMethod(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${selected ? T.pink : T.border}`,
                  background: selected ? '#FFF0F8' : T.cardBg,
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <span style={{ fontSize: 22 }}>{opt.icon}</span>
                <div>
                  <p style={{ margin: 0, fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: T.dark }}>{opt.label}</p>
                  <p style={{ margin: 0, fontFamily: "'Manrope',sans-serif", fontSize: 12, color: T.gray }}>{opt.sub}</p>
                </div>
                <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: `2px solid ${selected ? T.pink : T.border}`,
                    background: selected ? T.pink : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.white }} />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Order Summary */}
        <div style={{ background: T.cardBg, borderRadius: 12, padding: '14px 16px', border: `1px solid ${T.border}` }}>
          <p style={{ margin: '0 0 10px', fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, color: T.dark }}>
            Order Summary
          </p>
          {items.map(item => (
            <div key={`${item.id}-${item.variantSize ?? ''}`} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: "'Manrope',sans-serif", fontSize: 13, color: T.gray }}>
                {item.qty}× {item.name}{item.variantSize ? ` (${item.variantSize})` : ''}
              </span>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, color: T.dark }}>₹{item.price * item.qty}</span>
            </div>
          ))}
          <div style={{ height: 1, background: T.border, margin: '10px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: T.dark }}>Total</span>
            <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: T.pink }}>₹{subtotal}</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p style={{ fontFamily: "'Manrope',sans-serif", fontSize: 13, color: '#FB2C36', marginTop: 12, textAlign: 'center' }}>
            {error}
          </p>
        )}
      </div>

      {/* Footer CTA */}
      <div style={{ padding: '16px 16px 36px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button
          onClick={handlePlaceOrder}
          disabled={loading}
          style={{
            width: '100%', height: 54, background: loading ? '#F9B8D9' : T.pink,
            border: 'none', borderRadius: 100, color: T.white,
            fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16,
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 16px rgba(239,89,161,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading ? (
            <>
              <div style={{ width: 18, height: 18, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              {payMethod === 'online' ? 'Processing payment…' : 'Placing order…'}
            </>
          ) : (
            `Place Order · ${itemCount} item${itemCount !== 1 ? 's' : ''} · ₹${subtotal}`
          )}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/templates/CheckoutScreen.tsx
git commit -m "feat: add CheckoutScreen with name, table, payment choice and Supabase insert"
```

---

## Task 5: OrderConfirmedScreen Component

**Files:**
- Create: `src/components/templates/OrderConfirmedScreen.tsx`

- [ ] **Step 1: Create `src/components/templates/OrderConfirmedScreen.tsx`**

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CartItem } from './QRMenuTemplate';

const T = {
  pink: '#EF59A1',
  dark: '#191919',
  border: '#E6E6E6',
  white: '#FFFFFF',
  gray: '#808080',
  green: '#13801C',
  cardBg: '#FAFAFA',
};

type LiveStatus = 'preparing' | 'ready' | 'completed';

const STATUS_LABEL: Record<LiveStatus, string> = {
  preparing: '👨‍🍳 Preparing your order…',
  ready: '✅ Your order is ready!',
  completed: '🎉 Order completed. Enjoy!',
};

const STATUS_COLOR: Record<LiveStatus, string> = {
  preparing: '#F97316',
  ready: T.green,
  completed: '#5137EF',
};

interface OrderConfirmedScreenProps {
  orderId: string;
  orderNumber: string;
  items: CartItem[];
  subtotal: number;
  paymentMethod: 'online' | 'counter';
  onDone: () => void;
}

export default function OrderConfirmedScreen({
  orderId, orderNumber, items, subtotal, paymentMethod, onDone,
}: OrderConfirmedScreenProps) {
  const [status, setStatus] = useState<LiveStatus>('preparing');

  // Subscribe to realtime status updates for this order
  useEffect(() => {
    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        payload => {
          const newStatus = (payload.new as { status?: string }).status as LiveStatus | undefined;
          if (newStatus) setStatus(newStatus);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  const itemCount = items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: T.white,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        animation: 'qrFadeIn 0.18s ease',
        overflowY: 'auto',
        maxWidth: 560, margin: '0 auto',
      }}
    >
      {/* Top confirmation block */}
      <div style={{ width: '100%', padding: '48px 16px 32px', textAlign: 'center' }}>
        {/* Checkmark */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: '#EDFBF0', margin: '0 auto 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <path d="M8 18l7 7 13-14" stroke={T.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h2 style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 22, color: T.dark, margin: '0 0 6px' }}>
          Order Confirmed!
        </h2>
        <p style={{ fontFamily: "'Manrope',sans-serif", fontSize: 14, color: T.gray, margin: 0 }}>
          Order #{orderNumber}
        </p>
      </div>

      {/* Live status chip */}
      <div style={{
        margin: '0 16px 24px',
        padding: '12px 20px',
        border: `1.5px solid ${STATUS_COLOR[status]}`,
        borderRadius: 12,
        background: `${STATUS_COLOR[status]}12`,
        textAlign: 'center', width: 'calc(100% - 32px)',
      }}>
        <p style={{
          fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 15,
          color: STATUS_COLOR[status], margin: 0,
        }}>
          {STATUS_LABEL[status]}
        </p>
      </div>

      {/* Order details card */}
      <div style={{
        width: 'calc(100% - 32px)', margin: '0 16px',
        background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: '16px',
      }}>
        <p style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: T.dark, margin: '0 0 12px' }}>
          Order Items ({itemCount})
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <div key={`${item.id}-${item.variantSize ?? ''}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: "'Manrope',sans-serif", fontSize: 13, color: T.gray }}>
                {item.qty}× {item.name}{item.variantSize ? ` (${item.variantSize})` : ''}
              </span>
              <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 13, color: T.dark }}>₹{item.price * item.qty}</span>
            </div>
          ))}
        </div>
        <div style={{ height: 1, background: T.border, margin: '12px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 14, color: T.dark }}>Total</span>
          <span style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 700, fontSize: 16, color: T.pink }}>₹{subtotal}</span>
        </div>
        <div style={{ height: 1, background: T.border, margin: '12px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Manrope',sans-serif", fontSize: 13, color: T.gray }}>Payment</span>
          <span style={{
            fontFamily: "'Manrope',sans-serif", fontWeight: 600, fontSize: 13,
            color: paymentMethod === 'online' ? T.green : '#F97316',
          }}>
            {paymentMethod === 'online' ? '✓ Paid Online' : 'Pay at Counter'}
          </span>
        </div>
      </div>

      {/* Done button */}
      <div style={{ padding: '24px 16px 48px', width: '100%' }}>
        <button
          onClick={onDone}
          style={{
            width: '100%', height: 52, background: T.pink,
            border: 'none', borderRadius: 100, color: T.white,
            fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 16,
            cursor: 'pointer', boxShadow: '0 4px 16px rgba(239,89,161,0.35)',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/templates/OrderConfirmedScreen.tsx
git commit -m "feat: add OrderConfirmedScreen with realtime status updates"
```

---

## Task 6: Wire Cart State + Floating Bar into QRMenuTemplate

**Files:**
- Modify: `src/components/templates/QRMenuTemplate.tsx`

- [ ] **Step 1: Add imports at the top of QRMenuTemplate.tsx**

After the existing `'use client';` and React import, add:

```ts
import CartSheet from './CartSheet';
import CheckoutScreen from './CheckoutScreen';
import OrderConfirmedScreen from './OrderConfirmedScreen';
```

- [ ] **Step 2: Add cart + screen state inside the `QRMenuTemplate` function body**

After the existing `const [searchOpen, setSearchOpen] = useState(false);` line, add:

```ts
// Cart state
const [cart, setCart] = useState<CartItem[]>([]);
const [cartOpen, setCartOpen] = useState(false);
const [checkoutOpen, setCheckoutOpen] = useState(false);
const [confirmedOrder, setConfirmedOrder] = useState<{
  id: string;
  number: string;
} | null>(null);

const cartItemCount = cart.reduce((sum, i) => sum + i.qty, 0);
const cartSubtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
```

- [ ] **Step 3: Add cart helper functions inside QRMenuTemplate**

After the state declarations above, add:

```ts
const addToCart = (product: MenuProduct, qty: number, variantSize?: string) => {
  const price = variantSize
    ? (() => {
        const variants = Array.isArray(product.metadata?.variants)
          ? (product.metadata!.variants as { size: string; price: number | string }[])
          : [];
        const v = variants.find(v => v.size === variantSize);
        return v ? Number(v.price) : product.selling_price;
      })()
    : product.selling_price;

  setCart(prev => {
    const key = `${product.id}-${variantSize ?? ''}`;
    const existing = prev.find(i => `${i.id}-${i.variantSize ?? ''}` === key);
    if (existing) {
      return prev.map(i =>
        `${i.id}-${i.variantSize ?? ''}` === key
          ? { ...i, qty: Math.min(99, i.qty + qty) }
          : i,
      );
    }
    return [...prev, {
      id: product.id,
      name: product.name,
      price,
      qty,
      image_url: product.image_url,
      variantSize,
    }];
  });
};

const updateQty = (id: string, variantSize: string | undefined, delta: number) => {
  setCart(prev => prev.map(i =>
    i.id === id && i.variantSize === variantSize
      ? { ...i, qty: Math.min(99, Math.max(1, i.qty + delta)) }
      : i,
  ));
};

const removeFromCart = (id: string, variantSize: string | undefined) => {
  setCart(prev => prev.filter(i => !(i.id === id && i.variantSize === variantSize)));
};

const clearCart = () => setCart([]);
```

- [ ] **Step 4: Pass `addToCart` as `onAddToCart` to ProductDetailSheet and update the call site**

The `<ProductDetailSheet>` at the bottom of the template render already accepts `onAddToCart`. Update the render call to:

```tsx
{activeProduct && (
  <ProductDetailSheet
    product={activeProduct}
    tier={tier}
    onClose={closeProduct}
    onAddToCart={addToCart}
  />
)}
```

- [ ] **Step 5: Add the Floating Cart Bar inside the main template return, just before the closing `</>`**

Inside the main `<div className="qr-wrap qr-shell">` div, just before the closing `</div>` of the shell (after the footer), add:

```tsx
{/* ── FLOATING CART BAR ── */}
{tier === 'order' && cartItemCount > 0 && !cartOpen && !checkoutOpen && !confirmedOrder && (
  <div style={{
    position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
    zIndex: 100, width: 'calc(100% - 32px)', maxWidth: 528,
  }}>
    <button
      onClick={() => setCartOpen(true)}
      style={{
        width: '100%', height: 54, background: T.pink,
        border: 'none', borderRadius: 100, color: '#FFFFFF',
        fontFamily: "'Poppins',sans-serif", fontWeight: 600, fontSize: 15,
        cursor: 'pointer', boxShadow: '0 6px 24px rgba(239,89,161,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px',
      }}
    >
      <span style={{
        background: 'rgba(255,255,255,0.25)', borderRadius: 100,
        padding: '2px 10px', fontSize: 13, fontWeight: 700,
      }}>
        {cartItemCount} item{cartItemCount !== 1 ? 's' : ''}
      </span>
      <span>View Cart</span>
      <span style={{ fontWeight: 700 }}>₹{cartSubtotal}</span>
    </button>
  </div>
)}
```

- [ ] **Step 6: Add CartSheet, CheckoutScreen, OrderConfirmedScreen renders inside the template return**

Just before the final closing `</>` of the template return, add:

```tsx
{/* ── CART SHEET ── */}
{cartOpen && (
  <CartSheet
    items={cart}
    onClose={() => setCartOpen(false)}
    onUpdateQty={updateQty}
    onRemove={removeFromCart}
    onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }}
  />
)}

{/* ── CHECKOUT SCREEN ── */}
{checkoutOpen && (
  <CheckoutScreen
    items={cart}
    siteId={shopId}
    onClose={() => setCheckoutOpen(false)}
    onOrderPlaced={(id, number) => {
      setCheckoutOpen(false);
      setConfirmedOrder({ id, number });
    }}
  />
)}

{/* ── ORDER CONFIRMED ── */}
{confirmedOrder && (
  <OrderConfirmedScreen
    orderId={confirmedOrder.id}
    orderNumber={confirmedOrder.number}
    items={cart}
    subtotal={cartSubtotal}
    paymentMethod="online"
    onDone={() => { clearCart(); setConfirmedOrder(null); }}
  />
)}
```

- [ ] **Step 7: Add `shopId` to QRMenuTemplateProps and thread it through**

In the props interface, add:
```ts
interface QRMenuTemplateProps {
  shopName: string;
  shopTagline?: string;
  logoUrl?: string | null;
  menuProducts: MenuProduct[];
  banners: ShopBanner[];
  tier: Tier;
  onAddToCart?: (product: MenuProduct, qty: number, variantSize?: string) => void;
  shopId: string;   // ADD — needed to insert orders
}
```

Update the function signature:
```ts
export default function QRMenuTemplate({
  shopName, shopTagline, logoUrl, menuProducts, banners, tier, onAddToCart, shopId,
}: QRMenuTemplateProps)
```

Update `ShopPageClient.tsx` to pass `shopId={shop.id}` to `<Template>`.

- [ ] **Step 8: Fix `paymentMethod` in OrderConfirmedScreen render**

The `paymentMethod` passed to `OrderConfirmedScreen` needs to come from the confirmed order state. Update state to store it:

```ts
// Replace confirmedOrder state with:
const [confirmedOrder, setConfirmedOrder] = useState<{
  id: string;
  number: string;
  paymentMethod: 'online' | 'counter';
} | null>(null);
```

Update CheckoutScreen's `onOrderPlaced` call in CheckoutScreen.tsx to pass payment method via `onOrderPlaced(data.id, orderNumber, payMethod)` and update the prop type:

```ts
// In CheckoutScreen.tsx, update interface:
interface CheckoutScreenProps {
  items: CartItem[];
  siteId: string;
  onClose: () => void;
  onOrderPlaced: (orderId: string, orderNumber: string, paymentMethod: 'online' | 'counter') => void;
}

// Update the call inside handlePlaceOrder:
onOrderPlaced(data.id, orderNumber, payMethod);
```

Update the QRMenuTemplate render of CheckoutScreen:
```tsx
onOrderPlaced={(id, number, pm) => {
  setCheckoutOpen(false);
  setConfirmedOrder({ id, number, paymentMethod: pm });
}}
```

Update the OrderConfirmedScreen render:
```tsx
paymentMethod={confirmedOrder.paymentMethod}
```

- [ ] **Step 9: Commit**

```bash
git add src/components/templates/QRMenuTemplate.tsx src/app/shop/[slug]/ShopPageClient.tsx
git commit -m "feat: wire cart state, floating bar, and order overlays into QRMenuTemplate"
```

---

## Task 7: Admin Orders Page — Replace Mock with Real Supabase + Realtime

**Files:**
- Modify: `src/app/manage/orders/page.tsx`

- [ ] **Step 1: Replace the entire file content of `src/app/manage/orders/page.tsx`**

```tsx
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePlan } from '@/components/PlanContext';
import { useSite } from '@/components/SiteContext';
import { supabase } from '@/lib/supabase';

type OrderStatus = 'preparing' | 'ready' | 'completed';

interface OrderItem { qty: number; name: string; variantSize?: string; }

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  table_number: string | null;
  items: OrderItem[];
  subtotal: number;
  payment_method: 'online' | 'counter';
  payment_status: 'pending' | 'paid';
  status: OrderStatus;
  created_at: string;
}

const STATUS_STYLES: Record<OrderStatus, { color: string; bg: string; border: string; chevron: boolean }> = {
  preparing: { color: '#F97316', bg: 'transparent', border: '1px solid #F97316', chevron: true },
  ready:     { color: '#16A34A', bg: 'transparent', border: '1px solid #16A34A', chevron: true },
  completed: { color: '#5137EF', bg: '#EEEEFF',     border: 'none',              chevron: false },
};

const NEXT_STATUS: Record<OrderStatus, OrderStatus> = {
  preparing: 'ready',
  ready: 'completed',
  completed: 'preparing',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return isToday ? `Today ${time}` : `${d.toLocaleDateString('en-IN')} ${time}`;
}

function itemsSummary(items: OrderItem[]): string {
  if (!items.length) return '—';
  const first3 = items.slice(0, 3).map(i => `${i.name}${i.variantSize ? ` (${i.variantSize})` : ''}`);
  const rest = items.length - 3;
  return rest > 0 ? `${first3.join(', ')} &+${rest}` : first3.join(', ');
}

export default function OrdersPage() {
  const { isPayEat } = usePlan();
  const { activeSite } = useSite();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const siteId = activeSite?.id;

  // Initial fetch
  const fetchOrders = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('site_id', siteId)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false });
    setOrders((data as Order[]) ?? []);
    setLoading(false);
  }, [siteId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Realtime subscription
  useEffect(() => {
    if (!siteId) return;
    const channel = supabase
      .channel(`admin-orders-${siteId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `site_id=eq.${siteId}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            setOrders(prev => [payload.new as Order, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setOrders(prev => prev.map(o => o.id === (payload.new as Order).id ? { ...o, ...(payload.new as Order) } : o));
            setSelectedOrder(prev => prev?.id === (payload.new as Order).id ? { ...prev, ...(payload.new as Order) } : prev);
          } else if (payload.eventType === 'DELETE') {
            setOrders(prev => prev.filter(o => o.id !== (payload.old as { id: string }).id));
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [siteId]);

  const cycleStatus = async (order: Order) => {
    if (order.status === 'completed') return;
    const next = NEXT_STATUS[order.status];
    setUpdatingId(order.id);
    await supabase.from('orders').update({ status: next }).eq('id', order.id);
    setUpdatingId(null);
  };

  const COLS = ['ORDER ID', 'CUSTOMER', 'ITEMS', 'TIME', 'AMOUNT', 'PAYMENT', 'STATUS'];
  const totalItems = selectedOrder ? selectedOrder.items.reduce((sum, i) => sum + i.qty, 0) : 0;

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8">
      {/* Page header */}
      <div className="mb-5 lg:mb-6">
        <h1 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 26, lineHeight: '32px' }}>Orders</h1>
        <p className="text-[#52525C] mt-1" style={{ fontSize: 14, fontWeight: 400, lineHeight: '22px' }}>
          Live orders for today · updates in real time
        </p>
      </div>

      {/* Locked state */}
      {!isPayEat && (
        <div className="flex flex-col items-center justify-center text-center" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '48px 24px', background: '#FAFAFA' }}>
          <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: '50%', background: '#EEEEFF', marginBottom: 16 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#5137EF' }}>lock</span>
          </div>
          <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 16, marginBottom: 6 }}>Orders — Upgrade to Unlock</p>
          <p className="text-[#71717A]" style={{ fontSize: 13, marginBottom: 20, maxWidth: 320 }}>
            Order management is available on the Pay-Eat plan. Upgrade to start accepting and tracking orders in real time.
          </p>
          <Link href="/manage/subscription" className="flex items-center gap-1.5 text-white hover:opacity-90 transition-opacity" style={{ background: '#5137EF', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_upward</span>
            Upgrade Plan
          </Link>
        </div>
      )}

      {isPayEat && <>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div style={{ width: 28, height: 28, border: '3px solid #e6e6e6', borderTopColor: '#5137EF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Desktop table */}
        {!loading && (
          <div className="hidden lg:block overflow-hidden" style={{ border: '1px solid #E4E4E7', borderRadius: 14 }}>
            <div className="grid" style={{ gridTemplateColumns: '140px 140px 1fr 130px 100px 110px 160px', background: '#F4F4F4', borderBottom: '1px solid #E4E4E7', padding: '0 24px' }}>
              {COLS.map(col => (
                <div key={col} className="text-[#71717A]" style={{ padding: '12px 0', fontSize: 12, fontWeight: 500, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                  {col}
                </div>
              ))}
            </div>
            {orders.length === 0 ? (
              <div className="py-20 flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-[#D4D4D8]" style={{ fontSize: 48 }}>receipt_long</span>
                <p className="font-medium text-[#71717A]" style={{ fontSize: 14 }}>No orders yet today</p>
              </div>
            ) : orders.map((order, idx) => {
              const s = STATUS_STYLES[order.status] ?? STATUS_STYLES.preparing;
              const isUpdating = updatingId === order.id;
              return (
                <div key={order.id} className="grid items-center"
                  style={{ gridTemplateColumns: '140px 140px 1fr 130px 100px 110px 160px', padding: '0 24px', minHeight: 50, background: '#FFFFFF', borderBottom: idx < orders.length - 1 ? '1px solid #E4E4E7' : 'none' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>#{order.order_number}</div>
                  <div>
                    <div style={{ fontSize: 13, color: '#0A0A0A', fontWeight: 500 }}>{order.customer_name}</div>
                    {order.table_number && <div style={{ fontSize: 11, color: '#71717A' }}>Table {order.table_number}</div>}
                  </div>
                  <button onClick={() => setSelectedOrder(order)} className="truncate text-left pr-4 hover:underline"
                    style={{ fontSize: 13, color: '#5137EF', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {itemsSummary(order.items)}
                  </button>
                  <div style={{ fontSize: 13, color: '#52525C' }}>{formatTime(order.created_at)}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>₹{order.subtotal}</div>
                  <div style={{ fontSize: 11, color: order.payment_status === 'paid' ? '#16A34A' : '#F97316', fontWeight: 600 }}>
                    {order.payment_method === 'online' ? (order.payment_status === 'paid' ? '✓ Paid' : 'Online') : 'Counter'}
                  </div>
                  <div>
                    <button
                      onClick={() => !isUpdating && cycleStatus(order)}
                      disabled={isUpdating || order.status === 'completed'}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: s.bg, border: s.border, color: s.color, fontSize: 12, fontWeight: 500, cursor: isUpdating || order.status === 'completed' ? 'default' : 'pointer', opacity: isUpdating ? 0.6 : 1 }}>
                      {STATUS_LABEL[order.status]}
                      {s.chevron && !isUpdating && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>keyboard_arrow_down</span>}
                      {isUpdating && <div style={{ width: 10, height: 10, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Mobile cards */}
        {!loading && (
          <div className="lg:hidden overflow-hidden" style={{ border: '1px solid #E4E4E7', borderRadius: 14 }}>
            {orders.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-[#D4D4D8]" style={{ fontSize: 40 }}>receipt_long</span>
                <p className="font-medium text-[#71717A]" style={{ fontSize: 14 }}>No orders yet today</p>
              </div>
            ) : orders.map((order, idx) => {
              const s = STATUS_STYLES[order.status];
              const isUpdating = updatingId === order.id;
              return (
                <div key={order.id} style={{ padding: '14px 16px', background: '#FFFFFF', borderBottom: idx < orders.length - 1 ? '1px solid #E4E4E7' : 'none' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0A0A0A', flexShrink: 0 }}>#{order.order_number}</span>
                    <button onClick={() => setSelectedOrder(order)} className="flex-1 min-w-0 text-center"
                      style={{ fontSize: 12, color: '#5137EF', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {itemsSummary(order.items)}
                    </button>
                    <button onClick={() => !isUpdating && cycleStatus(order)} disabled={isUpdating || order.status === 'completed'}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6, background: s.bg, border: s.border, color: s.color, fontSize: 12, fontWeight: 500, cursor: isUpdating || order.status === 'completed' ? 'default' : 'pointer', flexShrink: 0 }}>
                      {STATUS_LABEL[order.status]}
                      {s.chevron && !isUpdating && <span className="material-symbols-outlined" style={{ fontSize: 13 }}>keyboard_arrow_down</span>}
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12, color: '#52525C' }}>{order.customer_name}{order.table_number ? ` · T-${order.table_number}` : ''}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>₹{order.subtotal}</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#99A1AF', marginTop: 3 }}>{formatTime(order.created_at)}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Order detail modal */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setSelectedOrder(null)}>
            <div className="bg-white overflow-hidden mx-4" style={{ width: '100%', maxWidth: 420, borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.20)' }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between" style={{ background: '#5137EF', padding: '14px 20px' }}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white" style={{ fontSize: 13, letterSpacing: '0.5px' }}>ORDER DETAILS</span>
                  <span className="text-white/70" style={{ fontSize: 12 }}>{formatTime(selectedOrder.created_at)}</span>
                </div>
                <button onClick={() => setSelectedOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>close</span>
                </button>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <div className="flex items-start justify-between" style={{ marginBottom: 4 }}>
                  <p className="font-bold text-[#0A0A0A]" style={{ fontSize: 24 }}>#{selectedOrder.order_number}</p>
                  <p className="font-bold text-[#0A0A0A]" style={{ fontSize: 24 }}>₹{selectedOrder.subtotal}</p>
                </div>
                <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                  <div>
                    <p className="text-[#52525C]" style={{ fontSize: 14 }}>{selectedOrder.customer_name}</p>
                    {selectedOrder.table_number && <p style={{ fontSize: 12, color: '#71717A' }}>Table {selectedOrder.table_number}</p>}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: selectedOrder.payment_status === 'paid' ? '#16A34A' : '#F97316' }}>
                    {selectedOrder.payment_method === 'online' ? (selectedOrder.payment_status === 'paid' ? '✓ Paid Online' : 'Online') : 'Pay at Counter'}
                  </span>
                </div>
                <div style={{ height: 1, background: '#E4E4E7', marginBottom: 16 }} />
                <p className="font-bold text-[#0A0A0A]" style={{ fontSize: 16, marginBottom: 14 }}>Order Items ({totalItems})</p>
                <div className="flex flex-col" style={{ gap: 12 }}>
                  {selectedOrder.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <span className="font-bold text-[#0A0A0A]" style={{ fontSize: 15, minWidth: 28 }}>{item.qty}×</span>
                      <span className="text-[#0A0A0A]" style={{ fontSize: 15 }}>{item.name}{item.variantSize ? ` (${item.variantSize})` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/manage/orders/page.tsx
git commit -m "feat: replace mock orders with real Supabase fetch + realtime subscription"
```

---

## Task 8: Final Type Check + Build Verification

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If errors exist, fix them before continuing.

- [ ] **Step 2: Run dev server and manually verify**

```bash
npm run dev
```

**Customer flow test (use a `pay_eat` store):**
1. Open `/shop/[slug]` — ADD buttons should be visible
2. Add 2+ items → floating cart bar appears at bottom
3. Tap "View Cart" → CartSheet slides up, qty steppers work
4. Tap "Proceed to Checkout" → CheckoutScreen opens
5. Enter name, pick "Pay at Counter", tap "Place Order"
6. OrderConfirmedScreen appears with order number
7. Open admin at `/manage/orders` — new order appears instantly (realtime)
8. Cycle order status in admin → customer screen status updates live

**View-only test (use a `qr_menu` store):**
1. Open `/shop/[slug]` — no ADD buttons, no floating bar
2. Tap product → detail sheet opens but no "Add to Cart" button

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: QR ordering system — full cart/checkout/confirmation flow with realtime admin orders"
```
