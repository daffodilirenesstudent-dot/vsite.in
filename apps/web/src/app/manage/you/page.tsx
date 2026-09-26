'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { useSite } from '@/components/SiteContext';
import { supabase } from '@/lib/platform/db/supabase';
import { Spinner } from '@/components/loading';
import { BRAND_COLOURS } from '@/components/menu/MenuDesignPicker';
import { DEFAULT_MENU_THEME, isMenuThemeId } from '@/lib/menu/menuThemes';
import { YOU_ROUTES } from '@/lib/ui/mobileNav';
import { storeCreation, storeCountLabel } from '@/lib/store/storeLimits';
import { readablePhone } from '@/lib/platform/phone';
import { planStatus, planPill, shortDate, type PlanStatus } from '@/lib/you/planStatus';
import { detailsNudge, type StoreDetailsRow } from '@/lib/you/storeDetails';
import { bannerSummary } from '@/lib/you/banners';
import { designSummary } from '@/lib/you/menuDesign';
import { menuLinkDisplay } from '@/lib/qr/printKit';
import YouStyles, { Y, rise } from '@/components/you/YouStyles';
import { Group, Icon, PeriodBar, Pill, Row, SectionTitle, StoreTile, primaryButton, secondaryButton, quietButton } from '@/components/you/YouKit';
import Sheet from '@/components/you/Sheet';
import { markOpenedFromYou } from '@/components/you/SubPage';

/**
 * The You tab (NEXT_PUBLIC_MOBILE_NAV_V2): the store and its plan first, then
 * everything an owner changes now and then — each row already saying where it
 * stands, so the page is useful before anything is tapped. Sign-out is last
 * and quiet: every sign-in costs an SMS, and an owner who signs out "to close
 * the app" pays for it on the next open.
 */

interface Snapshot {
    details: Partial<StoreDetailsRow> | null;
    design: string | null;
    banners: string | null;
}

function planLine(s: PlanStatus): string {
    switch (s.state) {
        case 'trial': return `Free trial ends ${shortDate(s.endsAt)}`;
        case 'active': return `Paid till ${shortDate(s.endsAt)}`;
        case 'endingSoon': return `Ends ${shortDate(s.endsAt)}`;
        case 'trialEnded': return 'Trial ended — activate to stay live';
        case 'expired': return `Ended ${shortDate(s.endsAt)} — renew to stay live`;
        case 'unpaid': return 'Not live yet — pay to go live';
    }
}

