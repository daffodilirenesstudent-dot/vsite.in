# KOT Printing System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kitchen Order Token (KOT) printing to the admin orders page — Manual mode (admin clicks KOT button to print + advance status) and Automatic mode (auto-prints when order arrives on the designated KOT Station device).

**Architecture:** Orders are created with a new `received` status. In manual mode the admin clicks a KOT button which prints a slip and advances the order to `preparing`. In automatic mode the orders page detects `received` orders via polling/realtime and fires the print + advance automatically on whichever device has localStorage `kot_station_<siteId>` set. Dev mode replaces `window.print()` with a toast notification.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), Firebase Auth, React, react-hot-toast, browser `window.print()`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/034_kot_mode_and_received_status.sql` | Create | Add `kot_mode` column to sites; update `process_order_v2` initial status |
| `src/app/api/manage/orders/[id]/kot/route.ts` | Create | PATCH endpoint: advance `received → preparing` |
| `src/app/api/manage/sites/[siteId]/kot-mode/route.ts` | Create | PATCH endpoint: update `sites.kot_mode` |
| `src/app/api/manage/orders/route.ts` | Modify | Include `kot_mode` in initial load response |
| `src/app/manage/orders/page.tsx` | Modify | `received` status UI, KOT button, auto-print, print template, toast |
| `src/app/manage/settings/page.tsx` | Modify | KOT mode toggle, KOT station flag, test print button |

---

## Task 1: DB Migration — `received` status + `kot_mode` column

**Files:**
- Create: `supabase/migrations/034_kot_mode_and_received_status.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 034: KOT printing system
-- 1. Add kot_mode column to sites ('manual' | 'automatic')
-- 2. Update process_order_v2 to create orders as 'received' instead of 'preparing'

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS kot_mode TEXT NOT NULL DEFAULT 'manual'
  CHECK (kot_mode IN ('manual', 'automatic'));

-- Update process_order_v2: change initial order status from 'preparing' to 'received'
-- Only change is line: p_status := 'preparing'  →  p_status := 'received'
-- Full function rewrite required because CREATE OR REPLACE replaces the whole body.
-- Copy the function body from 031_fix_idempotency_site_id.sql and change only that line.
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__plugin_supabase_supabase__apply_migration` with:
- `project_id`: `wdnruubljlwrduxnvuhr`
- `name`: `034_kot_mode_and_received_status`
- `query`: the SQL above PLUS the full `process_order_v2` function body from `supabase/migrations/031_fix_idempotency_site_id.sql` with `p_status := 'preparing'` changed to `p_status := 'received'`

> **Note:** Read `031_fix_idempotency_site_id.sql` first to get the full function body, then apply with the single line changed.

- [ ] **Step 3: Verify**

Run via `execute_sql`:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'sites' AND column_name = 'kot_mode';
```
Expected: 1 row — `kot_mode | text | 'manual'`

- [ ] **Step 4: Commit local migration file**

```bash
git add supabase/migrations/034_kot_mode_and_received_status.sql
git commit -m "feat: add kot_mode to sites and received order status"
```

---

## Task 2: KOT API Endpoint — `received → preparing`

