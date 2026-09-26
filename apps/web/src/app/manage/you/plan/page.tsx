'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSite } from '@/components/SiteContext';
import { firebaseAuth } from '@/lib/auth/firebase';
import { formatPrice } from '@/lib/platform/currency';
import { TRIAL_DURATION_MS } from '@/lib/platform/productFlags';
import { ORDERING_COMING_SOON_SHORT } from '@/content/roadmap';
import { QR_MENU_FEATURES } from '@/content/smartQrMenu';
import { useQrMenuCheckout, loadRazorpayScript } from '@/hooks/useQrMenuCheckout';
import { planStatus, planPill, planNextStep, longDate } from '@/lib/you/planStatus';
import { Skeleton, Spinner } from '@/components/loading';
import SubPage from '@/components/you/SubPage';
import Sheet from '@/components/you/Sheet';
import { Y, rise } from '@/components/you/YouStyles';
import { Card, Icon, PeriodBar, Pill, primaryButton, quietButton, secondaryButton } from '@/components/you/YouKit';

/**
 * Plan & bills on a phone. The look is new; the payment is not — the Pay
 * button runs the same checkout as the desktop subscription page
 * (useQrMenuCheckout), under the same rule: payment opens only when no trial
 * and no plan is running. Only the ₹299 Smart QR Menu is ever shown here.
 */

interface Invoice {
    id: string;
    invoiceNo: string;
    planName: string;
    amount: number;
    currency: string;
    status: string;
    paidAt: string | null;
}

const DAY_MS = 86_400_000;
const TRIAL_DAYS = Math.round(TRIAL_DURATION_MS / DAY_MS);

