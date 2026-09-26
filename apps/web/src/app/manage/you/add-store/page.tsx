'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSite } from '@/components/SiteContext';
import { firebaseAuth } from '@/lib/auth/firebase';
import { storeCreation, storeCountLabel, STORE_LIMIT } from '@/lib/store/storeLimits';
import { TRIAL_DURATION_MS, PLAN_PRICES_INR } from '@/lib/platform/productFlags';
import { formatPrice } from '@/lib/platform/currency';
import { planStatus } from '@/lib/you/planStatus';
import { supportWhatsAppUrl } from '@/lib/you/support';
import { Skeleton } from '@/components/loading';
import PaidStoreConsent from '@/components/store/PaidStoreConsent';
import SubPage from '@/components/you/SubPage';
import { Y, rise, type Tone } from '@/components/you/YouStyles';
import { Card, Icon, StoreTile, primaryButton } from '@/components/you/YouKit';

/**
 * A short screen before the onboarding wizard. One free trial per account
 * (2026-09-25): an account has at most 2 stores, and once its trial is used a
 * new store is built free but goes live only after it is paid for — so this
 * screen is, for almost every owner who reaches it, the agreement to that
 * (PaidStoreConsent), carried into the wizard as `consent=paid`.
 *
 * Whether the trial is used is the server's answer, not a count of stores: a
 * deleted trial store still used it.
 */

const TRIAL_DAYS = Math.round(TRIAL_DURATION_MS / 86_400_000);

interface Standing { canCreate: boolean; trialAvailable: boolean; trialStoreName: string | null }

function storeBadge(site: Parameters<typeof planStatus>[0]): { text: string; tone: Tone } {
    const s = planStatus(site);
    if (s.state === 'trial') return { text: 'Trial', tone: 'warn' };
    if (s.state === 'active' || s.state === 'endingSoon') return { text: 'Active', tone: 'good' };
    if (s.state === 'unpaid') return { text: 'Not live yet', tone: 'warn' };
    return { text: 'Ended', tone: 'bad' };
}

export default function AddStorePage() {
    const router = useRouter();
    const { allSites } = useSite();
    const limits = storeCreation(allSites);
    const [standing, setStanding] = useState<Standing | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const token = await firebaseAuth.currentUser?.getIdToken();
                if (!token) throw new Error('signed out');
                const res = await fetch('/api/onboarding/eligibility', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
                const body = await res.json();
                if (!res.ok) throw new Error(body.error ?? 'eligibility');
                if (!cancelled) setStanding({ canCreate: body.canCreate, trialAvailable: body.trialAvailable, trialStoreName: body.trialStoreName ?? null });
            } catch {
                if (!cancelled) setFailed(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const whatsapp = supportWhatsAppUrl(null);
    const atLimit = !limits.canCreate || standing?.canCreate === false;

    const stores = (
        <Card aria-labelledby="as-stores" className="you-rise" style={{ ...rise(2), overflow: 'hidden' }}>
            <h2 id="as-stores" style={{ margin: 0, padding: '14px 16px 6px', fontSize: 14, fontWeight: 600, color: Y.text }}>
                Your stores · {storeCountLabel(limits.storeCount)}
            </h2>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {allSites.map(site => {
                    const badge = storeBadge(site);
                    return (
                        <li key={site.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '8px 16px', borderTop: `1px solid ${Y.lineSoft}` }}>
                            <StoreTile name={site.name} size={36} />
                            <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600 }}>{site.name}</span>
                            <span style={{ padding: '3px 9px', borderRadius: 999, background: Y[badge.tone].bg, color: Y[badge.tone].fg, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{badge.text}</span>
                        </li>
                    );
                })}
            </ul>
        </Card>
    );

    // ── At the limit: say so, and offer a person ──
    if (atLimit) {
        return (
            <SubPage
                title="Add a store"
                footer={
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="you-press" style={primaryButton}>
                        <Icon icon="chat" size={20} color={Y.white} />
                        Message us on WhatsApp
                    </a>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Card className="you-rise" style={{ ...rise(0), padding: '22px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', borderRadius: 20 }}>
                        <span style={{ width: 56, height: 56, borderRadius: '50%', background: Y.warn.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon icon="storefront" size={30} color="#B54708" />
                        </span>
                        <h2 style={{ margin: '4px 0 0', fontSize: 21, fontWeight: 700, lineHeight: '27px' }}>
                            No more stores on this account
                        </h2>
                        <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', color: Y.text }}>
                            An account can have {STORE_LIMIT} stores. Need more outlets under one login? Message us and we will set it up with you.
                        </p>
                    </Card>
                    {stores}
                </div>
            </SubPage>
        );
    }

    // ── Waiting for the server's answer ──
    if (!standing && !failed) {
        return (
            <SubPage title="Add a store">
                <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Skeleton height={210} radius={16} />
                    <Skeleton height={76} radius={14} />
                    <Skeleton height={52} radius={14} />
                </div>
            </SubPage>
        );
    }

    // ── The trial is used (or unknown — then ask, never assume a trial) ──
    if (!standing?.trialAvailable) {
        return (
            <SubPage title="Add a store">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div className="you-rise" style={rise(0)}>
                        <PaidStoreConsent
                            phone={firebaseAuth.currentUser?.phoneNumber ?? null}
                            trialStoreName={standing?.trialStoreName ?? null}
                            onContinue={() => router.push('/onboarding?intent=add-store&consent=paid')}
                            onCancel={() => router.push('/manage/you')}
                        />
                    </div>
                    {stores}
                </div>
            </SubPage>
        );
    }

    // ── The account still has its trial (e.g. its only store never opened one) ──
    return (
        <SubPage
            title="Add a store"
            footer={
                <Link href="/onboarding?intent=add-store" className="you-press" style={primaryButton}>
                    Start setting up<Icon icon="arrow_forward" size={20} />
                </Link>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div className="you-rise" style={{ ...rise(0), display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 4px 0' }}>
                    <span style={{ width: 52, height: 52, borderRadius: 16, background: Y.brandBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon icon="add_business" size={28} color={Y.brand} />
                    </span>
                    <h2 style={{ margin: '6px 0 0', fontSize: 23, fontWeight: 700, lineHeight: '29px' }}>Open another outlet on vsite</h2>
                    <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', color: Y.text }}>
                        Each store gets its own menu, QR code and link. You switch between them from the top of the app.
                    </p>
                </div>

                {stores}

                <section aria-labelledby="as-how" className="you-rise" style={{ ...rise(3), display: 'flex', flexDirection: 'column', gap: 12, padding: '0 4px' }}>
                    <h3 id="as-how" style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>How it works</h3>
                    {[
                        'Take a photo of the new outlet’s menu card — we read the dishes for you.',
                        'Check the dishes and pick a design.',
                        `Its menu goes live with a ${TRIAL_DAYS}-day free trial, then ${formatPrice(PLAN_PRICES_INR.qr_menu, 'INR')}/month.`,
                    ].map((text, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <span style={{ width: 28, height: 28, borderRadius: '50%', background: Y.brandBg, color: Y.brandDeep, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                            <span style={{ fontSize: 14, lineHeight: '20px', paddingTop: 4 }}>{text}</span>
                        </div>
                    ))}
                </section>
            </div>
        </SubPage>
    );
}
