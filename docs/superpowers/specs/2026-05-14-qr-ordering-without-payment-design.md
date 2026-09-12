# QR Ordering Without Payment — Design Spec
_Date: 2026-05-14_

## Overview

Add a new plan **"QR Ordering Without Payment"** (`qr_order`) positioned between "Smart QR Menu" (`qr_menu`) and "QR Ordering + Payment" (`pay_eat`). Customers scan a table QR code, browse the menu, place orders without any payment step, and can request a bill. The admin receives order notifications and a "bill requested" alert, with orders accumulated per table until the bill is settled.

Mock payment (₹5 instant activation) allows unlimited plan switching for testing.

---

## Plan Identity

| Field | Value |
|-------|-------|
| DB plan value | `qr_order` |
| PlanContext flag | `isQrOrder` |
| Display name | QR Ordering (Without Payment) |
| Mock price | ₹5 (instant activation, no real charge) |
| Real price | ₹599/month |
| Position in UI | Middle card, between Smart QR Menu and QR Ordering + Payment |
| Card theme | Amber/orange |

---

## Database Migration (`020_qr_order_plan.sql`)

1. Extend `site_subscriptions.store_plan` CHECK constraint to include `'qr_order'`.
2. Create `bill_requests` table:
   - `id` uuid PK
   - `site_id` uuid FK → sites
   - `table_number` text NOT NULL
   - `status` text CHECK IN ('pending', 'acknowledged') DEFAULT 'pending'
   - `requested_at` timestamptz DEFAULT now()
   - `acknowledged_at` timestamptz nullable
3. Enable RLS on `bill_requests` (service role full access).
4. Index: `(site_id, status, requested_at DESC) WHERE status = 'pending'`.

---

## PlanContext Changes

- Add `isQrOrder: boolean` → `plan === 'qr_order'`
- `isPayEat` stays unchanged (`pay_eat` | `pro`)
- `isQrMenu` stays unchanged (anything not PayEat)
- Export `isQrOrder` from context type and provider

---

## API Routes

### Modified: `POST /api/orders`
- Accept `paymentMethod: 'online' | 'counter' | 'no_payment'`
- When `no_payment`: `payment_status = 'paid'`, no counter/token allocation, table number required
- Skip email for `no_payment` orders (kitchen notification is sufficient)

### New: `POST /api/bill-request`
- Public endpoint (no auth — customer facing)
- Body: `{ siteId, tableNumber }`
- Validates site exists, is live, plan is `qr_order`
- Inserts into `bill_requests` with status `'pending'`
- Rate limit: 1 bill request per table per 5 minutes (prevent spam)

### New: `GET /api/manage/bill-requests`
- Auth: Firebase Bearer token
- Query: `?site_id=`
- Returns pending bill requests for that site, ordered by `requested_at DESC`

### New: `PATCH /api/manage/bill-requests/[id]`
- Auth: Firebase Bearer token
- Body: `{ action: 'acknowledge' }`
- Sets `status = 'acknowledged'`, `acknowledged_at = now()`

### New: `POST /api/subscription/activate-qr-order`
- Auth: Firebase Bearer token
- Body: `{ siteId }`
- Sets `store_plan = 'qr_order'`, `store_expires_at = now() + 30 days` (mock, instant)
- No real payment — same pattern as existing `activate-qr-ordering`

---

## Customer-Facing (Shop Page)

### Tier System
`tier` prop: `'view' | 'order' | 'order_no_pay'`

- `view` → Smart QR Menu (read-only)
- `order` → QR Ordering + Payment (existing)
- `order_no_pay` → QR Ordering Without Payment (new)

Server-side tier resolution in `src/app/shop/[slug]/page.tsx`:
```
qr_menu  → 'view'
pay_eat  → 'order'
qr_order → 'order_no_pay'
```

### Common QR + qr_order plan
If `tier === 'order_no_pay'` and no `?table=` param → show "Table ordering only" message (no common QR supported).