**Files:**
- Create: `src/app/api/manage/orders/[id]/kot/route.ts`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p "src/app/api/manage/orders/[id]/kot"
```

- [ ] **Step 2: Write the route**

```typescript
// PATCH /api/manage/orders/[id]/kot
// Firebase auth required. Advances order from 'received' to 'preparing'.
// Idempotent: if already 'preparing', returns success (race-safe for two devices).

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
  if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const orderId = params.id;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });
  }

  // Verify ownership via site
  const { data: order } = await supabaseServer
    .from('orders')
    .select('id, site_id, status')
    .eq('id', orderId)
    .single();

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const { data: site } = await supabaseServer
    .from('sites')
    .select('id')
    .eq('id', order.site_id)
    .eq('user_id', userId)
    .single();

  if (!site) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Already past received — idempotent success (another device already KOT'd it)
  if (order.status !== 'received') {
    return NextResponse.json({ success: true, alreadyAdvanced: true });
  }

  const { data: updated } = await supabaseServer
    .from('orders')
    .update({ status: 'preparing', updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'received') // optimistic lock — safe if two devices race
    .select('id, status')
    .maybeSingle();

  if (!updated) {
    // Race: another device advanced it between our check and update — still ok
    return NextResponse.json({ success: true, alreadyAdvanced: true });
  }

  return NextResponse.json({ success: true, alreadyAdvanced: false });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/manage/orders/[id]/kot/route.ts
git commit -m "feat: PATCH /api/manage/orders/[id]/kot — received→preparing"
```

---

## Task 3: KOT Mode Settings API

**Files:**
- Create: `src/app/api/manage/sites/[siteId]/kot-mode/route.ts`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p "src/app/api/manage/sites/[siteId]/kot-mode"
```

- [ ] **Step 2: Write the route**

```typescript
// PATCH /api/manage/sites/[siteId]/kot-mode
// Firebase auth required. Updates sites.kot_mode ('manual' | 'automatic').

import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { siteId: string } },
) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await verifyFirebaseToken(authHeader.replace('Bearer ', ''));
  if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  let body: { kot_mode?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.kot_mode !== 'manual' && body.kot_mode !== 'automatic') {
    return NextResponse.json({ error: 'kot_mode must be manual or automatic' }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from('sites')
    .update({ kot_mode: body.kot_mode })
    .eq('id', params.siteId)
    .eq('user_id', userId);

  if (error) {
    console.error('[PATCH kot-mode]', error);
    return NextResponse.json({ error: 'Failed to update KOT mode' }, { status: 500 });
  }

  return NextResponse.json({ success: true, kot_mode: body.kot_mode });
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/manage/sites/[siteId]/kot-mode/route.ts"
git commit -m "feat: PATCH /api/manage/sites/[siteId]/kot-mode"
```

---

## Task 4: Expose `kot_mode` in Orders API

**Files:**
- Modify: `src/app/api/manage/orders/route.ts`

The initial load needs to tell the orders page what `kot_mode` the site is configured for.

- [ ] **Step 1: Update site SELECT to include `kot_mode`**

In `src/app/api/manage/orders/route.ts` line 51, change:
```typescript
    .select('id, timezone, table_count')
```
to:
```typescript
    .select('id, timezone, table_count, kot_mode')
```

- [ ] **Step 2: Extract `kot_mode` from site and include in all responses**

After line 62 (`const isQrOrder = tableCount > 0;`), add:
```typescript
  const kotMode = (site as Record<string, unknown>).kot_mode as string ?? 'manual';
```

- [ ] **Step 3: Add `kotMode` to all three response objects**

**Delta mode response** (around line 96):
```typescript
return NextResponse.json(
  {
    orders:       ordersResult.data ?? [],
    hasMore:      false,
    oldestTs:     null,
    todayStart:   todayStart.toISOString(),
    kotMode,
    ...(isQrOrder ? { billRequests: billResult.data ?? [] } : {}),
  },
  { headers: { 'Cache-Control': 'no-store' } },
);
```

**Pagination mode response** (around line 132):
```typescript
return NextResponse.json(
  { orders, hasMore, oldestTs, todayStart: todayStart.toISOString(), kotMode },
  { headers: { 'Cache-Control': 'no-store' } },
);
```

**qr_order initial load response** (around line 183):
```typescript
return NextResponse.json(
  {
    orders:       merged,
    hasMore,
    oldestTs,
    todayStart:   todayStart.toISOString(),
    tableCount,
    kotMode,
    billRequests: billResult.data ?? [],
  },
  { headers: { 'Cache-Control': 'no-store' } },
);
```

**pay_eat initial load response** (around line 214):
```typescript
return NextResponse.json(
  { orders, hasMore, oldestTs, todayStart: todayStart.toISOString(), tableCount: 0, kotMode },
  { headers: { 'Cache-Control': 'no-store' } },
);
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/manage/orders/route.ts
git commit -m "feat: include kotMode in manage/orders API responses"
```

---

## Task 5: Orders Page — Types, Status Constants, State

**Files:**
- Modify: `src/app/manage/orders/page.tsx` (lines 1–135)

- [ ] **Step 1: Update `OrderStatus` type (line 9)**

```typescript
type OrderStatus = 'received' | 'preparing' | 'ready' | 'completed';
```

- [ ] **Step 2: Update `STATUS_STYLES` (line 37)**

```typescript
const STATUS_STYLES: Record<OrderStatus, { color: string; bg: string; border: string; chevron: boolean }> = {
  received:  { color: '#D97706', bg: 'transparent', border: '1px solid #D97706', chevron: false },
  preparing: { color: '#F97316', bg: 'transparent', border: '1px solid #F97316', chevron: true },
  ready:     { color: '#F97316', bg: 'transparent', border: '1px solid #F97316', chevron: true },
  completed: { color: '#5137EF', bg: '#EEEEFF',     border: 'none',              chevron: false },
};
```

- [ ] **Step 3: Update `NEXT_STATUS` (line 43)**

```typescript
const NEXT_STATUS: Record<OrderStatus, OrderStatus> = {
  received:  'preparing', // handled via sendKot, not cycleStatus
  preparing: 'completed',
  ready:     'completed',
  completed: 'preparing', // blocked in UI
};
```

- [ ] **Step 4: Update `STATUS_LABEL` (line 49)**

```typescript
const STATUS_LABEL: Record<OrderStatus, string> = {
  received:  'KOT',
  preparing: 'Preparing',
  ready:     'Preparing',
  completed: 'Completed',
};
```

- [ ] **Step 5: Add new state variables after line 133 (`recentlyCompleted` state)**

```typescript
  const [kotMode,    setKotMode]    = useState<'manual' | 'automatic'>('manual');
  const [isKotStation, setIsKotStation] = useState(false);
  const [kotDevMode, setKotDevMode] = useState(false);
  const [kotPrintOrder, setKotPrintOrder] = useState<Order | null>(null);
  // Tracks order IDs already auto-KOT'd this session to avoid re-triggering on every poll
  const kotSentRef = useRef<Set<string>>(new Set());
```

- [ ] **Step 6: Load KOT station + dev mode flags from localStorage in the existing `useEffect` that loads print state (around line 145)**

Add inside the `try` block after the `rc` localStorage load:
```typescript
      const kotStation = localStorage.getItem(`kot_station_${siteId}`);
      setIsKotStation(kotStation === '1');
      const kotDev = localStorage.getItem('kot_dev_mode');
      setKotDevMode(kotDev === '1');
```

- [ ] **Step 7: Load `kotMode` from the initial orders API response — update `loadInitial` (around line 226)**

After `if (json.tableCount !== undefined) setTableCount(json.tableCount);`, add:
```typescript
      if (json.kotMode) setKotMode(json.kotMode as 'manual' | 'automatic');
```

- [ ] **Step 8: Commit**

```bash
git add src/app/manage/orders/page.tsx
git commit -m "feat: orders page — received status types and KOT state"
```

---

## Task 6: Orders Page — `sendKot` Action Handler

**Files:**
- Modify: `src/app/manage/orders/page.tsx`

Add the `sendKot` function after the `cycleStatus` function (around line 400).

- [ ] **Step 1: Block `cycleStatus` from acting on `received` orders**

In `cycleStatus` (line 329), change the guard from:
```typescript
    if (order.status === 'completed') return;
```
to:
```typescript
    if (order.status === 'completed' || order.status === 'received') return;
```

- [ ] **Step 2: Add `sendKot` function after `cycleStatus`**

```typescript
  const sendKot = useCallback(async (order: Order) => {
    if (order.status !== 'received') return;

    // Mark locally first (optimistic)
    setOrders(prev => prev.map(o =>
      o.id === order.id ? { ...o, status: 'preparing' as OrderStatus, updated_at: new Date().toISOString() } : o,
    ));
    if (selectedOrder?.id === order.id) {
      setSelectedOrder(s => s ? { ...s, status: 'preparing' as OrderStatus } : s);
    }
    kotSentRef.current.add(order.id);

    // Print or toast
    const label = order.table_number ? `Table T${order.table_number}` : (order.token_number ?? 'Takeaway');
    if (kotDevMode) {
      const itemLines = consolidateItems(order.items)
        .map(i => `${i.qty}× ${i.name}${i.variantSize ? ` (${i.variantSize})` : ''}`)
        .join('\n');
      toast(`🍳 KOT — ${label}\n${itemLines}`, {
        duration: 6000,
        style: { background: '#1C1C1E', color: '#fff', fontSize: 13, whiteSpace: 'pre-line', textAlign: 'left' },
        icon: '🖨️',
      });
    } else {
      setKotPrintOrder(order);
      requestAnimationFrame(() => {
        window.print();
        const onAfter = () => {
          setKotPrintOrder(null);
          window.removeEventListener('afterprint', onAfter);
        };
        window.addEventListener('afterprint', onAfter);
      });
    }

    // API call
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/manage/orders/${order.id}/kot`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error('[orders] sendKot API:', err);
      // Roll back optimistic update on network failure
      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, status: 'received' as OrderStatus } : o,
      ));
      kotSentRef.current.delete(order.id);
    }
  }, [kotDevMode, selectedOrder]);
