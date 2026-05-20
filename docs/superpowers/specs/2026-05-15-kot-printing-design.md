# KOT Printing System — Design Spec

**Date:** 2026-05-15  
**Plans affected:** `qr_order` (No Payment), `pay_eat` (With Payment)  
**Status:** Approved

---

## Goal

Add a Kitchen Order Token (KOT) printing system to the admin orders page. When a customer places an order via QR scan, the kitchen receives a printed slip with the items. Supports two modes: Manual (admin clicks to print) and Automatic (prints as soon as the order arrives). No separate kitchen page — everything is handled from the existing admin orders page.

---

## Status Flow

```
Order placed → received → (KOT action) → preparing → completed
```

| Status | Meaning |
|--------|---------|
| `received` | Order landed, KOT not yet sent to kitchen |
| `preparing` | KOT printed, kitchen is working on it |
| `completed` | Done — existing flow unchanged |

`process_order_v2` always creates orders as `received` (previously `preparing`). Both `qr_order` and `pay_eat` plans use this flow.

---

## Modes

### Manual Mode

- `received` orders show an amber **KOT** badge + print button on the admin orders page
- Admin clicks KOT → `window.print()` fires the KOT slip → API PATCH sets status to `preparing`
- From `preparing` the existing flow continues: `preparing → completed`

### Automatic Mode

- When the admin orders page detects a `received` order (via Supabase Realtime or delta poll) **and** `localStorage.getItem('kot_station') === '1'` on this device → auto-fires `window.print()` + API PATCH → `preparing`
- No click required
- The **KOT Station device flag** (stored in `localStorage`) prevents double-printing when two machines have the orders page open. Only the machine marked as KOT Station auto-prints

### Dev Mode (no physical printer)

`window.print()` is replaced by a side toast notification showing the KOT slip content. Detected automatically when `NODE_ENV !== 'production'` OR when `localStorage.getItem('kot_dev_mode') === '1'` (settable in Store Settings for testing on production).

---

## Two-Machine Setup

| Machine | Role | What it does |
|---------|------|-------------|
| Admin machine | Counter / management | Manages order flow, clicks KOT in manual mode |
| Kitchen machine | KOT Station | Has thermal printer as OS default; marked as KOT Station in Store Settings |

Both machines open `/manage/orders`. Only the KOT Station device auto-prints in auto mode. In manual mode, the admin machine clicks KOT — `window.print()` fires on that browser, so the admin machine must have the thermal printer as default OR the kitchen machine operates its own KOT Station page in auto mode.

**Recommended physical setup:** Use **auto mode** with the kitchen machine marked as KOT Station. Kitchen machine auto-prints the moment the order arrives with zero admin interaction.

---

## KOT Slip Content

Print-only, no prices. Kitchen only needs items and table/token.

```
─────────────────────────
       KOT — Table T5
─────────────────────────
  2×  BBQ Paneer (Full)
  1×  Tandoori Roti
  1×  Lassi
─────────────────────────
  Order #8804  |  12:34 PM
─────────────────────────
```

For takeaway orders: `KOT — Token 7` instead of table number.

Implemented as a print-only CSS section (`@media print`) injected into the page — no new route needed.

---

## Store Settings Changes

### 1. KOT Mode Toggle

- Label: **Kitchen Printing Mode**
- Options: `Manual` | `Automatic`
- Stored in: `sites.kot_mode TEXT DEFAULT 'manual'`
- On change: confirmation dialog
  - → Auto: *"Switching to Automatic means new orders print immediately without any action. Make sure the KOT Station device is set up."*
  - → Manual: *"Switching to Manual means you must click KOT for each order before the kitchen sees it."*
- API: PATCH `/api/manage/sites/[siteId]/kot-mode`

### 2. KOT Station Device Flag

- Label: **This Device is the KOT Station**
- Toggle button — sets/clears `localStorage.getItem('kot_station')`
- Shows status indicator: `● KOT Station Active` (green) or `○ Not a KOT Station`
- Only relevant in Automatic mode; shown conditionally
- Also: **Test Print** button — fires a sample KOT slip (or toast in dev mode)

### 3. Dev / Test Mode (optional)

- Checkbox: **Show toast instead of printing** — sets `localStorage.getItem('kot_dev_mode')`
- Useful for testing in production without wasting paper

---

## API Changes

### New endpoint: `PATCH /api/manage/orders/[id]/kot`

- Auth: Firebase token required, site ownership verified
- Validates: order exists, belongs to site, current status is `received`
- Action: `UPDATE orders SET status = 'preparing', updated_at = now() WHERE id = $1 AND status = 'received'`
- Returns: `{ success: true }` or `{ error: 'already_advancing' }` if status was already changed (idempotent — safe for race between two devices)

### Modified: `process_order_v2` (SQL function)

- Change initial status from `'preparing'` to `'received'`
- No other changes to the function

### New migration: `034_kot_mode_and_received_status`

```sql
-- Add kot_mode to sites
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS kot_mode TEXT NOT NULL DEFAULT 'manual';

-- No enum change needed — status is stored as TEXT
-- Update process_order_v2 to use 'received' as initial status
```

---

## Admin Orders Page Changes

### Status display

| Status | Color | Badge text | Action button |
|--------|-------|-----------|---------------|
| `received` | Amber | **KOT** | Print KOT (manual) / auto-fires (auto + KOT station) |
| `preparing` | Orange | Preparing | → Complete |
| `completed` | Purple | Completed | — |

### NEXT_STATUS map update

```
received  → preparing   (via KOT action, not direct status cycle)
preparing → completed
```

The KOT action is separate from the status cycle button — it prints AND advances status together.

### Auto-print logic (in `useEffect` watching orders)

```
when new order arrives with status === 'received':
  if kot_mode === 'auto' AND localStorage.kot_station === '1':
    fire window.print() with KOT content for that order
    call PATCH /api/manage/orders/[id]/kot
    on success: update local order status to 'preparing'
    on 409/already_advancing: update local status to 'preparing' (someone else got it)
```

### KOT print template

- Hidden `div` with `class="kot-print-only"` — visible only via `@media print`
- Contains: store name, table/token, items list (no prices), order number, time
- Populated dynamically when KOT is triggered, cleared after print

---

## Error Handling

| Scenario | Handling |
|----------|---------|
| KOT API call fails | Toast error, status stays `received`, admin can retry |
| Two devices both try to advance same order | First wins (WHERE status = 'received'), second gets graceful response, no double-print |
| Auto mode fires but printer offline | `window.print()` opens dialog — staff handles it; status still advances |
| Page refresh in auto mode | `received` orders already in list re-trigger check on load — guarded by KOT Station flag |

---

## What Does NOT Change

- Bill printing flow (table checkout, `printedTableOrders` tracking) — unchanged
- `completed` status handling — unchanged
- Takeaway order flow — unchanged (token display, checkout)
- Payment flow for `pay_eat` plan — unchanged
- Customer-facing shop page — unchanged

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/034_kot_mode_and_received_status.sql` | Add `kot_mode` column; update `process_order_v2` initial status |
| `src/app/api/manage/orders/[id]/kot/route.ts` | New PATCH endpoint |
| `src/app/api/manage/sites/[siteId]/kot-mode/route.ts` | New PATCH endpoint |
| `src/app/manage/orders/page.tsx` | `received` status display, KOT button, auto-print logic, print template |
| `src/app/manage/settings/page.tsx` | KOT mode toggle, KOT station flag, test print button |
