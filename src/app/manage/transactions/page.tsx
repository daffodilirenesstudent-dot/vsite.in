'use client';

import React, { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePlan } from '@/components/PlanContext';
import { useSite } from '@/components/SiteContext';
import { firebaseAuth } from '@/lib/firebase';
import DateRangeFilter, { useCurrentRange } from '@/components/DateRangeFilter';

type TxnStatus = 'Success' | 'Failed' | 'Pending' | 'Refunded';
type PaymentMode = 'Card' | 'UPI' | 'Cash' | 'NetBanking' | 'Wallet' | 'Manual Pay';

interface OrderItemSummary { qty: number; name: string; price?: number; variantSize?: string }

interface Transaction {
    id: string;
    txn_id: string;
    order_id: string | null;
    orders: {
        order_number:   string;
        token_number:   string | null;
        counter_number: string | null;
        table_number:   string | null;
        items?:         OrderItemSummary[] | null;
        created_at?:    string;
        customer_name?: string | null;
    } | null;
    transacted_at:  string;
    customer_email: string | null;
    customer_phone: string | null;
    amount:         number;
    status:         TxnStatus;
    payment_mode:   PaymentMode;
}

const COLS = ['TRANSACTION ID', 'REFERENCE', 'DATE', 'CONTACT', 'AMOUNT', 'STATUS', 'MODE', ''];

function formatDate(iso: string): string {
    const d = new Date(iso);
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${time}, ${date}`;
}

function StatusChip({ status }: { status: TxnStatus }) {
    const map: Record<TxnStatus, { color: string; icon: string }> = {
        Success:  { color: '#16A34A', icon: 'check_circle' },
        Failed:   { color: '#E7000B', icon: 'cancel' },
        Pending:  { color: '#F97316', icon: 'schedule' },
        Refunded: { color: '#5137EF', icon: 'replay' },
    };
    const { color, icon } = map[status] ?? map.Pending;
    return (
        <div className="flex items-center gap-1">
            <span className="material-symbols-outlined" style={{ fontSize: 15, color, fontVariationSettings: "'FILL' 1" }}>{icon}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color }}>{status}</span>
        </div>
    );
}

// Derive a human-readable reference from the joined order row.
// pay_eat:    token_number ("42") | counter_number ("C03") | "#order_number"
// qr_order:  "Table T{n}" for dine-in | token_number ("Takeaway 4") for takeaway
function displayRef(txn: Transaction): string {
    const o = txn.orders;
    if (!o) return '—';
    if (o.table_number) return `Table T${o.table_number}`;
    if (o.token_number)  return o.token_number;
    if (o.counter_number) return o.counter_number;
    if (o.order_number)   return `#${o.order_number}`;
    return '—';
}

// Wrap in Suspense so useSearchParams (used by DateRangeFilter) gets a CSR boundary.
export default function TransactionsPage() {
    return (
        <Suspense>
            <TransactionsContent />
        </Suspense>
    );
}