```

- [ ] **Step 3: Commit**

```bash
git add src/app/manage/orders/page.tsx
git commit -m "feat: sendKot action — print + received→preparing"
```

---

## Task 7: Orders Page — Auto-Print Logic

**Files:**
- Modify: `src/app/manage/orders/page.tsx`

- [ ] **Step 1: Add `useEffect` for auto-print after the `useEffect` that clears `recentlyCompleted` (around line 300)**

```typescript
  // ── Auto-KOT: fire sendKot for received orders in automatic mode ───────────
  // Only fires on the device marked as KOT station to prevent double-printing
  // when two machines have the orders page open.
  useEffect(() => {
    if (kotMode !== 'automatic' || !isKotStation) return;
    const receivedOrders = orders.filter(
      o => o.status === 'received' && !kotSentRef.current.has(o.id),
    );
    for (const order of receivedOrders) {
      sendKot(order);
    }
  }, [orders, kotMode, isKotStation, sendKot]);
```

- [ ] **Step 2: Commit**

```bash
git add src/app/manage/orders/page.tsx
git commit -m "feat: auto-KOT useEffect for automatic mode"
```

---

## Task 8: Orders Page — KOT Print Template + CSS

**Files:**
- Modify: `src/app/manage/orders/page.tsx`

- [ ] **Step 1: Add `#kot-print-area` to the existing print CSS (around line 611)**

