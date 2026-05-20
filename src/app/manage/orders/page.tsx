'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { usePlan } from '@/components/PlanContext';
import { useSite } from '@/components/SiteContext';
import { usePrinterStatus } from '@/components/PrinterStatusContext';
import { firebaseAuth } from '@/lib/firebase';

type OrderStatus = 'received' | 'preparing' | 'ready' | 'completed';

interface OrderItem { qty: number; name: string; variantSize?: string; price?: number; }

interface Order {
  id: string;
  site_id: string;
  order_number: string;
  customer_name: string;
  table_number: string | null;
  items: OrderItem[];
  subtotal: number;
  payment_method: 'online' | 'counter' | 'no_payment';
  payment_status: 'pending' | 'paid';
  status: OrderStatus;
  counter_number: string | null;
  token_number: string | null;
  created_at: string;
  updated_at: string;
}

interface BillRequest {
  id: string;
  table_number: string;
  status: 'pending' | 'acknowledged';
  requested_at: string;
}

const STATUS_STYLES: Record<OrderStatus, { color: string; bg: string; border: string; chevron: boolean }> = {
  received:  { color: '#D97706', bg: '#FFFBEB',     border: '1px solid #F59E0B', chevron: false },
  preparing: { color: '#F97316', bg: 'transparent', border: '1px solid #F97316', chevron: true },
  ready:     { color: '#F97316', bg: 'transparent', border: '1px solid #F97316', chevron: true }, // legacy fallback
  completed: { color: '#5137EF', bg: '#EEEEFF',     border: 'none',              chevron: false },
};

const NEXT_STATUS: Record<OrderStatus, OrderStatus> = {
  received:  'preparing', // via KOT action, not direct cycle
  preparing: 'completed',
  ready:     'completed', // legacy — any existing ready orders advance to completed
  completed: 'preparing', // blocked in UI — completed orders show no button
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  received:  'KOT',
  preparing: 'Preparing',
  ready:     'Preparing', // legacy fallback label
  completed: 'Completed',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return d.toDateString() === new Date().toDateString() ? `Today ${time}` : `${d.toLocaleDateString('en-IN')} ${time}`;
}

function consolidateItems(items: OrderItem[]): OrderItem[] {
  const map = new Map<string, OrderItem>();
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

function consolidateOrderItems(orders: Order[]): Array<{ qty: number; name: string; variantSize?: string; price: number }> {
  const map = new Map<string, { qty: number; name: string; variantSize?: string; price: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const key = `${item.name}||${item.variantSize ?? ''}`;
      const existing = map.get(key);
      if (existing) {
        map.set(key, { ...existing, qty: existing.qty + item.qty });
      } else {
        map.set(key, { name: item.name, variantSize: item.variantSize, qty: item.qty, price: item.price ?? 0 });
      }
    }
  }
  return Array.from(map.values());
}

function itemsSummary(items: OrderItem[]): string {
  if (!items.length) return '—';
  const consolidated = consolidateItems(items);
  const first3 = consolidated.slice(0, 3).map(i => `${i.name}${i.variantSize ? ` (${i.variantSize})` : ''}`);
  const rest   = consolidated.length - 3;
  return rest > 0 ? `${first3.join(', ')} +${rest} more` : first3.join(', ');
}

async function getToken(forceRefresh = false): Promise<string | null> {
  try {
    return await firebaseAuth.currentUser?.getIdToken(forceRefresh) ?? null;
  } catch {
    return null;
  }
}

// Fetch wrapper that retries once with a force-refreshed token on 401.
async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let token = await getToken();
  const makeReq = (t: string | null) => fetch(url, {
    ...init,
    headers: { ...init.headers, ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  });
  const res = await makeReq(token);
  if (res.status === 401) {
    // Token expired — force refresh once and retry
    token = await getToken(true);
    return makeReq(token);
  }
  return res;
}