export default function PlanPage() {
    const { activeSite } = useSite();
    const [sheetOpen, setSheetOpen] = useState(false);
    const { paymentState, setPaymentState, activate, stopPolling } = useQrMenuCheckout({ onSettled: () => setSheetOpen(false) });

    const [invoices, setInvoices] = useState<Invoice[] | null>(null);
    const [invoicesFailed, setInvoicesFailed] = useState(false);

    const loadInvoices = useCallback(async () => {
        const siteId = activeSite?.id;
        if (!siteId) return;
        setInvoicesFailed(false);
        try {
            const token = await firebaseAuth.currentUser?.getIdToken();
            if (!token) { setInvoicesFailed(true); return; }
            const res = await fetch(`/api/manage/billing-history?site_id=${encodeURIComponent(siteId)}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store',
            });
            if (!res.ok) { setInvoicesFailed(true); return; }
            const body = await res.json();
            setInvoices(Array.isArray(body.invoices) ? body.invoices : []);
        } catch {
            setInvoicesFailed(true);
        }
    }, [activeSite?.id]);

    useEffect(() => { setInvoices(null); loadInvoices(); }, [loadInvoices]);
    // A fresh payment appears without a reload.
    useEffect(() => { if (paymentState === 'success') loadInvoices(); }, [paymentState, loadInvoices]);

    const status = activeSite ? planStatus(activeSite) : null;

    const openPayment = useCallback(() => {
        // Nothing to buy while a plan or trial is running.
        if (!status?.canPay) return;
        setPaymentState('idle');
        setSheetOpen(true);
        // Preload checkout while the owner reads the summary.
        loadRazorpayScript();
    }, [status?.canPay, setPaymentState]);

    // Arriving from the You page's Activate/Renew button opens the sheet at once.
    useEffect(() => {
        if (!status?.canPay) return;
        const url = new URL(window.location.href);
        if (url.searchParams.get('pay') !== '1') return;
        url.searchParams.delete('pay');
        window.history.replaceState(window.history.state, '', url.pathname + url.search);
        openPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the status is known
    }, [status?.canPay]);

    const busy = paymentState === 'creating' || paymentState === 'activating';
    const closeSheet = () => {
        if (busy) return;
        stopPolling();
        setSheetOpen(false);
        setPaymentState('idle');
    };

    if (!activeSite || !status) {
        return (
            <SubPage title="Plan & bills">
                <Skeleton height={260} radius={20} />
            </SubPage>
        );
    }

    const pill = planPill(status);
    const price = formatPrice(status.price, 'INR');
    const renewing = status.state === 'expired';
    const liveUntil = longDate(new Date(Date.now() + 30 * DAY_MS));
    const barCaption = status.state === 'trial'
        ? `Day ${Math.min(TRIAL_DAYS, Math.max(1, TRIAL_DAYS - status.daysLeft + 1))} of ${TRIAL_DAYS}`
        : `${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} left`;

    return (
        <SubPage title="Plan & bills">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* ── The plan ── */}
                <section aria-labelledby="pl-name" className="you-rise" style={{ ...rise(0), background: Y.white, border: `1px solid ${Y.line}`, borderRadius: 20, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <h2 id="pl-name" style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>Smart QR Menu</h2>
                            <p className="truncate" style={{ margin: '2px 0 0', fontSize: 13, color: Y.muted }}>{activeSite.name}</p>
                        </div>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 2, flexShrink: 0 }}>
                            <span style={{ fontSize: 24, fontWeight: 700 }}>{price}</span>
                            <span style={{ fontSize: 13, color: Y.muted }}>/month</span>
                        </span>
                    </div>
                    <span><Pill tone={pill.tone}>{pill.text}</Pill></span>
                    {(status.state === 'trial' || status.state === 'active' || status.state === 'endingSoon') && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {/* A paid period can run past 30 days (renewals stack), so only
                                the trial and a plan about to end get a bar. */}
                            {status.state !== 'active' && <PeriodBar progress={status.progress} tone="warn" />}
                            <span style={{ fontSize: 12, color: Y.muted }}>{barCaption}</span>
                        </div>
                    )}
                    {status.canPay && status.cta ? (
                        <button type="button" onClick={openPayment} className="you-press" style={primaryButton}>{status.cta}</button>
                    ) : null}
                    <p style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: Y.text }}>{planNextStep(status)}</p>
                    <p style={{ margin: 0, fontSize: 12, color: Y.muted }}>Each payment covers 30 days. No automatic charges.</p>
                </section>

                {/* ── What it includes ── */}
                <Card aria-labelledby="pl-get" className="you-rise" style={{ ...rise(1), padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <h2 id="pl-get" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>What you get</h2>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {QR_MENU_FEATURES.map(f => (
                            <li key={f} style={{ display: 'flex', gap: 10, fontSize: 14, lineHeight: '20px' }}>
                                <Icon icon="check_circle" size={20} color={Y.good.dot} />{f}
                            </li>
                        ))}
                    </ul>
                    <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 12, background: Y.brandTint, fontSize: 13, lineHeight: '19px', color: Y.brandDeep }}>
                        <Icon icon="schedule" size={20} />
                        <span>{ORDERING_COMING_SOON_SHORT} It comes at no extra cost.</span>
                    </div>
                </Card>

                {/* ── Bills ── */}
                <Card aria-labelledby="pl-bills" className="you-rise" style={{ ...rise(2), overflow: 'hidden' }}>
                    <h2 id="pl-bills" style={{ margin: 0, padding: '18px 16px 10px', fontSize: 16, fontWeight: 700 }}>Bills</h2>
                    {invoicesFailed ? (
                        <div style={{ padding: '4px 16px 18px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                            <span style={{ fontSize: 14, color: Y.text }}>Could not load your bills. Your payments are safe — this is only the list.</span>
                            <button type="button" onClick={loadInvoices} className="you-press you-focus" style={{ ...quietButton, padding: '0 4px', color: Y.brand }}>Try again</button>
                        </div>
                    ) : invoices === null ? (
                        <div aria-busy="true" style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Skeleton height={44} radius={10} />
                            <Skeleton height={44} radius={10} />
                        </div>
                    ) : invoices.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '14px 24px 24px', textAlign: 'center', borderTop: `1px solid ${Y.lineSoft}` }}>
                            <Icon icon="receipt_long" size={30} color={Y.faint} />
                            <span style={{ fontSize: 14, color: Y.text }}>No bills yet. Your first one appears here after you pay.</span>
                        </div>
                    ) : (
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                            {invoices.map(inv => {
                                const paid = inv.status === 'Success';
                                return (
                                    <li key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, padding: '10px 16px', borderTop: `1px solid ${Y.lineSoft}` }}>
                                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                            <span style={{ fontSize: 15, fontWeight: 600 }}>{inv.paidAt ? longDate(new Date(inv.paidAt)) : 'Pending'}</span>
                                            <span className="truncate" style={{ fontSize: 12, color: Y.muted }}>{inv.planName} · {inv.invoiceNo}</span>
                                        </span>
                                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                                            <span style={{ fontSize: 15, fontWeight: 600 }}>{formatPrice(inv.amount, inv.currency)}</span>
                                            <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: paid ? Y.good.bg : Y.warn.bg, color: paid ? Y.good.fg : Y.warn.fg }}>{paid ? 'Paid' : inv.status}</span>
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Card>

                <p style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: Y.muted }}>
                    <Icon icon="lock" size={16} />Payments are processed securely by Razorpay.
                </p>
            </div>

            {/* ── Pay: the same checkout, a new sheet ── */}
            <Sheet open={sheetOpen} onClose={closeSheet} labelledBy="pp-title" busy={busy}>
                {paymentState === 'activating' ? (
                    <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0 8px', textAlign: 'center' }}>
                        <Spinner size="md" tone="brand" />
                        <h2 id="pp-title" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Activating your plan…</h2>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: Y.text }}>Payment received. This takes a few seconds — please keep this page open.</p>
                    </div>
                ) : paymentState === 'success' ? (
                    <div role="status" className="you-pop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '12px 0 4px', textAlign: 'center' }}>
                        <span style={{ width: 64, height: 64, borderRadius: '50%', background: Y.good.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon icon="check" size={36} color={Y.good.dot} />
                        </span>
                        <h2 id="pp-title" style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>You’re all set</h2>
                        <p style={{ margin: 0, fontSize: 14, color: Y.text }}>Your Smart QR Menu is live for the next 30 days.</p>
                        <button type="button" data-autofocus onClick={closeSheet} className="you-press" style={{ ...primaryButton, marginTop: 8 }}>Done</button>
                    </div>
                ) : paymentState === 'slow' ? (
                    <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0 4px', textAlign: 'center' }}>
                        <Icon icon="schedule" size={36} color={Y.warn.dot} />
                        <h2 id="pp-title" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Payment received</h2>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: Y.text }}>Your plan is still activating — this can take a minute. Check back here shortly.</p>
                        <button type="button" data-autofocus onClick={closeSheet} className="you-press" style={{ ...secondaryButton, marginTop: 8 }}>Close</button>
                    </div>
                ) : paymentState === 'failed' ? (
                    <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0 4px', textAlign: 'center' }}>
                        <Icon icon="error" size={36} color={Y.bad.dot} />
                        <h2 id="pp-title" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Something went wrong</h2>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: '20px', color: Y.text }}>Please try again. If it keeps happening, message us on WhatsApp.</p>
                        <button type="button" data-autofocus onClick={() => setPaymentState('idle')} className="you-press" style={{ ...primaryButton, marginTop: 8 }}>Try again</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <h2 id="pp-title" style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>{renewing ? 'Renew Smart QR Menu' : 'Activate Smart QR Menu'}</h2>
                            <p className="truncate" style={{ margin: '2px 0 0', fontSize: 13, color: Y.muted }}>For {activeSite.name}</p>
                        </div>
                        <div style={{ border: `1px solid ${Y.line}`, borderRadius: 14, padding: '2px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, fontSize: 15 }}>
                                <span style={{ color: Y.text }}>Smart QR Menu · 30 days</span><span style={{ fontWeight: 600 }}>{price}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, fontSize: 15, borderTop: `1px solid ${Y.lineSoft}` }}>
                                <span style={{ color: Y.text }}>Setup fee</span><span style={{ fontWeight: 600 }}>{formatPrice(0, 'INR')}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, fontSize: 17, fontWeight: 700, borderTop: `1px solid ${Y.lineSoft}` }}>
                                <span>Pay today</span><span>{price}</span>
                            </div>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, lineHeight: '19px', color: Y.text }}>
                            Your menu stays live until {liveUntil}. We don’t charge you again automatically.
                        </p>
                        <button type="button" data-autofocus onClick={activate} disabled={busy} className="you-press" style={primaryButton}>
                            {paymentState === 'creating'
                                ? <><Spinner size="sm" tone="onBrand" />Opening checkout…</>
                                : <><Icon icon="lock" size={20} />Pay {price}</>}
                        </button>
                        <span style={{ fontSize: 12, color: Y.muted, textAlign: 'center' }}>Secure payment by Razorpay</span>
                    </div>
                )}
            </Sheet>
        </SubPage>
    );
}