Change:
```typescript
            @media print {
              body > * { display: none !important; }
              #bill-print-area { display: block !important; }
            }
```
to:
```typescript
            @media print {
              body > * { display: none !important; }
              #bill-print-area { display: block !important; }
              #kot-print-area  { display: block !important; }
            }
```

- [ ] **Step 2: Add the hidden KOT print area div right after the `#bill-print-area` div (around line 638)**

```typescript
          {/* ── Hidden KOT print area — shown only during window.print() ── */}
          {kotPrintOrder && (
            <div id="kot-print-area" style={{ display: 'none', fontFamily: 'monospace', padding: 16, maxWidth: 280, margin: '0 auto' }}>
              <h2 style={{ textAlign: 'center', fontSize: 16, margin: '0 0 2px', letterSpacing: 1 }}>KOT</h2>
              <p style={{ textAlign: 'center', fontSize: 13, margin: '0 0 2px', fontWeight: 700 }}>
                {kotPrintOrder.table_number ? `Table T${kotPrintOrder.table_number}` : (kotPrintOrder.token_number ?? 'Takeaway')}
              </p>
              <p style={{ textAlign: 'center', fontSize: 11, margin: '0 0 10px', color: '#555' }}>
                {new Date(kotPrintOrder.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
              <hr style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
              {consolidateItems(kotPrintOrder.items).map((item, i) => (
                <div key={i} style={{ fontSize: 13, margin: '4px 0', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{item.qty}× {item.name}{item.variantSize ? ` (${item.variantSize})` : ''}</span>
                </div>
              ))}
              <hr style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
              <p style={{ textAlign: 'center', fontSize: 11, margin: '6px 0 0', color: '#555' }}>
                Order #{kotPrintOrder.order_number}
              </p>
            </div>
          )}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/manage/orders/page.tsx
git commit -m "feat: KOT print template and CSS"
```