### Cart & Checkout (`QRMenuTemplate`, `CartSheet`, `CheckoutScreen`)
When `tier === 'order_no_pay'`:
- CartSheet: show cart normally, "Place Order" CTA
- CheckoutScreen: no payment method selector (remove online/counter radio)
- Customer enters name only (email optional)
- POST `/api/orders` with `paymentMethod: 'no_payment'`
- OrderConfirmedScreen: "Order placed! Kitchen has been notified."

### Request Bill Button
- Sticky footer button visible at all times on shop page when `tier === 'order_no_pay'` and `tableNumber` is set
- Label: "Request Bill"
- Tapping opens a confirmation dialog: "Notify staff to bring your bill?"
- On confirm → POST `/api/bill-request`
- Success state: "Bill request sent — staff will be with you shortly"
- Cooldown: 5 minutes before can request again (client-side timer)

---

## Admin Orders Page (`/manage/orders`)

### Plan routing
- `isPayEat` → existing flat list view (unchanged)
- `isQrOrder` → new table-grouped view
- `isQrMenu` → locked/upgrade state (unchanged)

### Table-Grouped View (for `isQrOrder`)
**Stats bar**: Active Tables | Pending Bill Requests | Completed Tables (today)

**Table rows** (one row per table with active orders):
- Table number badge
- Total items count across all orders for this table
- Accumulated total amount (₹)
- Time of first order
- Status: Active / Bill Requested
- "Print Bill" button → generates consolidated bill for that table
- "Acknowledge Bill" button (if bill requested) → marks bill request acknowledged, clears table session

**Expand table row** → shows individual orders under it:
- Each order: time, items summary, amount, status chip (Preparing / Ready / Completed)
- Admin can advance each order status (Preparing → Ready → Completed)

**Polling**: same 4s delta-poll pattern as existing orders page

**Bill Request badge**: when a table has a pending bill request, its row shows an amber "Bill Requested" badge with pulsing dot animation. Admin sees it immediately without refresh (polled alongside orders).

---

## QR Page (`/manage/qr`)

When `isQrOrder`:
- Force table mode (set `qrMode = 'table'` on load, hide switch mode button)
- Hide "Common QR" section
- Show info chip: "QR Ordering Without Payment uses table-specific QR codes only"
- All other table QR functionality (add/remove tables, download poster/QR) unchanged

---

## Subscription Page (`/manage/subscription`)

Three plan cards in a grid (1-col mobile, 3-col desktop):

1. **Smart QR Menu** — green (existing)
2. **QR Ordering (No Payment)** — amber/orange (new)
   - Features list: everything in Smart QR Menu + order without payment, kitchen notifications, bill-per-table accumulation, request-for-bill button, table QR only
   - Mock price: ₹5 (instant)
   - Activate button → `activate-qr-order` endpoint
3. **QR Ordering + Payment** — purple (existing)

Status card logic updated to detect `isQrOrder` active state.

---

## Pricing Page (Home, `Pricing.tsx`)

Grid changes from 2-col to 3-col (desktop). New middle card added with amber theme. Feature list:
- Everything in Smart QR Menu, plus —
- Customers order from phone — no payment step
- Kitchen gets instant order notifications
- Orders accumulate per table until bill requested
- One-tap "Request Bill" for customers
- Table-only QR codes (no shared QR)

---

## Mock Payment / Plan Switching

All three plans support instant mock activation:
- `qr_menu`: existing Razorpay mock at ₹5
- `qr_order`: new `activate-qr-order` endpoint, instant (no Razorpay), ₹5 display
- `pay_eat`: existing `activate-qr-ordering` endpoint, instant, ₹5 display

Switching between plans is always available (no locks, no cooldown). Each activation overwrites `store_plan` and resets `store_expires_at` to +30 days.

---

## Spec Self-Review

- No TBDs or placeholders.
- `bill_requests` RLS uses service role — correct since admin API uses server-side Supabase client.
- `no_payment` order type is additive — existing `pay_eat` orders unaffected.
- `tier = 'order_no_pay'` is a new string literal; no clash with existing `'view'` or `'order'`.
- Common QR + `qr_order` plan: show friendly error, not a crash.
- Bill request rate limiting is server-side (DB timestamp check) — prevents customer spam.
- Plan switching: overwriting `store_plan` without downgrade logic is intentional (testing mode).