export default function OrdersPage() {
  const { isPayEat, isQrOrder } = usePlan();
  const { activeSite } = useSite();
  // Bridge status comes from the global PrinterStatusProvider — the header
  // owns polling and surfaces status; orders page just reads.
  const { bridgeToken } = usePrinterStatus();

  const [orders,      setOrders]      = useState<Order[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const [oldestTs,    setOldestTs]    = useState<string | null>(null);
  const [todayStart,  setTodayStart]  = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updatingId,    setUpdatingId]    = useState<string | null>(null);
  const [confirmingId,  setConfirmingId]  = useState<string | null>(null);
  const [billRequests,  setBillRequests]  = useState<BillRequest[]>([]);

  // ── Table grid state (qr_order plan) ───────────────────────────────────────
  const [tableCount,        setTableCount]        = useState(0);
  // printedTableOrders: table number → Set of order IDs included in the last bill print.
  // Allows detecting "new orders added after bill printed" per table.
  const [printedTableOrders, setPrintedTableOrders] = useState<Record<string, Set<string>>>({});
  const [printedOrders,      setPrintedOrders]      = useState<Set<string>>(new Set());
  const [billPrintTarget,   setBillPrintTarget]   = useState<{ label: string; orders: Order[] } | null>(null);
  const [infoTableNum,      setInfoTableNum]      = useState<number | null>(null);
  const [infoOrder,         setInfoOrder]         = useState<Order | null>(null);
  const [checkoutTarget,      setCheckoutTarget]      = useState<{ num: number } | null>(null);
  const [checkoutOrderTarget, setCheckoutOrderTarget] = useState<Order | null>(null);
  const [checkoutPayMethod,   setCheckoutPayMethod]   = useState<'cash' | 'card' | 'upi'>('cash');
  const [checkoutLoading,     setCheckoutLoading]     = useState(false);
  // recentlyCompleted: orderId → expiry timestamp (Date.now() + 2 min)
  const [recentlyCompleted, setRecentlyCompleted] = useState<Record<string, number>>({});

  // ── KOT state ──────────────────────────────────────────────────────────────
  const [kotMode,         setKotMode]         = useState<string>('manual');
  const [kotDevMode,      setKotDevMode]      = useState(false);
  const [kotPrinterName,  setKotPrinterName]  = useState<string | null>(null);
  const [billPrinterName, setBillPrinterName] = useState<string | null>(null);

  // kotPrintOrder: the order whose KOT slip should be printed right now
  const [kotPrintOrder, setKotPrintOrder] = useState<Order | null>(null);
  // kotSentRef: order IDs that have already triggered KOT (prevents double auto-print)
  const kotSentRef = useRef<Set<string>>(new Set());

  // localStorage has been loaded for this siteId
  const lsLoadedRef = useRef(false);

  // Track server-clock of last successful poll so delta mode works correctly
  const lastPollRef = useRef<string | null>(null);

  const siteId = activeSite?.id;

  // ── localStorage: persist print + linger state across refreshes ───────────
  // Load once when siteId first becomes known
  useEffect(() => {
    if (!siteId || lsLoadedRef.current) return;
    lsLoadedRef.current = true;
    const date = new Date().toISOString().slice(0, 10);
    try {
      // qr_pto: printed table orders — Record<tableNum, orderId[]>
      const pto = localStorage.getItem(`qr_pto_${siteId}_${date}`);
      if (pto) {
        const raw = JSON.parse(pto) as Record<string, string[]>;
        setPrintedTableOrders(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, new Set(v)])));
      }
      const po = localStorage.getItem(`qr_po_${siteId}_${date}`);
      if (po) setPrintedOrders(new Set(JSON.parse(po) as string[]));
      const rc = localStorage.getItem(`qr_rc_${siteId}_${date}`);
      if (rc) setRecentlyCompleted(JSON.parse(rc) as Record<string, number>);
      setKotDevMode(localStorage.getItem('kot_dev_mode') === '1' || process.env.NODE_ENV !== 'production');
    } catch { /* localStorage unavailable or corrupt — start fresh */ }
  }, [siteId]);

  useEffect(() => {
    if (!siteId || !lsLoadedRef.current) return;
    const date = new Date().toISOString().slice(0, 10);
    try {
      const serializable = Object.fromEntries(
        Object.entries(printedTableOrders).map(([k, v]) => [k, Array.from(v)]),
      );
      localStorage.setItem(`qr_pto_${siteId}_${date}`, JSON.stringify(serializable));
    } catch {}
  }, [siteId, printedTableOrders]);

  useEffect(() => {
    if (!siteId || !lsLoadedRef.current) return;
    const date = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(`qr_po_${siteId}_${date}`, JSON.stringify(Array.from(printedOrders))); } catch {}
  }, [siteId, printedOrders]);

  useEffect(() => {
    if (!siteId || !lsLoadedRef.current) return;
    const date = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(`qr_rc_${siteId}_${date}`, JSON.stringify(recentlyCompleted)); } catch {}
  }, [siteId, recentlyCompleted]);

  // ── Merge incoming orders into current state ────────────────────────────────
  // Appends new rows; updates existing rows in place. Preserves scroll position.
  const mergeOrders = useCallback((incoming: Order[]) => {
    if (incoming.length === 0) return;
    setOrders(prev => {
      const byId  = new Map(prev.map(o => [o.id, o]));
      let changed = false;
      for (const o of incoming) {
        const existing = byId.get(o.id);
        // Only replace if incoming row is genuinely newer (avoids clobbering optimistic state)
        if (!existing || new Date(o.updated_at) >= new Date(existing.updated_at)) {
          byId.set(o.id, o);
          changed = true;
        }
      }
      if (!changed) return prev;
      return Array.from(byId.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    });
  }, []);

  // ── Initial full load ───────────────────────────────────────────────────────
  const loadInitial = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/manage/orders?site_id=${encodeURIComponent(siteId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      const rows: Order[] = json.orders ?? [];
      setOrders(rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setHasMore(json.hasMore ?? false);
      setOldestTs(json.oldestTs ?? null);
      setTodayStart(json.todayStart ?? null);
      if (json.tableCount !== undefined) setTableCount(json.tableCount);
      if (json.kotMode !== undefined) setKotMode(json.kotMode);
      if (json.kotPrinterName  !== undefined) setKotPrinterName(json.kotPrinterName ?? null);
      if (json.billPrinterName !== undefined) setBillPrinterName(json.billPrinterName ?? null);
      if (json.billRequests !== undefined) setBillRequests(json.billRequests ?? []);
      // Anchor delta polling from the newest row's updated_at
      if (rows.length > 0) {
        const newest = rows.reduce((a, b) => a.updated_at > b.updated_at ? a : b);
        lastPollRef.current = newest.updated_at;
      } else {
        lastPollRef.current = new Date().toISOString();
      }
    } catch (err) {
      console.error('[orders] initial load:', err);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  // ── Delta poll — only fetches rows changed since last poll ─────────────────
  // Fires every 4 s but transfers only new/changed rows, not the whole list.
  const pollDelta = useCallback(async () => {
    if (!siteId || !lastPollRef.current) return;
    try {
      const since = lastPollRef.current;
      const res = await authedFetch(
        `/api/manage/orders?site_id=${encodeURIComponent(siteId)}&since=${encodeURIComponent(since)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const json = await res.json();
      const rows: Order[] = json.orders ?? [];
      mergeOrders(rows);
      if (json.billRequests !== undefined) setBillRequests(json.billRequests ?? []);
      if (rows.length > 0) {
        const newest = rows.reduce((a, b) => a.updated_at > b.updated_at ? a : b);
        if (newest.updated_at > (lastPollRef.current ?? '')) {
          lastPollRef.current = newest.updated_at;
        }
      }
    } catch (err) {
      console.error('[orders] delta poll:', err);
    }
  }, [siteId, mergeOrders]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // Bridge token + per-role printer health now live in PrinterStatusContext
  // (mounted at /manage layout). The header indicator surfaces status — this
  // page reads `bridgeToken` for POST /print and lets the global popover
  // handle visibility of offline / degraded printers.

  // Poll every 4 s, pause when tab hidden
  useEffect(() => {
    if (!siteId) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!id) id = setInterval(pollDelta, 4_000); };
    const stop  = () => { if (id) { clearInterval(id); id = null; } };
    const onVis = () => document.visibilityState === 'visible' ? (pollDelta(), start()) : stop();
    // 4 s order polling is expensive — never start it in a background tab.
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [siteId, pollDelta]);

  // ── Auto-clear recentlyCompleted after 2 minutes ───────────────────────────
  useEffect(() => {
    if (Object.keys(recentlyCompleted).length === 0) return;
    const id = setInterval(() => {
      const now = Date.now();
      setRecentlyCompleted(prev => {
        const next = { ...prev };
        let changed = false;
        for (const orderId of Object.keys(next)) {
          if (next[orderId] <= now) { delete next[orderId]; changed = true; }
        }
        return changed ? next : prev;
      });
    }, 15_000);
    return () => clearInterval(id);
  }, [recentlyCompleted]);

  // ── Load earlier orders (cursor pagination) ─────────────────────────────────
  const loadMore = useCallback(async () => {
    if (!siteId || !oldestTs || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await authedFetch(
        `/api/manage/orders?site_id=${encodeURIComponent(siteId)}&before=${encodeURIComponent(oldestTs)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const json = await res.json();
      const rows: Order[] = json.orders ?? [];
      mergeOrders(rows);
      setHasMore(json.hasMore ?? false);
      if (rows.length > 0) {
        const oldest = rows.reduce((a, b) => a.created_at < b.created_at ? a : b);
        setOldestTs(oldest.created_at);
      }
    } catch (err) {
      console.error('[orders] load more:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [siteId, oldestTs, loadingMore, mergeOrders]);

  // ── Advance status (with optimistic locking) ────────────────────────────────
  const cycleStatus = useCallback(async (order: Order) => {
    if (order.status === 'completed') return;
    const expectedStatus = order.status;
    const newStatus      = NEXT_STATUS[order.status];

    // Optimistic update immediately
    setUpdatingId(order.id);
    setOrders(prev => prev.map(o =>
      o.id === order.id ? { ...o, status: newStatus, updated_at: new Date().toISOString() } : o,
    ));
    if (selectedOrder?.id === order.id) setSelectedOrder(s => s ? { ...s, status: newStatus } : s);

    try {
      const res = await authedFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, expected_status: expectedStatus }),
      });

      if (res.status === 409) {
        // Conflict: another session already changed the status. Sync the real state.
        const data = await res.json();
        const actualStatus = (data.currentStatus ?? expectedStatus) as OrderStatus;
        setOrders(prev => prev.map(o =>
          o.id === order.id ? { ...o, status: actualStatus } : o,
        ));
        if (selectedOrder?.id === order.id) {
          setSelectedOrder(s => s ? { ...s, status: actualStatus } : s);
        }
      } else if (!res.ok) {
        // Server error: roll back optimistic update
        setOrders(prev => prev.map(o =>
          o.id === order.id ? { ...o, status: expectedStatus } : o,
        ));
        console.error('[orders] cycleStatus failed:', await res.json().catch(() => ({})));
      }
    } catch (err) {
      // Network error: roll back
      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, status: expectedStatus } : o,
      ));
      console.error('[orders] cycleStatus network:', err);
    } finally {
      setUpdatingId(null);
    }
  }, [selectedOrder]);

  // ── KOT: print slip + advance received → preparing ─────────────────────────
  const sendKot = useCallback(async (order: Order) => {
    if (order.status !== 'received') return;
    kotSentRef.current.add(order.id);

    // Optimistic update
    setOrders(prev => prev.map(o =>
      o.id === order.id ? { ...o, status: 'preparing', updated_at: new Date().toISOString() } : o,
    ));

    // Fire print — Windows bridge → APK bridge → dev toast → browser print
    const kotLabel = order.table_number ? `Table T${order.table_number}` : (order.token_number ?? 'Takeaway');
    const kotItems = consolidateItems(order.items).map(i => ({ qty: i.qty, name: i.name, variant: i.variantSize ?? null }));

    if (kotPrinterName) {
      fetch('http://127.0.0.1:7878/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-BYS-Token': bridgeToken },
        body: JSON.stringify({
          role: 'kot',
          type: 'kot',
          orderId: order.id, // enables server-side dedup of KOT re-fires
          data: {
            siteName: activeSite?.name ?? 'Kitchen',
            label: kotLabel,
            orderNumber: order.order_number,
            createdAt: order.created_at,
            items: kotItems,
          },
        }),
      }).catch(() => toast.error('Print bridge not running — check Settings'));
    } else if (typeof window !== 'undefined' && window.KOTPrint) {
      window.KOTPrint.print(JSON.stringify({
        type: 'kot', site: activeSite?.name ?? 'Kitchen',
        label: kotLabel, order_number: order.order_number,
        created_at: order.created_at, items: kotItems,
      }));
    } else if (kotDevMode) {
      const items = kotItems.map(i => `${i.qty}× ${i.name}${i.variant ? ` (${i.variant})` : ''}`).join('\n');
      toast(`🖨 KOT — ${kotLabel}\n${items}`, { duration: 6000, style: { whiteSpace: 'pre-line', fontFamily: 'monospace', fontSize: 13 } });
    } else {
      setKotPrintOrder(order);
      requestAnimationFrame(() => { window.print(); });
    }

    try {
      const res = await authedFetch(`/api/manage/orders/${order.id}/kot`, { method: 'PATCH' });
      if (!res.ok && res.status !== 409) {
        // Rollback on unexpected error
        setOrders(prev => prev.map(o =>
          o.id === order.id ? { ...o, status: 'received' } : o,
        ));
        kotSentRef.current.delete(order.id);
        toast.error('KOT failed — please retry');
      }
    } catch {
      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, status: 'received' } : o,
      ));
      kotSentRef.current.delete(order.id);
      toast.error('KOT failed — network error');
    } finally {
      // Clear print target after a short delay (enough for print dialog)
      setTimeout(() => setKotPrintOrder(null), 3000);
    }
  }, [kotDevMode, kotPrinterName]);

  // ── Send Bill receipt to bill printer ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sendBill = useCallback(async (order: Order) => {
    const label = order.table_number ? `Table T${order.table_number}` : (order.token_number ?? 'Takeaway');
    const items = consolidateItems(order.items).map(i => {
      const price = i.price ?? 0;
      const total = price * i.qty;
      return { qty: i.qty, name: i.name, variant: i.variantSize ?? null, price, total };
    });
    const grandTotal = order.subtotal ?? items.reduce((s, i) => s + i.total, 0);

    if (billPrinterName) {
      fetch('http://127.0.0.1:7878/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-BYS-Token': bridgeToken },
        body: JSON.stringify({
          role: 'bill',
          type: 'bill',
          orderId: order.id, // dedup re-fires of bill prints for the same order
          data: {
            siteName:    activeSite?.name ?? 'Store',
            label,
            orderNumber: order.order_number,
            createdAt:   order.created_at,
            items,
            subtotal:  grandTotal,
            grandTotal,
            currencySymbol: 'Rs.',
          },
        }),
      })
        .then(r => { if (r.ok) toast.success('Bill printed'); else toast.error('Bill print failed'); })
        .catch(() => toast.error('Print bridge not running — check Settings'));
    } else if (kotDevMode) {
      toast(`Bill — ${label} — Total Rs.${grandTotal}`, { duration: 4000, style: { fontFamily: 'monospace', fontSize: 13 } });
    } else {
      toast.error('No bill printer assigned — go to Settings to assign one');
    }
  }, [billPrinterName, kotDevMode]);

  // ── Auto-print KOT in automatic mode ──────────────────────────────────────
  // Fires whenever a new received order arrives — uses whatever print method is configured
  // (Windows bridge → APK → dev toast → browser print).
  useEffect(() => {
    if (kotMode !== 'automatic') return;
    const receivedOrders = orders.filter(o => o.status === 'received' && !kotSentRef.current.has(o.id));
    for (const order of receivedOrders) {
      sendKot(order);
    }
  }, [orders, kotMode, sendKot]);

  // ── Confirm counter payment ─────────────────────────────────────────────────
  const confirmCounterPayment = useCallback(async (order: Order) => {
    setConfirmingId(order.id);
    try {
      const res = await authedFetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_counter_payment' }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrders(prev => prev.map(o =>
          o.id === order.id
            ? { ...o, payment_status: 'paid', token_number: data.tokenNumber, updated_at: new Date().toISOString() }
            : o,
        ));
      } else {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Could not confirm payment: ${data.error}`);
      }
    } catch (err) {
      console.error('[orders] confirmCounterPayment:', err);
    } finally {
      setConfirmingId(null);
    }
  }, []);

  // Acknowledge a bill request. Reason is REQUIRED by the API (I8 hardening)
  // so the audit log captures why a manual dismissal happened — without a
  // reason the cashier can't quietly clear a bill request that should have
  // become a checkout. Auto-callers (e.g. bill-printed flow) pass a synthetic
  // reason so the audit row shows the chain of events.
  const acknowledgeBillRequest = useCallback(async (id: string, reason: string) => {
    try {
      const res = await authedFetch(`/api/manage/bill-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error ?? 'Could not dismiss bill request');
        return;
      }
      setBillRequests(prev => prev.filter(br => br.id !== id));
    } catch (err) {
      console.error('[orders] acknowledgeBillRequest:', err);
    }
  }, []);

  // Manual UI handler — prompts the cashier for a reason. The browser `prompt`
  // is intentionally non-dismissable: cancelling = no ack. Replace with a
  // custom modal once the design system has one.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const promptDismissBillRequest = useCallback((id: string) => {
    const reason = typeof window !== 'undefined'
      ? window.prompt('Why are you dismissing this bill request?\n\nThis will be recorded in the audit log. Examples: "customer changed mind", "false request", "already paid in cash".')
      : null;
    if (!reason) return; // cancelled
    const clean = reason.trim();
    if (clean.length < 3) {
      toast.error('Reason must be at least 3 characters');
      return;
    }
    acknowledgeBillRequest(id, clean);
  }, [acknowledgeBillRequest]);

  // ── Table grid helpers ─────────────────────────────────────────────────────
  const getTableOrders = (n: number) =>
    orders.filter(o => o.table_number === String(n) && o.status !== 'completed');

  const tableHasReceived = (n: number) =>
    getTableOrders(n).some(o => o.status === 'received');

  const getTableState = (n: number): 'empty' | 'active' | 'bill_requested' | 'bill_printed' | 'new_after_print' => {
    const activeOrds = getTableOrders(n);
    if (activeOrds.length === 0) return 'empty';
    // Bill request always surfaces first — customer is actively asking for staff attention.
    // Must be checked before printedIds so it isn't buried by bill_printed / new_after_print.
    if (billRequests.some(br => br.table_number === String(n) && br.status === 'pending')) return 'bill_requested';
    const printedIds = printedTableOrders[String(n)];
    if (printedIds && printedIds.size > 0) {
      // If none of the printed orders are still active, the previous session ended
      // (admin cycled status to completed without using checkout). Treat as fresh table.
      const printedStillActive = activeOrds.some(o => printedIds.has(o.id));
      if (printedStillActive) {
        const hasNew = activeOrds.some(o => !printedIds.has(o.id));
        return hasNew ? 'new_after_print' : 'bill_printed';
      }
    }
    return 'active';
  };

  const doPrint = (label: string, printOrders: Order[], onPrinted: () => void) => {
    setBillPrintTarget({ label, orders: printOrders });
    requestAnimationFrame(() => {
      window.print();
      const onAfterPrint = () => {
        onPrinted();
        window.removeEventListener('afterprint', onAfterPrint);
        setBillPrintTarget(null);
      };
      window.addEventListener('afterprint', onAfterPrint);
    });
  };

  const handlePrint = (n: number) => {
    const tableOrds = getTableOrders(n);
    doPrint(`Table T${n}`, tableOrds, () => {
      // Snapshot the exact order IDs printed — lets us detect new items added later.
      const ids = new Set(tableOrds.map(o => o.id));
      setPrintedTableOrders(prev => ({ ...prev, [String(n)]: ids }));
      const br = billRequests.find(b => b.table_number === String(n) && b.status === 'pending');
      if (br) acknowledgeBillRequest(br.id, 'auto:bill_printed');
    });
  };

  const handlePrintOrder = (order: Order) => {
    doPrint(order.token_number ?? 'Takeaway', [order], () => {
      setPrintedOrders(prev => { const next = new Set(prev); next.add(order.id); return next; });
    });
  };

  const handleCheckout = (n: number) => {
    setCheckoutTarget({ num: n });
    setCheckoutPayMethod('cash');
  };

  const submitCheckout = async () => {
    if (!checkoutTarget || !siteId) return;
    setCheckoutLoading(true);
    try {
      const res = await authedFetch('/api/manage/table-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: siteId, table_number: String(checkoutTarget.num), payment_method: checkoutPayMethod }),
      });
      if (res.ok) {
        const tNum = String(checkoutTarget.num);
        // Optimistic: mark orders as completed, clear local state
        setOrders(prev => prev.map(o =>
          o.table_number === tNum && o.status !== 'completed'
            ? { ...o, status: 'completed', updated_at: new Date().toISOString() }
            : o,
        ));
        setPrintedTableOrders(prev => { const next = { ...prev }; delete next[tNum]; return next; });
        setBillRequests(prev => prev.filter(br => br.table_number !== tNum));
        setCheckoutTarget(null);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(`Checkout failed: ${(d as { error?: string }).error ?? 'Unknown error'}`);
      }
    } catch (err) {
      console.error('[orders] submitCheckout:', err);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const submitTakeawayCheckout = async () => {
    if (!checkoutOrderTarget || !siteId) return;
    setCheckoutLoading(true);
    try {
      const res = await authedFetch('/api/manage/table-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id:     siteId,
          order_id:    checkoutOrderTarget.id,
          token_label: checkoutOrderTarget.token_number ?? 'Takeaway',
          payment_method: checkoutPayMethod,
        }),
      });
      if (res.ok) {
        // Optimistic: mark order as completed in local orders state
        setOrders(prev => prev.map(o =>
          o.id === checkoutOrderTarget.id ? { ...o, status: 'completed', updated_at: new Date().toISOString() } : o,
        ));
        // Keep card visible for 2 minutes then auto-clear
        setRecentlyCompleted(prev => ({ ...prev, [checkoutOrderTarget.id]: Date.now() + 2 * 60 * 1000 }));
        setPrintedOrders(prev => { const next = new Set(prev); next.delete(checkoutOrderTarget.id); return next; });
        setCheckoutOrderTarget(null);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(`Checkout failed: ${(d as { error?: string }).error ?? 'Unknown error'}`);
      }
    } catch (err) {
      console.error('[orders] submitTakeawayCheckout:', err);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const orderIdLabel = (order: Order) =>
    order.token_number ?? order.counter_number ?? `#${order.order_number}`;

  const COLS       = ['ORDER ID', 'CUSTOMER', 'ITEMS', 'TIME', 'AMOUNT', 'PAYMENT', 'STATUS'];
  const consolidatedItems = selectedOrder ? consolidateItems(selectedOrder.items) : [];
  const totalItems = consolidatedItems.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8">
      <div className="mb-5 lg:mb-6">
        <h1 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 26, lineHeight: '32px' }}>Orders</h1>
        <p className="text-[#52525C] mt-1" style={{ fontSize: 14, fontWeight: 400, lineHeight: '22px' }}>
          Live orders for today · updates every 4 s
          {todayStart && (
            <span className="ml-2 text-[#99A1AF]" style={{ fontSize: 12 }}>
              (since {new Date(todayStart).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })} local)
            </span>
          )}
        </p>
      </div>

      {/* Print bridge status moved to the global header (PrinterStatusIndicator).
          Per-role health + offline state surface there as a printer icon with a
          coloured dot; clicking opens the per-printer popover. */}

      {isPayEat && !loading && (
        <>
          <div className="flex items-center gap-8 mb-5" style={{ borderBottom: '1px solid #E4E4E7', paddingBottom: 16 }}>
            {[
              { label: 'Today Orders',    value: orders.length },
              { label: 'Active Orders',   value: orders.filter(o => o.status !== 'completed').length },
              { label: 'Completed',       value: orders.filter(o => o.status === 'completed').length },
            ].map(stat => (
              <div key={stat.label}>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', lineHeight: 1 }}>{stat.value}</p>
                <p style={{ fontSize: 13, color: '#71717A', marginTop: 4 }}>{stat.label}</p>
              </div>
            ))}
          </div></>
      )}

      {!isPayEat && !isQrOrder && (
        <div className="flex flex-col items-center justify-center text-center" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '48px 24px', background: '#FAFAFA' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#EEEEFF', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#5137EF' }}>lock</span>
          </div>
          <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 16, marginBottom: 6 }}>Orders — Upgrade to Unlock</p>
          <p className="text-[#71717A]" style={{ fontSize: 13, marginBottom: 20, maxWidth: 320 }}>
            Order management is available on the Pay-Eat plan. Upgrade to start accepting and tracking orders in real time.
          </p>
          <Link href="/manage/subscription" style={{ background: '#5137EF', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_upward</span>
            Upgrade Plan
          </Link>
        </div>
      )}

      {isQrOrder && (
        <>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg) } }
            @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
            @keyframes tablePulse {
              0%,100% { box-shadow: 0 0 0 0 rgba(249,115,22,0); }
              50% { box-shadow: 0 0 0 8px rgba(249,115,22,0.25); }
            }
            @media print {
              body > * { display: none !important; }
              #bill-print-area { display: block !important; }
              #kot-print-area { display: block !important; }
            }
          `}</style>

          {/* ── Hidden bill print area ── */}
          {billPrintTarget && (
            <div id="bill-print-area" style={{ display: 'none', fontFamily: 'monospace', padding: 24, maxWidth: 300, margin: '0 auto' }}>
              <h2 style={{ textAlign: 'center', fontSize: 18, margin: '0 0 2px' }}>{activeSite?.name ?? 'Restaurant'}</h2>
              <p style={{ textAlign: 'center', fontSize: 12, margin: '0 0 2px', color: '#52525C' }}>{billPrintTarget.label}</p>
              <p style={{ textAlign: 'center', fontSize: 12, margin: '0 0 14px', color: '#52525C' }}>
                {new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
              <hr style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />
              {consolidateOrderItems(billPrintTarget.orders).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, margin: '5px 0' }}>
                  <span>{item.qty}× {item.name}{item.variantSize ? ` (${item.variantSize})` : ''}</span>
                  {item.price > 0 && <span>₹{Math.round(item.price * item.qty * 100) / 100}</span>}
                </div>
              ))}
              <hr style={{ borderTop: '1px dashed #999', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, margin: '8px 0' }}>
                <span>TOTAL</span>
                <span>₹{Math.round(billPrintTarget.orders.reduce((s, o) => s + o.subtotal, 0) * 100) / 100}</span>
              </div>
              <p style={{ textAlign: 'center', fontSize: 12, marginTop: 24 }}>Thank you for dining with us!</p>
            </div>
          )}

          {/* ── Hidden KOT print area ── */}
          {kotPrintOrder && (
            <div id="kot-print-area" style={{ display: 'none', fontFamily: 'monospace', padding: 24, maxWidth: 300, margin: '0 auto' }}>
              <h2 style={{ textAlign: 'center', fontSize: 16, margin: '0 0 2px', fontWeight: 700 }}>
                {kotPrintOrder.table_number ? `KOT — Table T${kotPrintOrder.table_number}` : `KOT — ${kotPrintOrder.token_number ?? 'Takeaway'}`}
              </h2>
              <p style={{ textAlign: 'center', fontSize: 11, margin: '0 0 10px', color: '#52525C' }}>
                {activeSite?.name ?? 'Kitchen Order'}
              </p>
              <hr style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
              {consolidateItems(kotPrintOrder.items).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '6px 0' }}>
                  <span><strong>{item.qty}×</strong> {item.name}{item.variantSize ? ` (${item.variantSize})` : ''}</span>
                </div>
              ))}
              <hr style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                <span>Order #{kotPrintOrder.order_number}</span>
                <span>{new Date(kotPrintOrder.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
              </div>
            </div>
          )}

          {/* ── Stats ── */}
          {!loading && (
            <div className="flex items-center gap-8 mb-5" style={{ borderBottom: '1px solid #E4E4E7', paddingBottom: 16 }}>
              {[
                { label: 'Active Tables',    value: Array.from(new Set(orders.filter(o => o.status !== 'completed' && o.table_number).map(o => o.table_number))).length },
                { label: 'Takeaway',         value: orders.filter(o => !o.table_number && o.status !== 'completed').length },
                { label: 'Bill Requests',    value: billRequests.filter(br => br.status === 'pending').length },
                { label: 'Total Orders Today', value: orders.filter(o => o.status === 'completed').length },
              ].map(stat => (
                <div key={stat.label}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: (stat.label === 'Bill Requests' || stat.label === 'Takeaway') && stat.value > 0 ? '#F97316' : '#0A0A0A', lineHeight: 1 }}>{stat.value}</p>
                  <p style={{ fontSize: 13, color: '#71717A', marginTop: 4 }}>{stat.label}</p>
                </div>
              ))}
            </div>
          )}
          {/* ── Loading ── */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div style={{ width: 28, height: 28, border: '3px solid #e6e6e6', borderTopColor: '#5137EF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}

          {/* ── Table grid ── */}
          {!loading && (
            <>
              {/* ── Takeaway cards — shown first so they're never buried under the table grid ── */}
              {(() => {
                const activeOrds     = orders.filter(o => !o.table_number && o.status !== 'completed');
                const lingeringOrds  = orders.filter(o => !o.table_number && o.status === 'completed' && recentlyCompleted[o.id]);
                const takeawayOrds   = [...activeOrds, ...lingeringOrds];
                if (takeawayOrds.length === 0) return null;
                return (
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: activeOrds.length > 0 ? '#F97316' : '#71717A', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>shopping_bag</span>
                      Takeaway{activeOrds.length > 0 ? ` — ${activeOrds.length} active` : ''}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                      {takeawayOrds.map(order => {
                        const isDone    = !!recentlyCompleted[order.id];
                        const isPrinted = !isDone && printedOrders.has(order.id);
                        const twNum     = order.token_number?.replace(/^Takeaway\s*/i, '') ?? '?';

                        if (isDone) {
                          return (
                            <div key={order.id} style={{ borderRadius: 12, border: '2px solid #E4E4E7', background: '#F9FAFB', padding: '14px 12px', minHeight: 110, display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Takeaway</p>
                              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#A1A1AA' }}>{twNum}</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#16A34A' }}>check_circle</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#16A34A' }}>Done</span>
                              </div>
                              <p style={{ margin: 0, fontSize: 10, color: '#A1A1AA' }}>Clears in ~2 min</p>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={order.id}
                            style={{
                              position: 'relative',
                              borderRadius: 12,
                              border: isPrinted ? '2px solid #16A34A' : '2px solid #F59E0B',
                              background: isPrinted ? '#F0FDF4' : '#FFFBEB',
                              padding: '14px 12px',
                              paddingBottom: 52,
                              minHeight: 110,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                            }}
                          >
                            <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Takeaway</p>
                            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0A0A0A' }}>{twNum}</p>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: isPrinted ? '#15803D' : '#92400E' }}>₹{order.subtotal}</p>

                            <div style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => setInfoOrder(order)}
                                title="View items"
                                style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #E4E4E7', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#52525C' }}>info</span>
                              </button>
                              {isPrinted ? (
                                <button
                                  onClick={() => { setCheckoutOrderTarget(order); setCheckoutPayMethod('cash'); }}
                                  title="Checkout"
                                  style={{ width: 30, height: 30, borderRadius: 6, background: '#16A34A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>point_of_sale</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => handlePrintOrder(order)}
                                  title="Print ticket"
                                  style={{ width: 30, height: 30, borderRadius: 6, background: '#F59E0B', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>print</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {tableCount === 0 ? (
                <div className="flex flex-col items-center justify-center text-center" style={{ border: '1px dashed #D4D4D8', borderRadius: 14, padding: '48px 24px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#A1A1AA', marginBottom: 12 }}>table_restaurant</span>
                  <p className="font-medium text-[#52525C]" style={{ fontSize: 14, marginBottom: 8 }}>No table QR codes created yet</p>
                  <Link href="/manage/qr" style={{ fontSize: 13, color: '#5137EF', textDecoration: 'underline' }}>Create table QR codes →</Link>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
                  {Array.from({ length: tableCount }, (_, i) => i + 1).map(n => {
                    const tableOrds = getTableOrders(n);
                    const total     = Math.round(tableOrds.reduce((s, o) => s + o.subtotal, 0) * 100) / 100;
                    const state          = getTableState(n);
                    const isEmpty        = state === 'empty';
                    const isPrinted      = state === 'bill_printed';
                    const isReq          = state === 'bill_requested';
                    const isNewAfterPrint = state === 'new_after_print';

                    return (
                      <div
                        key={n}
                        style={{
                          position: 'relative',
                          borderRadius: 12,
                          border: isPrinted      ? '2px solid #16A34A'
                                : isReq          ? '2px solid #F97316'
                                : isEmpty        ? '2px dashed #D4D4D8'
                                :                  '2px solid #F59E0B',
                          background: isPrinted  ? '#F0FDF4'
                                    : !isEmpty   ? '#FFFBEB'
                                    :              '#FAFAFA',
                          padding: '14px 12px',
                          paddingBottom: isEmpty ? 14 : 52,
                          minHeight: 110,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          animation: isReq ? 'tablePulse 1.6s ease-in-out infinite' : 'none',
                        }}
                      >
                        {/* Table label */}
                        <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: isEmpty ? '#A1A1AA' : '#0A0A0A' }}>T{n}</p>

                        {/* Order count + amount */}
                        {!isEmpty && (
                          <>
                            <p style={{ margin: 0, fontSize: 11, color: '#71717A' }}>
                              {tableOrds.length} order{tableOrds.length !== 1 ? 's' : ''}
                            </p>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: isPrinted ? '#15803D' : '#92400E' }}>
                              ₹{total}
                            </p>
                          </>
                        )}

                        {/* KOT badge (top-right) — received orders waiting for kitchen */}
                        {!isEmpty && tableHasReceived(n) && (
                          <span style={{
                            position: 'absolute', top: 8, right: 8,
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                            color: '#fff', background: '#D97706',
                            borderRadius: 4, padding: '2px 5px',
                          }}>KOT</span>
                        )}

                        {/* "NEW" badge — new items added after bill was printed (only when no KOT pending) */}
                        {isNewAfterPrint && !tableHasReceived(n) && (
                          <span style={{
                            position: 'absolute', top: 8, right: 8,
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
                            color: '#fff', background: '#F59E0B',
                            borderRadius: 4, padding: '2px 5px',
                          }}>NEW</span>
                        )}

                        {/* Bill-requested dot */}
                        {isReq && (
                          <div style={{ position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: '50%', background: '#F97316', animation: 'pulse 1s ease-in-out infinite' }} />
                        )}

                        {/* Action buttons */}
                        {!isEmpty && (() => {
                          // kotReady = all active orders have been KOT'd (no received pending)
                          //            OR mode is automatic (auto handles them)
                          const hasReceived  = tableHasReceived(n);
                          const kotReady     = !hasReceived || kotMode === 'automatic';
                          return (
                            <div style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: 6 }}>
                              {/* Info */}
                              <button
                                onClick={() => setInfoTableNum(n)}
                                title="View items"
                                style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #E4E4E7', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#52525C' }}>info</span>
                              </button>

                              {/* KOT — always available when there are received orders so admin has full control */}
                              {hasReceived && (
                                <button
                                  onClick={() => {
                                    getTableOrders(n).filter(o => o.status === 'received').forEach(o => sendKot(o));
                                  }}
                                  title={kotMode === 'automatic' ? 'Re-send KOT (override)' : 'Send KOT to kitchen'}
                                  style={{ width: 30, height: 30, borderRadius: 6, background: '#D97706', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>receipt_long</span>
                                </button>
                              )}

                              {/* Bill print — available once KOT is done; always available in automatic mode */}
                              {kotReady && (
                                <button
                                  onClick={() => handlePrint(n)}
                                  title={isPrinted ? (isNewAfterPrint ? 'Reprint bill (new items)' : 'Reprint bill') : 'Print bill'}
                                  style={{ width: 30, height: 30, borderRadius: 6, background: isPrinted ? '#16A34A' : '#F59E0B', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>{isPrinted ? 'receipt' : 'print'}</span>
                                </button>
                              )}

                              {/* Checkout — available once KOT is done; always available in automatic mode */}
                              {kotReady && (
                                <button
                                  onClick={() => handleCheckout(n)}
                                  title="Checkout table"
                                  style={{ width: 30, height: 30, borderRadius: 6, background: '#5137EF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>point_of_sale</span>
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}

            </>
          )}

          {/* ── Table info modal ── */}
          {infoTableNum !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setInfoTableNum(null)}>
              <div className="bg-white mx-4" style={{ width: '100%', maxWidth: 400, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
                <div style={{ background: '#5137EF', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>T{infoTableNum} — Items</span>
                  <button onClick={() => setInfoTableNum(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>close</span>
                  </button>
                </div>
                <div style={{ padding: '20px 24px', maxHeight: '70vh', overflowY: 'auto' }}>
                  {(() => {
                    const tableOrds = getTableOrders(infoTableNum).slice().sort(
                      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                    );
                    const total = Math.round(tableOrds.reduce((s, o) => s + o.subtotal, 0) * 100) / 100;
                    return (
                      <>
                        {tableOrds.map((ord, idx) => (
                          <div key={ord.id} style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#5137EF', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Order {idx + 1}
                              </span>
                              <span style={{ fontSize: 11, color: '#99A1AF' }}>{formatTime(ord.created_at)}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {consolidateItems(ord.items).map((item, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 14, color: '#0A0A0A' }}>
                                    <strong>{item.qty}×</strong> {item.name}{item.variantSize ? ` (${item.variantSize})` : ''}
                                  </span>
                                  {(item as { price?: number }).price && (item as { price?: number }).price! > 0 && (
                                    <span style={{ fontSize: 13, color: '#52525C', fontWeight: 500 }}>
                                      ₹{Math.round(((item as { price?: number }).price ?? 0) * item.qty * 100) / 100}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                              <span style={{ fontSize: 12, color: '#71717A' }}>₹{Math.round(ord.subtotal * 100) / 100}</span>
                            </div>
                            {idx < tableOrds.length - 1 && (
                              <div style={{ borderTop: '1px dashed #E4E4E7', marginTop: 12 }} />
                            )}
                          </div>
                        ))}
                        <div style={{ borderTop: '2px solid #E4E4E7', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 16 }}>Total</span>
                          <span style={{ fontWeight: 800, fontSize: 20 }}>₹{total}</span>
                        </div>
                        <p style={{ fontSize: 12, color: '#99A1AF', marginTop: 6 }}>
                          {tableOrds.length} order{tableOrds.length !== 1 ? 's' : ''} · {tableOrds.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.qty, 0), 0)} items total
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* ── Takeaway order info modal ── */}
          {infoOrder && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setInfoOrder(null)}>
              <div className="bg-white mx-4" style={{ width: '100%', maxWidth: 400, borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
                <div style={{ background: '#5137EF', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{infoOrder.token_number ?? 'Takeaway'} — Items</span>
                  <button onClick={() => setInfoOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>close</span>
                  </button>
                </div>
                <div style={{ padding: '20px 24px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                    {consolidateItems(infoOrder.items).map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 14, color: '#0A0A0A' }}>
                          <strong>{item.qty}×</strong> {item.name}{item.variantSize ? ` (${item.variantSize})` : ''}
                        </span>
                        {(item as { price?: number }).price && (
                          <span style={{ fontSize: 14, color: '#52525C', fontWeight: 500 }}>₹{Math.round(((item as { price?: number }).price ?? 0) * item.qty * 100) / 100}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: '1px solid #E4E4E7', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>Total</span>
                    <span style={{ fontWeight: 800, fontSize: 20 }}>₹{infoOrder.subtotal}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#99A1AF', marginTop: 6 }}>
                    {infoOrder.customer_name} · {formatTime(infoOrder.created_at)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Checkout modal ── */}
          {checkoutTarget && (() => {
            const liveTotal = Math.round(getTableOrders(checkoutTarget.num).reduce((s, o) => s + o.subtotal, 0) * 100) / 100;
            return (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => !checkoutLoading && setCheckoutTarget(null)}>
              <div className="bg-white mx-4" style={{ width: '100%', maxWidth: 340, borderRadius: 16, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#71717A', margin: '0 0 2px' }}>Checkout</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: '#0A0A0A', margin: '0 0 4px' }}>T{checkoutTarget.num}</p>
                <p style={{ fontSize: 28, fontWeight: 900, color: '#0A0A0A', margin: '0 0 20px' }}>₹{liveTotal}</p>

                <p style={{ fontSize: 12, color: '#71717A', marginBottom: 8 }}>Payment method</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                  {(['cash', 'card', 'upi'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setCheckoutPayMethod(m)}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer',
                        border: checkoutPayMethod === m ? '2px solid #5137EF' : '1px solid #E4E4E7',
                        background: checkoutPayMethod === m ? '#EEEEFF' : '#fff',
                        color: checkoutPayMethod === m ? '#5137EF' : '#52525C',
                        fontWeight: 700, fontSize: 13, textTransform: 'uppercase',
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => !checkoutLoading && setCheckoutTarget(null)}
                    disabled={checkoutLoading}
                    style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: '1px solid #E4E4E7', background: '#fff', color: '#52525C', fontWeight: 500, cursor: 'pointer', fontSize: 14 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitCheckout}
                    disabled={checkoutLoading}
                    style={{ flex: 2, padding: '11px 0', borderRadius: 8, background: checkoutLoading ? '#A5B4FC' : '#5137EF', border: 'none', color: '#fff', fontWeight: 600, cursor: checkoutLoading ? 'default' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    {checkoutLoading ? (
                      <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Processing…</>
                    ) : 'Confirm Checkout'}
                  </button>
                </div>
              </div>
            </div>
            );
          })()}

          {/* ── Takeaway checkout modal ── */}
          {checkoutOrderTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => !checkoutLoading && setCheckoutOrderTarget(null)}>
              <div className="bg-white mx-4" style={{ width: '100%', maxWidth: 340, borderRadius: 16, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#71717A', margin: '0 0 2px' }}>Takeaway Checkout</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: '#0A0A0A', margin: '0 0 4px' }}>{checkoutOrderTarget.token_number ?? 'Takeaway'}</p>
                <p style={{ fontSize: 28, fontWeight: 900, color: '#0A0A0A', margin: '0 0 20px' }}>₹{checkoutOrderTarget.subtotal}</p>

                <p style={{ fontSize: 12, color: '#71717A', marginBottom: 8 }}>Payment method</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                  {(['cash', 'card', 'upi'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setCheckoutPayMethod(m)}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 8, cursor: 'pointer',
                        border: checkoutPayMethod === m ? '2px solid #5137EF' : '1px solid #E4E4E7',
                        background: checkoutPayMethod === m ? '#EEEEFF' : '#fff',
                        color: checkoutPayMethod === m ? '#5137EF' : '#52525C',
                        fontWeight: 700, fontSize: 13, textTransform: 'uppercase',
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => !checkoutLoading && setCheckoutOrderTarget(null)}
                    disabled={checkoutLoading}
                    style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: '1px solid #E4E4E7', background: '#fff', color: '#52525C', fontWeight: 500, cursor: 'pointer', fontSize: 14 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitTakeawayCheckout}
                    disabled={checkoutLoading}
                    style={{ flex: 2, padding: '11px 0', borderRadius: 8, background: checkoutLoading ? '#A5B4FC' : '#5137EF', border: 'none', color: '#fff', fontWeight: 600, cursor: checkoutLoading ? 'default' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    {checkoutLoading
                      ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Processing…</>
                      : 'Confirm Checkout'
                    }
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {isPayEat && (
        <>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg) } }
            @media print {
              body > * { display: none !important; }
              #kot-print-area { display: block !important; }
            }
          `}</style>

          {/* ── Hidden KOT print area (pay_eat) ── */}
          {kotPrintOrder && (
            <div id="kot-print-area" style={{ display: 'none', fontFamily: 'monospace', padding: 24, maxWidth: 300, margin: '0 auto' }}>
              <h2 style={{ textAlign: 'center', fontSize: 16, margin: '0 0 2px', fontWeight: 700 }}>
                {kotPrintOrder.table_number ? `KOT — Table T${kotPrintOrder.table_number}` : `KOT — ${kotPrintOrder.token_number ?? `#${kotPrintOrder.order_number}`}`}
              </h2>
              <p style={{ textAlign: 'center', fontSize: 11, margin: '0 0 10px', color: '#52525C' }}>
                {activeSite?.name ?? 'Kitchen Order'}
              </p>
              <hr style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
              {consolidateItems(kotPrintOrder.items).map((item, i) => (
                <div key={i} style={{ display: 'flex', fontSize: 14, margin: '6px 0' }}>
                  <span><strong>{item.qty}×</strong> {item.name}{item.variantSize ? ` (${item.variantSize})` : ''}</span>
                </div>
              ))}
              <hr style={{ borderTop: '1px solid #000', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                <span>Order #{kotPrintOrder.order_number}</span>
                <span>{new Date(kotPrintOrder.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-16">
              <div style={{ width: 28, height: 28, border: '3px solid #e6e6e6', borderTopColor: '#5137EF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}

          {/* ── Desktop table ── */}
          {!loading && (
            <div className="hidden lg:block overflow-hidden" style={{ border: '1px solid #E4E4E7', borderRadius: 14 }}>
              <div className="grid" style={{ gridTemplateColumns: '140px 150px 1fr 140px 100px 110px 160px', background: '#F4F4F4', borderBottom: '1px solid #E4E4E7', padding: '0 24px' }}>
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
                const s          = STATUS_STYLES[order.status] ?? STATUS_STYLES.preparing;
                const isUpdating = updatingId === order.id;
                return (
                  <div key={order.id} className="grid items-center"
                    style={{ gridTemplateColumns: '140px 150px 1fr 140px 100px 110px 160px', padding: '0 24px', minHeight: 50, background: '#FFFFFF', borderBottom: idx < orders.length - 1 ? '1px solid #E4E4E7' : 'none' }}>

                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>{orderIdLabel(order)}</div>

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

                    <div style={{ fontSize: 11, fontWeight: 600, color: order.payment_status === 'paid' ? '#16A34A' : '#F97316', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {order.payment_method === 'counter' && order.payment_status === 'pending' ? (
                        <>
                          <span style={{ color: '#E7000B', fontSize: 14 }}>✗</span>
                          <button
                            onClick={() => !confirmingId && confirmCounterPayment(order)}
                            disabled={confirmingId === order.id}
                            title="Confirm payment received"
                            style={{ width: 24, height: 24, borderRadius: '50%', background: '#16A34A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: confirmingId === order.id ? 0.6 : 1 }}>
                            {confirmingId === order.id
                              ? <div style={{ width: 10, height: 10, border: '1.5px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                              : <span style={{ color: '#fff', fontSize: 14, lineHeight: 1 }}>✓</span>}
                          </button>
                        </>
                      ) : order.payment_method === 'no_payment'
                        ? '✓ No Pay'
                        : order.payment_method === 'online'
                          ? (order.payment_status === 'paid' ? '✓ Paid' : 'Online')
                          : '✓ Paid'}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {order.status === 'received' && (
                        <button
                          onClick={() => sendKot(order)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, background: '#FFFBEB', border: '1px solid #F59E0B', color: '#D97706', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>receipt_long</span>
                          KOT
                        </button>
                      )}
                      {order.status !== 'completed' && order.status !== 'received' && (
                        <button
                          onClick={() => !isUpdating && cycleStatus(order)}
                          disabled={isUpdating}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: s.bg, border: s.border, color: s.color, fontSize: 12, fontWeight: 500, cursor: isUpdating ? 'default' : 'pointer', opacity: isUpdating ? 0.6 : 1 }}>
                          {STATUS_LABEL[order.status]}
                          {s.chevron && !isUpdating && <span className="material-symbols-outlined" style={{ fontSize: 14 }}>keyboard_arrow_down</span>}
                          {isUpdating && <div style={{ width: 10, height: 10, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
                        </button>
                      )}
                      {order.status === 'completed' && (
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#5137EF', background: '#EEEEFF', padding: '4px 10px', borderRadius: 6, display: 'inline-block' }}>
                          Completed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Load more */}
              {hasMore && (
                <div style={{ padding: '14px 24px', borderTop: '1px solid #E4E4E7', display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{ fontSize: 13, fontWeight: 500, color: '#5137EF', background: 'none', border: '1px solid #5137EF', borderRadius: 8, padding: '7px 20px', cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {loadingMore && <div style={{ width: 12, height: 12, border: '2px solid #5137EF', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
                    {loadingMore ? 'Loading...' : 'Load earlier orders'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Mobile cards ── */}
          {!loading && (
            <div className="lg:hidden overflow-hidden" style={{ border: '1px solid #E4E4E7', borderRadius: 14 }}>
              {orders.length === 0 ? (
                <div className="py-16 flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-[#D4D4D8]" style={{ fontSize: 40 }}>receipt_long</span>
                  <p className="font-medium text-[#71717A]" style={{ fontSize: 14 }}>No orders yet today</p>
                </div>
              ) : orders.map((order, idx) => {
                const s          = STATUS_STYLES[order.status];
                const isUpdating = updatingId === order.id;
                return (
                  <div key={order.id} style={{ padding: '14px 16px', background: '#FFFFFF', borderBottom: idx < orders.length - 1 ? '1px solid #E4E4E7' : 'none' }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#0A0A0A', flexShrink: 0 }}>{orderIdLabel(order)}</span>
                      <button onClick={() => setSelectedOrder(order)} className="flex-1 min-w-0 text-center"
                        style={{ fontSize: 12, color: '#5137EF', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {itemsSummary(order.items)}
                      </button>
                      {order.payment_method === 'counter' && order.payment_status === 'pending' ? (
                        <button
                          onClick={() => !confirmingId && confirmCounterPayment(order)}
                          disabled={confirmingId === order.id}
                          style={{ width: 28, height: 28, borderRadius: '50%', background: '#16A34A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ color: '#fff', fontSize: 16, lineHeight: 1 }}>✓</span>
                        </button>
                      ) : order.status === 'received' ? (
                        <button type="button" aria-label={`Send KOT for order ${order.order_number}`} onClick={() => sendKot(order)}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px 12px', borderRadius: 6, background: '#FFFBEB', border: '1px solid #F59E0B', color: '#D97706', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0, minHeight: 32 }}>
                          KOT
                        </button>
                      ) : order.status !== 'completed' ? (
                        <button type="button" aria-label={`Advance order ${order.order_number} status`} onClick={() => !isUpdating && cycleStatus(order)} disabled={isUpdating}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px 12px', borderRadius: 6, background: s.bg, border: s.border, color: s.color, fontSize: 12, fontWeight: 500, cursor: isUpdating ? 'default' : 'pointer', flexShrink: 0, minHeight: 32 }}>
                          {STATUS_LABEL[order.status]}
                          {s.chevron && !isUpdating && <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>keyboard_arrow_down</span>}
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#5137EF', background: '#EEEEFF', padding: '3px 9px', borderRadius: 6, flexShrink: 0 }}>Done</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 12, color: '#52525C' }}>{order.customer_name}{order.table_number ? ` · T-${order.table_number}` : ''}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>₹{order.subtotal}</span>
                    </div>
                    <p style={{ fontSize: 11, color: '#99A1AF', marginTop: 3 }}>{formatTime(order.created_at)}</p>
                  </div>
                );
              })}

              {hasMore && (
                <div style={{ padding: '14px 16px', borderTop: '1px solid #E4E4E7', display: 'flex', justifyContent: 'center' }}>
                  <button onClick={loadMore} disabled={loadingMore}
                    style={{ fontSize: 13, fontWeight: 500, color: '#5137EF', background: 'none', border: '1px solid #5137EF', borderRadius: 8, padding: '7px 20px', cursor: loadingMore ? 'default' : 'pointer', opacity: loadingMore ? 0.6 : 1 }}>
                    {loadingMore ? 'Loading...' : 'Load earlier orders'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Order detail modal ── */}
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
                    <p className="font-bold text-[#0A0A0A]" style={{ fontSize: 24 }}>{orderIdLabel(selectedOrder)}</p>
                    <p className="font-bold text-[#0A0A0A]" style={{ fontSize: 24 }}>₹{selectedOrder.subtotal}</p>
                  </div>
                  <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                    <div>
                      <p className="text-[#52525C]" style={{ fontSize: 14 }}>{selectedOrder.customer_name}</p>
                      {selectedOrder.table_number && <p style={{ fontSize: 12, color: '#71717A' }}>Table {selectedOrder.table_number}</p>}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: selectedOrder.payment_status === 'paid' ? '#16A34A' : '#F97316' }}>
                      {selectedOrder.payment_method === 'no_payment'
                        ? '✓ No Payment'
                        : selectedOrder.payment_method === 'online'
                          ? (selectedOrder.payment_status === 'paid' ? '✓ Paid Online' : 'Online')
                          : 'Pay at Counter'}
                    </span>
                  </div>
                  <div style={{ height: 1, background: '#E4E4E7', marginBottom: 16 }} />
                  <p className="font-bold text-[#0A0A0A]" style={{ fontSize: 16, marginBottom: 14 }}>Order Items ({totalItems})</p>
                  <div className="flex flex-col" style={{ gap: 12 }}>
                    {consolidatedItems.map((item, i) => (
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
        </>
      )}
    </div>
  );
}