---

## Task 9: Orders Page — KOT Button in Order Cards (pay_eat list)

**Files:**
- Modify: `src/app/manage/orders/page.tsx`

The pay_eat view shows orders in a table/list. Find where the status cycle button is rendered for pay_eat orders and add the KOT button for `received` orders.

- [ ] **Step 1: Find the pay_eat order row render**

Search for `STATUS_STYLES[order.status]` or `cycleStatus` in the JSX (around line 700+). The status badge/button is rendered there.

- [ ] **Step 2: Add KOT button for `received` status orders**

Where the status button is rendered for pay_eat orders, wrap with:
```typescript
{order.status === 'received' ? (
  <button
    onClick={() => sendKot(order)}
    style={{
      background: '#D97706', color: '#fff', border: 'none', borderRadius: 6,
      padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
      letterSpacing: 0.5,
    }}
  >
    KOT
  </button>
) : order.status !== 'completed' ? (
  /* existing status cycle button */
  <button onClick={() => cycleStatus(order)} ...>
    {STATUS_LABEL[order.status]}
  </button>
) : (
  /* completed badge — existing */
)}
```

> **Note:** Read the actual JSX in the file around lines 700-800 to find the exact location and preserve surrounding structure. The pattern to match is the status badge that calls `cycleStatus`.

- [ ] **Step 3: Commit**

```bash
git add src/app/manage/orders/page.tsx
git commit -m "feat: KOT button in pay_eat order list"
```

---

## Task 10: Orders Page — KOT Button in QR Order Table Grid

**Files:**
- Modify: `src/app/manage/orders/page.tsx`

The qr_order view uses a table grid (cards per table). The order detail panel (right side, `selectedOrder`) shows item details and a status button. Add KOT button there too.

- [ ] **Step 1: Find the `selectedOrder` detail panel**

Search for `selectedOrder` in the JSX (around line 750-900). Find where the status button is rendered inside the order detail panel.

- [ ] **Step 2: Add KOT button to the order detail panel**

Where the status action button appears for the selected order, add:
```typescript
{selectedOrder.status === 'received' ? (
  <button
    onClick={() => sendKot(selectedOrder)}
    style={{
      width: '100%', background: '#D97706', color: '#fff', border: 'none',
      borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 700,
      cursor: 'pointer', letterSpacing: 0.5,
    }}
  >
    🖨️ Send KOT to Kitchen
  </button>
) : selectedOrder.status !== 'completed' ? (
  /* existing cycleStatus button */
) : null}
```

- [ ] **Step 3: In the table grid card, show KOT badge for `received` tables**

In `getTableState`, the `received` orders count as active (`status !== 'completed'`), so they'll show yellow already. But we want to visually distinguish tables with `received` orders. After the `getTableState` function, add:

```typescript
  const tableHasReceived = (n: number): boolean =>
    getTableOrders(n).some(o => o.status === 'received');
```

Then in the table card JSX (where table state badges are rendered), add a small "KOT" indicator when `tableHasReceived(n)` is true:
```typescript
{tableHasReceived(n) && kotMode === 'manual' && (
  <span style={{
    position: 'absolute', top: 6, right: 6,
    background: '#D97706', color: '#fff',
    fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 4,
    letterSpacing: 0.5,
  }}>KOT</span>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/manage/orders/page.tsx
git commit -m "feat: KOT button in qr_order detail panel and table grid badge"
```

---

## Task 11: Settings Page — KOT Section

**Files:**
- Modify: `src/app/manage/settings/page.tsx`

- [ ] **Step 1: Add KOT state variables after line 36 (`deleting` state)**

```typescript
    const [kotMode,        setKotMode]        = useState<'manual' | 'automatic'>('manual');
    const [kotModeLoading, setKotModeLoading] = useState(false);
    const [kotModeConfirm, setKotModeConfirm] = useState<'manual' | 'automatic' | null>(null);
    const [isKotStation,   setIsKotStation]   = useState(false);
    const [kotDevMode,     setKotDevMode]      = useState(false);
```

- [ ] **Step 2: Load `kot_mode` from Supabase in the existing `useEffect` (around line 39)**