export default function YouPage() {
    const { user, signOut } = useAuth();
    const { activeSite, allSites } = useSite();
    const [snap, setSnap] = useState<Snapshot | null>(null);
    const [confirmSignOut, setConfirmSignOut] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [origin, setOrigin] = useState('');

    useEffect(() => { setOrigin(window.location.origin); }, []);

    // Two small reads, in parallel: the row lines for details/design, and the
    // banners' on/off flags. The store card itself needs neither.
    useEffect(() => {
        const siteId = activeSite?.id;
        if (!siteId) return;
        let cancelled = false;
        setSnap(null);
        Promise.all([
            supabase.from('sites').select('name, contact_number, location, business_type, timing, menu_theme, primary_color').eq('id', siteId).maybeSingle(),
            supabase.from('banners').select('is_active').eq('site_id', siteId),
        ]).then(([site, banners]) => {
            if (cancelled) return;
            const row = (site.data ?? null) as (Partial<StoreDetailsRow> & { menu_theme?: string | null; primary_color?: string | null }) | null;
            const storedTheme = row?.menu_theme;
            const theme = isMenuThemeId(storedTheme) ? storedTheme : DEFAULT_MENU_THEME;
            setSnap({
                details: row,
                design: row ? designSummary(theme, row.primary_color ?? null, BRAND_COLOURS) : null,
                banners: banners.error ? null : bannerSummary((banners.data ?? []) as Array<{ is_active: boolean }>),
            });
        });
        return () => { cancelled = true; };
    }, [activeSite?.id]);

    if (!activeSite) return null;

    const status = planStatus(activeSite);
    const pill = planPill(status);
    const limits = storeCreation(allSites);
    const phone = readablePhone(user?.phoneNumber ?? '');
    const menuHref = `/shop/${activeSite.slug}`;
    const nudge = snap ? detailsNudge(snap.details) : null;
    const storesLine = limits.atLimit
        ? `${storeCountLabel(limits.storeCount)} — the most for one account`
        : `${storeCountLabel(limits.storeCount)} on this account`;

    const handleSignOut = async () => {
        if (signingOut) return;
        setSigningOut(true);
        try {
            await signOut();
            // Full navigation so every provider unmounts cleanly, as the sidebar does.
            window.location.replace('/login');
        } catch {
            setSigningOut(false);
            setConfirmSignOut(false);
        }
    };

    return (
        <div className="you-root px-4 md:px-8 pt-1 pb-4 lg:py-8" style={{ maxWidth: 640, color: Y.ink }}>
            <YouStyles />
            <h1 className="you-rise" style={{ margin: '4px 4px 14px', fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em' }}>You</h1>

            {/* ── The store and where its plan stands ── */}
            <section aria-label="Your store" className="you-rise" style={{ ...rise(1), background: Y.white, border: `1px solid ${Y.line}`, borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <StoreTile name={activeSite.name} />
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <p className="truncate" style={{ margin: 0, fontSize: 20, fontWeight: 700, lineHeight: '26px' }}>{activeSite.name}</p>
                        {origin && <p className="truncate" style={{ margin: 0, fontSize: 13, color: Y.muted }}>{menuLinkDisplay(`${origin}${menuHref}`)}</p>}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span><Pill tone={pill.tone}>{pill.text}</Pill></span>
                    {(status.state === 'trial' || status.state === 'endingSoon') && <PeriodBar progress={status.progress} tone="warn" />}
                </div>

                {status.canPay && status.cta && (
                    <Link href={`${YOU_ROUTES.plan}?pay=1`} onClick={markOpenedFromYou} className="you-press" style={primaryButton}>
                        {status.cta}
                    </Link>
                )}
                <a href={menuHref} target="_blank" rel="noopener noreferrer" className="you-press" style={{ ...secondaryButton, minHeight: 44, fontSize: 14 }}>
                    <Icon icon="open_in_new" size={18} />
                    View your menu
                </a>
            </section>

            <SectionTitle id="you-store">Your store</SectionTitle>
            <Group labelledBy="you-store">
                <Row index={2} href={YOU_ROUTES.store} onNavigate={markOpenedFromYou} icon="storefront" title="Store details"
                    loading={!snap} subtitle={nudge ?? 'Name, phone, area and hours'} subtitleTone={nudge ? 'warn' : undefined} />
                <Row index={3} href={YOU_ROUTES.design} onNavigate={markOpenedFromYou} icon="palette" title="Menu design"
                    loading={!snap} subtitle={snap?.design ?? 'Style, colour and lettering'} />
                <Row index={4} href={YOU_ROUTES.banners} onNavigate={markOpenedFromYou} icon="photo_library" title="Banners"
                    loading={!snap} subtitle={snap?.banners ?? 'Pictures at the top of your menu'} />
            </Group>

            <SectionTitle id="you-plan">Plan &amp; stores</SectionTitle>
            <Group labelledBy="you-plan">
                <Row index={5} href={YOU_ROUTES.plan} onNavigate={markOpenedFromYou} icon="workspace_premium" title="Plan & bills"
                    subtitle={planLine(status)} subtitleTone={status.canPay ? 'warn' : undefined} />
                <Row index={6} href={YOU_ROUTES.addStore} onNavigate={markOpenedFromYou} icon="add_business" title="Add a store"
                    subtitle={storesLine} />
            </Group>

            <SectionTitle id="you-help">Help</SectionTitle>
            <Group labelledBy="you-help">
                <Row index={7} href={YOU_ROUTES.help} onNavigate={markOpenedFromYou} icon="support_agent" title="Help & support"
                    subtitle="WhatsApp or email the vsite team" />
            </Group>

            {/* ── Sign-out: last, plain, and behind a question ── */}
            <footer className="you-rise" style={{ ...rise(8), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '28px 0 8px' }}>
                {phone && <span style={{ fontSize: 12, color: Y.muted }}>Signed in as {phone}</span>}
                <button type="button" data-you-signout onClick={() => setConfirmSignOut(true)} className="you-press you-focus" style={{ ...quietButton, color: Y.text, fontSize: 14, fontWeight: 500 }}>
                    Sign out
                </button>
            </footer>

            <Sheet open={confirmSignOut} onClose={() => setConfirmSignOut(false)} labelledBy="you-signout-title" busy={signingOut}>
                <span style={{ width: 48, height: 48, borderRadius: 14, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    <Icon icon="logout" size={26} color={Y.text} />
                </span>
                <h2 id="you-signout-title" style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>Sign out of vsite?</h2>
                <p style={{ margin: '6px 0 20px', fontSize: 15, lineHeight: '22px', color: Y.text }}>
                    To get back in you will need a new SMS code{phone ? ` sent to ${phone}` : ''}. You don’t need to sign out to close the app.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button type="button" data-autofocus onClick={() => setConfirmSignOut(false)} disabled={signingOut} className="you-press" style={primaryButton}>
                        Stay signed in
                    </button>
                    <button type="button" onClick={handleSignOut} disabled={signingOut} className="you-press you-focus" style={{ ...quietButton, width: '100%', minHeight: 48, color: Y.danger }}>
                        {signingOut ? <><Spinner size="sm" tone="current" />Signing out…</> : 'Sign out'}
                    </button>
                </div>
            </Sheet>
        </div>
    );
}