function TransactionsContent() {
    const { isPayEat, isQrOrder } = usePlan();
    const { activeSite } = useSite();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [truncated, setTruncated] = useState(false);
    const [rangeLabel, setRangeLabel] = useState<string>('Today');
    const [loading, setLoading] = useState(true);
    // Detail popover — shows ordered items + placed-at time for one transaction.
    const [detailTxn, setDetailTxn] = useState<Transaction | null>(null);
    const range = useCurrentRange();

    const siteId = activeSite?.id;
    const canView = isPayEat || isQrOrder;

    const fetchTransactions = useCallback(async (initial: boolean) => {
        if (!siteId || !canView) { if (initial) setLoading(false); return; }
        if (initial) setLoading(true);
        try {
            const token = await firebaseAuth.currentUser?.getIdToken();
            if (!token) return;
            const qs = new URLSearchParams({ site_id: siteId, range });
            const res = await fetch(`/api/manage/transactions?${qs.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            });
            if (!res.ok) return;
            const json = await res.json();
            setTransactions(json.transactions ?? []);
            setTruncated(!!json.truncated);
            if (json.range?.label) setRangeLabel(json.range.label);
        } catch (err) {
            console.error('[transactions] fetch error:', err);
        } finally {
            if (initial) setLoading(false);
        }
    }, [siteId, canView, range]);

    // Refetch when filter changes
    useEffect(() => { fetchTransactions(true); }, [fetchTransactions]);

    // Live polling only on "today" — historical ranges don't change.
    useEffect(() => {
        if (!siteId || !canView || range !== 'today') return;
        let id: ReturnType<typeof setInterval> | null = null;
        const start = () => { if (!id) id = setInterval(() => fetchTransactions(false), 5_000); };
        const stop  = () => { if (id) { clearInterval(id); id = null; } };
        const onVisibility = () => document.visibilityState === 'visible' ? (fetchTransactions(false), start()) : stop();
        // Only begin polling if the tab is actually visible — background tabs
        // shouldn't burn Supabase egress or trip rate limits.
        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', onVisibility);
        return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
    }, [siteId, canView, range, fetchTransactions]);

    return (
        <div className="px-4 lg:px-8 py-5 lg:py-8">

            <div className="flex items-start justify-between mb-5 lg:mb-6 gap-3 flex-wrap">
                <div>
                    <h1 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 26, lineHeight: '32px' }}>Transactions</h1>
                    <p className="text-[#52525C] mt-1" style={{ fontSize: 14, fontWeight: 400, lineHeight: '22px' }}>
                        {isQrOrder
                            ? 'Checkout history — cash, card and UPI payments recorded by staff'
                            : 'All payment records for your store'}
                        <span className="ml-2 text-[#99A1AF]" style={{ fontSize: 12 }}>· {rangeLabel}</span>
                    </p>
                </div>
                {canView && <DateRangeFilter variant="chips" />}
            </div>

            {/* Warn when the result set is capped — owner should narrow the range. */}
            {truncated && canView && (
                <div className="flex items-center gap-2 mb-3" style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#D97706', flexShrink: 0 }}>warning</span>
                    <p style={{ fontSize: 12, color: '#92400E', margin: 0 }}>
                        Showing the most recent 500 transactions. Narrow the date range to see older ones.
                    </p>
                </div>
            )}

            {/* Locked state for plans without ordering */}
            {!canView && (
                <div className="flex flex-col items-center justify-center text-center" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '48px 24px', background: '#FAFAFA' }}>
                    <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: '50%', background: '#EEEEFF', marginBottom: 16 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#5137EF' }}>lock</span>
                    </div>
                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 16, marginBottom: 6 }}>Transactions — QR Ordering Plan Required</p>
                    <p className="text-[#71717A]" style={{ fontSize: 13, marginBottom: 20, maxWidth: 320 }}>
                        Transaction history is available on the QR Ordering plan. Upgrade to view all payment records.
                    </p>
                    <Link href="/manage/subscription" className="flex items-center gap-1.5 text-white hover:opacity-90 transition-opacity" style={{ background: '#5137EF', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_upward</span>
                        Upgrade Plan
                    </Link>
                </div>
            )}

            {canView && (
                <>
                    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

                    {/* qr_order info banner */}
                    {isQrOrder && (
                        <div className="flex items-start gap-3 mb-5" style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '12px 16px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#F97316', flexShrink: 0, marginTop: 1 }}>info</span>
                            <p style={{ fontSize: 13, color: '#92400E', margin: 0, lineHeight: '20px' }}>
                                These records are created when staff confirm checkout from the Orders page. Each row reflects the payment method chosen at that time.
                            </p>
                        </div>
                    )}

                    {/* I10 disclosure — counter orders settled via table checkout produce
                        two transaction rows (original Pending/Success + the checkout
                        settlement). The dashboard's Revenue Today already accounts for
                        this — it sums orders.subtotal, NOT this list. Do not sum the
                        amounts below for daily totals; use the Dashboard. */}
                    {isPayEat && (
                        <div className="flex items-start gap-3 mb-5" style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, padding: '12px 16px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#0284C7', flexShrink: 0, marginTop: 1 }}>info</span>
                            <p style={{ fontSize: 13, color: '#075985', margin: 0, lineHeight: '20px' }}>
                                Some orders settled at the counter may appear twice — the original record and the settlement record. For accurate daily totals, use the <Link href="/manage/dashboard" style={{ color: '#0369A1', textDecoration: 'underline' }}>Dashboard Revenue</Link>, which is computed from completed orders.
                            </p>
                        </div>
                    )}

                    {loading ? (
                        // Skeleton that mirrors the real table — owners scan layout
                        // first, content second, so showing the shape avoids the
                        // "is anything happening?" feeling a plain spinner gives.
                        <div className="hidden lg:block overflow-hidden" style={{ border: '1px solid #E4E4E7', borderRadius: 14 }}>
                            <div className="grid" style={{ gridTemplateColumns: '160px 130px 190px 1fr 90px 120px 80px 44px', background: '#F4F4F4', borderBottom: '1px solid #E4E4E7', padding: '0 24px' }}>
                                {COLS.map(col => (
                                    <div key={col} className="text-[#71717A]" style={{ padding: '12px 0', fontSize: 12, fontWeight: 500, letterSpacing: '0.6px', textTransform: 'uppercase' }}>{col}</div>
                                ))}
                            </div>
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="grid items-center" style={{ gridTemplateColumns: '160px 130px 190px 1fr 90px 120px 80px 44px', padding: '14px 24px', minHeight: 50, background: '#FFFFFF', borderBottom: i < 5 ? '1px solid #E4E4E7' : 'none' }}>
                                    {[120, 90, 150, 200, 60, 80, 50, 20].map((w, j) => (
                                        <div key={j} style={{ height: 12, width: w, borderRadius: 4, background: '#F4F4F5', animation: 'tx-pulse 1.4s ease-in-out infinite' }} />
                                    ))}
                                </div>
                            ))}
                            <style>{`@keyframes tx-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
                        </div>
                    ) : null}
                    {loading && (
                        // Mobile-only skeleton — same row shape as the real card list.
                        <div className="lg:hidden overflow-hidden" style={{ border: '1px solid #E4E4E7', borderRadius: 14 }}>
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} style={{ padding: '14px 16px', background: '#FFFFFF', borderBottom: i < 4 ? '1px solid #E4E4E7' : 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div className="flex items-center justify-between">
                                        <div style={{ height: 12, width: 110, borderRadius: 4, background: '#F4F4F5', animation: 'tx-pulse 1.4s ease-in-out infinite' }} />
                                        <div style={{ height: 12, width: 60, borderRadius: 4, background: '#F4F4F5', animation: 'tx-pulse 1.4s ease-in-out infinite' }} />
                                    </div>
                                    <div style={{ height: 10, width: '70%', borderRadius: 4, background: '#F4F4F5', animation: 'tx-pulse 1.4s ease-in-out infinite' }} />
                                </div>
                            ))}
                            <style>{`@keyframes tx-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
                        </div>
                    )}
                    {!loading && (transactions.length === 0 ? (
                        // Distinguish "never had any data" (default 'today' range, fresh store)
                        // from "no data in this filter" (user has narrowed to a quiet window).
                        // Without the distinction, an owner who picked "Last Month" sees the
                        // same generic empty state and assumes the system is broken.
                        range !== 'today' ? (
                            <div className="flex flex-col items-center justify-center text-center py-16">
                                <span className="material-symbols-outlined text-[#D4D4D8] mb-3" style={{ fontSize: 40 }}>filter_alt</span>
                                <p className="font-medium text-[#52525C]" style={{ fontSize: 15 }}>No transactions in this range</p>
                                <p className="text-[#71717A] mt-1" style={{ fontSize: 13, maxWidth: 320 }}>
                                    Try widening the date filter or switch back to “Today” to see live activity.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center py-16">
                                <span className="material-symbols-outlined text-[#D4D4D8] mb-3" style={{ fontSize: 40 }}>receipt_long</span>
                                <p className="font-medium text-[#52525C]" style={{ fontSize: 15 }}>No transactions yet</p>
                                <p className="text-[#71717A] mt-1" style={{ fontSize: 13, maxWidth: 360 }}>
                                    {isQrOrder
                                        ? 'Transactions will appear here after staff confirm checkouts in the Orders page.'
                                        : 'Transactions will appear here once customers place orders.'}
                                </p>
                            </div>
                        )
                    ) : (
                        <>
                            {/* Desktop table */}
                            <div className="hidden lg:block overflow-hidden" style={{ border: '1px solid #E4E4E7', borderRadius: 14 }}>
                                <div className="grid" style={{ gridTemplateColumns: '160px 130px 190px 1fr 90px 120px 80px 44px', background: '#F4F4F4', borderBottom: '1px solid #E4E4E7', padding: '0 24px' }}>
                                    {COLS.map(col => (
                                        <div key={col} className="text-[#71717A]" style={{ padding: '12px 0', fontSize: 12, fontWeight: 500, letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                                            {col}
                                        </div>
                                    ))}
                                </div>
                                {transactions.map((txn, idx) => {
                                    const contact = txn.customer_phone || txn.customer_email || '—';
                                    return (
                                        <div key={txn.id} className="grid items-center"
                                            style={{ gridTemplateColumns: '160px 130px 190px 1fr 90px 120px 80px 44px', padding: '0 24px', minHeight: 50, background: '#FFFFFF', borderBottom: idx < transactions.length - 1 ? '1px solid #E4E4E7' : 'none' }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>{txn.txn_id}</div>
                                            <div style={{ fontSize: 13, color: '#52525C' }}>{displayRef(txn)}</div>
                                            <div style={{ fontSize: 13, color: '#52525C' }}>{formatDate(txn.transacted_at)}</div>
                                            <div style={{ fontSize: 13, color: '#52525C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }} title={contact}>{contact}</div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>₹{txn.amount}</div>
                                            <StatusChip status={txn.status} />
                                            <div style={{ fontSize: 13, color: '#52525C' }}>{txn.payment_mode}</div>
                                            <button
                                                type="button"
                                                aria-label="View order details"
                                                title="View order details"
                                                onClick={() => setDetailTxn(txn)}
                                                className="flex items-center justify-center hover:bg-neutral-50 transition-colors"
                                                style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #E4E4E7', background: '#FFFFFF', cursor: 'pointer', marginLeft: 'auto' }}
                                            >
                                                <span className="material-symbols-outlined text-[#52525C]" style={{ fontSize: 16 }} aria-hidden>info</span>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Mobile cards */}
                            <div className="lg:hidden overflow-hidden" style={{ border: '1px solid #E4E4E7', borderRadius: 14 }}>
                                {transactions.map((txn, idx) => {
                                    const contact = txn.customer_phone || txn.customer_email || '—';
                                    return (
                                        <button
                                            key={txn.id}
                                            type="button"
                                            onClick={() => setDetailTxn(txn)}
                                            aria-label={`View details for ${txn.txn_id}`}
                                            style={{
                                                display: 'block', width: '100%', textAlign: 'left',
                                                padding: '14px 16px', background: '#FFFFFF',
                                                borderBottom: idx < transactions.length - 1 ? '1px solid #E4E4E7' : 'none',
                                                border: 'none', cursor: 'pointer',
                                            }}
                                            className="hover:bg-neutral-50 transition-colors"
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span style={{ fontSize: 13, fontWeight: 700, color: '#0A0A0A' }}>{txn.txn_id}</span>
                                                <span style={{ fontSize: 14, fontWeight: 700, color: '#0A0A0A' }}>₹{txn.amount}</span>
                                            </div>
                                            <div className="flex items-center justify-between mb-1">
                                                <span style={{ fontSize: 12, color: '#52525C' }}>{displayRef(txn)} · {txn.payment_mode}</span>
                                                <StatusChip status={txn.status} />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span style={{ fontSize: 11, color: '#99A1AF' }}>{formatDate(txn.transacted_at)}</span>
                                                <span style={{ fontSize: 11, color: '#99A1AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%' }}>{contact}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ))}
                </>
            )}

            {/* Detail popover — items + ordered_at for the selected transaction. */}
            <TransactionDetail txn={detailTxn} onClose={() => setDetailTxn(null)} />
        </div>
    );
}

// ───────────────────────────────────────────────────────────────────────────
// Detail dialog — renders the food items, ordered-at time, contact and a few
// receipt-style totals for one transaction. Bottom-sheet on mobile, centered
// card on desktop. Closes on backdrop click or Escape.
// ───────────────────────────────────────────────────────────────────────────
function TransactionDetail({ txn, onClose }: { txn: Transaction | null; onClose: () => void }) {
    useEffect(() => {
        if (!txn) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        // Prevent background scroll while sheet is open.
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [txn, onClose]);

    if (!txn) return null;
    const order   = txn.orders;
    const items   = order?.items ?? [];
    const placed  = order?.created_at ?? txn.transacted_at;
    const contact = txn.customer_phone || txn.customer_email || '—';

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Transaction details"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            style={{
                position: 'fixed', inset: 0, zIndex: 200,
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
            className="sm:items-center"
        >
            <div
                style={{
                    background: '#FFFFFF',
                    width: '100%', maxWidth: 440, maxHeight: '90vh',
                    borderRadius: '16px 16px 0 0',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column',
                }}
                className="sm:rounded-2xl sm:mx-4"
            >
                {/* Header */}
                <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F4F4F5' }}>
                    <div className="flex items-start justify-between">
                        <div>
                            <p style={{ fontSize: 11, fontWeight: 600, color: '#71717A', letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>
                                Order details
                            </p>
                            <p style={{ fontSize: 16, fontWeight: 700, color: '#0A0A0A', margin: '4px 0 0' }}>
                                {order?.order_number ? `#${order.order_number}` : txn.txn_id}
                            </p>
                            {order?.customer_name && (
                                <p style={{ fontSize: 12, color: '#52525C', margin: '2px 0 0' }}>{order.customer_name}</p>
                            )}
                        </div>
                        <button
                            type="button"
                            aria-label="Close"
                            onClick={onClose}
                            className="flex items-center justify-center hover:bg-neutral-50 transition-colors"
                            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E4E4E7', background: '#FFFFFF', cursor: 'pointer', flexShrink: 0 }}
                        >
                            <span className="material-symbols-outlined text-[#52525C]" style={{ fontSize: 18 }} aria-hidden>close</span>
                        </button>
                    </div>
                </div>

                {/* Scrollable body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 18px' }}>
                    {/* Meta strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                        <MetaCell label="Ordered" value={formatFullDate(placed)} />
                        <MetaCell label="Reference" value={displayRef(txn)} />
                        <MetaCell label={txn.customer_phone ? 'Phone' : 'Email'} value={contact} mono={!!txn.customer_phone} />
                        <MetaCell label="Payment" value={`${txn.payment_mode} · ${txn.status}`} />
                    </div>

                    {/* Items list */}
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#71717A', letterSpacing: 0.5, textTransform: 'uppercase', margin: '8px 0 8px' }}>
                        Items
                    </p>
                    {items.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#99A1AF', textAlign: 'center', padding: '18px 0' }}>
                            No item details available for this order.
                        </p>
                    ) : (
                        <div style={{ border: '1px solid #E4E4E7', borderRadius: 10, overflow: 'hidden' }}>
                            {items.map((it, i) => (
                                <div key={i} className="flex items-center justify-between" style={{
                                    padding: '10px 12px',
                                    borderBottom: i < items.length - 1 ? '1px solid #F4F4F5' : 'none',
                                    gap: 10,
                                }}>
                                    <div className="min-w-0">
                                        <p style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A', margin: 0 }}>
                                            <span style={{ color: '#5137EF', fontWeight: 700, marginRight: 6 }}>{it.qty}×</span>
                                            {it.name}
                                            {it.variantSize ? <span style={{ color: '#71717A', fontWeight: 400 }}> · {it.variantSize}</span> : null}
                                        </p>
                                    </div>
                                    {typeof it.price === 'number' && (
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', flexShrink: 0 }}>
                                            ₹{(it.price * it.qty).toLocaleString('en-IN')}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Total */}
                    <div className="flex items-center justify-between" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #E4E4E7' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#52525C' }}>Total collected</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#0A0A0A' }}>₹{txn.amount.toLocaleString('en-IN')}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MetaCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div style={{ background: '#FAFAFA', border: '1px solid #F4F4F5', borderRadius: 8, padding: '8px 10px', minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: '#71717A', letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 }}>{label}</p>
            <p
                title={value}
                style={{
                    fontSize: 12.5, fontWeight: 600, color: '#0A0A0A', margin: '2px 0 0',
                    fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
            >
                {value}
            </p>
        </div>
    );
}

// Full date+time used in the detail sheet. Differs from the row format by
// including seconds + a weekday for at-a-glance context.
function formatFullDate(iso: string): string {
    const d = new Date(iso);
    const date = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${date}, ${time}`;
}