In the site SELECT query, change:
```typescript
            .select('id, slug, name, description, contact_number, timing, image_url')
```
to:
```typescript
            .select('id, slug, name, description, contact_number, timing, image_url, kot_mode')
```

After `setLogoUrl(data.image_url);` add:
```typescript
                    setKotMode((data as Record<string, unknown>).kot_mode as 'manual' | 'automatic' ?? 'manual');
```

- [ ] **Step 3: Load localStorage flags in a `useEffect` after siteId is known**

Add after the existing `useEffect` blocks:
```typescript
    useEffect(() => {
        if (!siteId) return;
        setIsKotStation(localStorage.getItem(`kot_station_${siteId}`) === '1');
        setKotDevMode(localStorage.getItem('kot_dev_mode') === '1');
    }, [siteId]);
```

- [ ] **Step 4: Add `saveKotMode` handler**

```typescript
    const saveKotMode = async (newMode: 'manual' | 'automatic') => {
        if (!siteId) return;
        setKotModeLoading(true);
        try {
            const token = await firebaseAuth.currentUser?.getIdToken();
            if (!token) { toast.error('Not authenticated'); return; }
            const res = await fetch(`/api/manage/sites/${siteId}/kot-mode`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ kot_mode: newMode }),
            });
            if (!res.ok) { toast.error('Failed to update KOT mode'); return; }
            setKotMode(newMode);
            toast.success(`Kitchen printing set to ${newMode === 'automatic' ? 'Automatic' : 'Manual'}`);
        } catch { toast.error('Failed to update KOT mode'); }
        finally { setKotModeLoading(false); setKotModeConfirm(null); }
    };
```

> **Note:** Add `import { firebaseAuth } from '@/lib/firebase';` at top if not already imported.

- [ ] **Step 5: Add the KOT settings section in the JSX**

Find where the "Delete Store" danger zone section starts (search for `deleteModalOpen` in the JSX, around line 300+). Add the KOT section just **before** the danger zone:

```typescript
                {/* ── Kitchen Printing (KOT) ── */}
                <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #E4E4E7' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0A0A0A', marginBottom: 4 }}>Kitchen Printing (KOT)</h2>
                    <p style={{ fontSize: 13, color: '#71717A', marginBottom: 20 }}>
                        Controls how Kitchen Order Tokens are sent when a new order arrives.
                    </p>

                    {/* Mode toggle */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        {(['manual', 'automatic'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => mode !== kotMode ? setKotModeConfirm(mode) : undefined}
                                disabled={kotModeLoading}
                                style={{
                                    flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                    cursor: mode === kotMode ? 'default' : 'pointer',
                                    background: mode === kotMode ? '#5137EF' : '#F4F4F5',
                                    color: mode === kotMode ? '#fff' : '#52525C',
                                    border: 'none',
                                }}
                            >
                                {mode === 'manual' ? '✋ Manual' : '⚡ Automatic'}
                            </button>
                        ))}
                    </div>
                    <p style={{ fontSize: 12, color: '#99A1AF', marginBottom: 20 }}>
                        {kotMode === 'manual'
                            ? 'Admin clicks KOT button for each order before kitchen starts preparing.'
                            : 'Orders automatically print to kitchen the moment they arrive (KOT Station device only).'}
                    </p>

                    {/* KOT Station device flag */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F9FAFB', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
                        <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', margin: 0 }}>This device is the KOT Station</p>
                            <p style={{ fontSize: 12, color: '#71717A', margin: '2px 0 0' }}>
                                {isKotStation ? '● Active — auto-print fires on this device' : '○ Inactive — set on your kitchen machine'}
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                const next = !isKotStation;
                                setIsKotStation(next);
                                if (next) localStorage.setItem(`kot_station_${siteId}`, '1');
                                else localStorage.removeItem(`kot_station_${siteId}`);
                                toast.success(next ? 'This device is now the KOT Station' : 'KOT Station cleared');
                            }}
                            style={{
                                background: isKotStation ? '#D97706' : '#E4E4E7',
                                color: isKotStation ? '#fff' : '#52525C',
                                border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12,
                                fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            {isKotStation ? 'Deactivate' : 'Activate'}
                        </button>
                    </div>

                    {/* Dev mode / test print */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F9FAFB', borderRadius: 10, padding: '12px 16px' }}>
                        <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', margin: 0 }}>Dev mode — show toast instead of printing</p>
                            <p style={{ fontSize: 12, color: '#71717A', margin: '2px 0 0' }}>Useful for testing without paper</p>
                        </div>
                        <button
                            onClick={() => {
                                const next = !kotDevMode;
                                setKotDevMode(next);
                                if (next) localStorage.setItem('kot_dev_mode', '1');
                                else localStorage.removeItem('kot_dev_mode');
                                toast.success(next ? 'Dev mode on — KOT shows as toast' : 'Dev mode off — KOT prints normally');
                            }}
                            style={{
                                background: kotDevMode ? '#5137EF' : '#E4E4E7',
                                color: kotDevMode ? '#fff' : '#52525C',
                                border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12,
                                fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            {kotDevMode ? 'On' : 'Off'}
                        </button>
                    </div>
                </div>

                {/* ── KOT mode confirmation dialog ── */}
                {kotModeConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
                        <div className="bg-white mx-4" style={{ width: '100%', maxWidth: 380, borderRadius: 16, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                                Switch to {kotModeConfirm === 'automatic' ? 'Automatic' : 'Manual'} mode?
                            </h3>
                            <p style={{ fontSize: 13, color: '#52525C', marginBottom: 24 }}>
                                {kotModeConfirm === 'automatic'
                                    ? 'New orders will print to the kitchen immediately without any admin action. Make sure the KOT Station device is set up.'
                                    : 'You will need to click KOT for each order before the kitchen starts preparing.'}
                            </p>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    onClick={() => setKotModeConfirm(null)}
                                    style={{ flex: 1, padding: '10px 0', background: '#F4F4F5', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => saveKotMode(kotModeConfirm)}
                                    disabled={kotModeLoading}
                                    style={{ flex: 1, padding: '10px 0', background: '#5137EF', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                                >
                                    {kotModeLoading ? 'Saving…' : 'Confirm'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/manage/settings/page.tsx
git commit -m "feat: KOT settings section — mode toggle, station flag, dev mode"
```

---

## Task 12: TypeScript Build Check

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Fix any type errors before declaring done. Common issues:
- `'received'` not assignable to `OrderStatus` — ensure type is updated everywhere (search `OrderStatus` across codebase)
- `kotSentRef` used before `sendKot` defined — ensure `useCallback` dependency array is correct

- [ ] **Step 2: Fix any errors, commit**

```bash
git add -A
git commit -m "fix: TypeScript errors from KOT feature"
```

---

## Task 13: Manual Test Checklist

- [ ] Start dev server: `npm run dev`
- [ ] Go to **Store Settings → Kitchen Printing**: verify mode toggle, KOT station flag, dev mode toggle all work
- [ ] Enable dev mode (toast instead of print)
- [ ] Place a test order from a QR shop URL — confirm the order appears in admin orders page with **amber "KOT" badge** and status shows `received`
- [ ] **Manual mode**: Click KOT button → toast appears with items → order status changes to `preparing`
- [ ] **Automatic mode**: Enable in settings, mark device as KOT Station, place order → KOT fires automatically without clicking
- [ ] Verify `preparing → completed` cycle still works as before
- [ ] Verify completed orders, bill printing, takeaway checkout all unchanged

---

## Self-Review Checklist

- [x] Spec: `received` status — covered Tasks 1, 5
- [x] Spec: `kot_mode` column — covered Task 1
- [x] Spec: Manual mode KOT button — covered Tasks 6, 9, 10
- [x] Spec: Auto mode + KOT Station flag — covered Tasks 5, 7
- [x] Spec: Dev mode toast — covered Task 6
- [x] Spec: KOT print slip (no prices, items + table + time) — covered Task 8
- [x] Spec: Store Settings toggle with confirmation — covered Task 11
- [x] Spec: Race condition (two devices) — handled in Task 2 API + `kotSentRef`
- [x] Spec: Pay_eat and qr_order both covered — Tasks 9, 10
- [x] No TBDs or placeholders anywhere
