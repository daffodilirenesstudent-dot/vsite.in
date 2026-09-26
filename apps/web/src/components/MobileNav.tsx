'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePlan } from './PlanContext';
import { useNotifications } from './NotificationContext';
import { MOBILE_NAV_V2, NAV_V2, activeTabFor, badgeText } from '@/lib/ui/mobileNav';
import { startNav, usePendingNav } from '@/lib/ui/navPending';

const DEFAULT_NAV = [
    { label: 'Dashboard',  icon: 'bar_chart',   href: '/manage/dashboard',         gated: false },
    { label: 'Orders',     icon: 'description',  href: '/manage/orders',            gated: true  },
    { label: 'Products',   icon: 'package_2',    href: '/manage/product-inventory', gated: false },
    { label: 'Settings',   icon: 'settings',     href: '/manage/settings',          gated: false },
];

// qr_menu / base plan: no orders/transactions — surface QR directly in the bottom bar.
const QR_MENU_NAV = [
    { label: 'Home',      icon: 'home',       href: '/manage/dashboard',         gated: false },
    { label: 'Products',  icon: 'package_2',  href: '/manage/product-inventory', gated: false },
    { label: 'QR Codes',  icon: 'qr_code_2',  href: '/manage/qr',                gated: false },
    { label: 'Banners',   icon: 'image',      href: '/manage/banner-management', gated: false },
    { label: 'Settings',  icon: 'settings',   href: '/manage/settings',          gated: false },
];

const ACTIVE_COLOR  = '#5137EF';
const DEFAULT_COLOR = '#71717A';

function LegacyMobileNav() {
    const pathname = usePathname();
    const { isPayEat, isQrMenu, isQrOrder } = usePlan();
    const { missingImageCount, settingsIncomplete, bannerDot } = useNotifications();

    const qrMenuOnly = isQrMenu; // isQrMenu now means menu-only (see PlanContext)
    const NAV_ITEMS = qrMenuOnly ? QR_MENU_NAV : DEFAULT_NAV;

    // Settings tab is also "active" for sub-pages reachable from Settings on mobile.
    // For qr_menu plan, QR and Banners have their own tabs so they shouldn't fold into Settings.
    const isSettingsActive = qrMenuOnly
        ? (pathname === '/manage/settings' || pathname.startsWith('/manage/subscription'))
        : (
            pathname === '/manage/settings' ||
            pathname.startsWith('/manage/banner-management') ||
            pathname.startsWith('/manage/transactions') ||
            pathname.startsWith('/manage/qr') ||
            pathname.startsWith('/manage/subscription')
        );

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 bg-white z-50 md:hidden flex items-stretch"
            style={{
                borderTop: '1px solid #E4E4E7',
                height: 'calc(60px + env(safe-area-inset-bottom))',
                paddingBottom: 'env(safe-area-inset-bottom)',
            }}
        >
            {NAV_ITEMS.map((item) => {
                // Matches Sidebar's rule — MobileNav previously omitted the
                // isQrOrder check, so qr_order stores saw an unlocked tab here
                // and a locked one in the sidebar.
                const locked = item.gated && !isPayEat && !isQrOrder;
                const href = locked ? '/manage/subscription' : item.href;
                const isActive =
                    !locked && (
                        item.href === '/manage/settings'
                            ? isSettingsActive
                            : pathname === item.href ||
                              (item.href !== '/manage/dashboard' && pathname.startsWith(item.href))
                    );
                const color = locked ? '#C4C4C4' : isActive ? ACTIVE_COLOR : DEFAULT_COLOR;

                // Mobile dot: Products → missing images; Settings → incomplete or bannerDot
                const showDot =
                    (item.href === '/manage/product-inventory' && missingImageCount > 0) ||
                    (item.href === '/manage/settings' && (settingsIncomplete || bannerDot));

                return (
                    <Link
                        key={item.href}
                        href={href}
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 3,
                            textDecoration: 'none',
                            color,
                            position: 'relative',
                        }}
                    >
                        {/* Icon with dot overlay */}
                        <div style={{ position: 'relative', display: 'inline-flex' }}>
                            <span
                                className="material-symbols-outlined"
                                style={{
                                    fontSize: 24,
                                    fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                                }}
                            >
                                {item.icon}
                            </span>
                            {showDot && (
                                <span style={{
                                    position: 'absolute', top: 0, right: -2,
                                    width: 7, height: 7, borderRadius: '50%',
                                    background: '#E7000B',
                                    border: '1.5px solid #FFFFFF',
                                }} />
                            )}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400, lineHeight: '14px' }}>
                            {item.label}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}

/**
 * v2 (NEXT_PUBLIC_MOBILE_NAV_V2, menu-only stores): Home · Menu · QR · You.
 * WhatsApp's Material 3 bar is the model — a pill behind the active icon,
 * labels at 12 px, count badges — plus the habits every tab bar has: re-tapping
 * the current tab scrolls to the top, and a tapped tab lights up at once
 * rather than when its page finally arrives.
 */
function MobileNavV2() {
    const pathname = usePathname();
    const pending = usePendingNav();
    const { missingImageCount, settingsIncomplete, bannerDot } = useNotifications();
    const current = activeTabFor(pending ?? pathname);

    return (
        <nav
            aria-label="Main"
            className="fixed bottom-0 left-0 right-0 bg-white z-50 md:hidden flex items-stretch"
            style={{
                borderTop: '1px solid #ECECEF',
                height: 'calc(64px + env(safe-area-inset-bottom))',
                paddingBottom: 'env(safe-area-inset-bottom)',
                boxShadow: '0 -2px 12px rgba(20, 16, 60, 0.04)',
            }}
        >
            {NAV_V2.map((tab) => {
                const active = current === tab.id;
                const count = tab.id === 'menu' ? badgeText(missingImageCount) : null;
                const dot = tab.id === 'you' && (settingsIncomplete || bannerDot);
                return (
                    <Link
                        key={tab.id}
                        href={tab.href}
                        aria-current={active ? 'page' : undefined}
                        aria-label={count ? `${tab.label}, ${count} dishes need a photo` : tab.label}
                        className="vs-tab"
                        onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                            if (pathname === tab.href) {
                                // Already here: take the owner back to the top, like every app's tab bar.
                                e.preventDefault();
                                document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
                                return;
                            }
                            startNav(tab.href);
                        }}
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            textDecoration: 'none',
                            color: active ? '#1C1464' : '#5B5B66',
                            WebkitTapHighlightColor: 'transparent',
                        }}
                    >
                        <span
                            className="vs-tab-pill"
                            style={{
                                position: 'relative',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: 56, height: 30, borderRadius: 999,
                                background: active ? '#E6E1FF' : 'transparent',
                                transition: 'background 0.2s ease',
                            }}
                        >
                            <span
                                className="material-symbols-outlined"
                                aria-hidden
                                style={{ fontSize: 24, color: active ? '#5137EF' : '#5B5B66', fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
                            >
                                {tab.icon}
                            </span>
                            {count && (
                                <span aria-hidden style={{
                                    position: 'absolute', top: -2, left: 32,
                                    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
                                    background: '#D92D20', color: '#FFFFFF', border: '2px solid #FFFFFF',
                                    fontSize: 10, fontWeight: 700, lineHeight: '14px', textAlign: 'center',
                                }}>{count}</span>
                            )}
                            {dot && (
                                <span aria-hidden style={{
                                    position: 'absolute', top: 1, left: 36,
                                    width: 9, height: 9, borderRadius: '50%', background: '#D92D20', border: '2px solid #FFFFFF',
                                }} />
                            )}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, lineHeight: '16px' }}>{tab.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}

export default function MobileNav() {
    const { isQrMenu } = usePlan();
    const qrMenuOnly = isQrMenu;
    return MOBILE_NAV_V2 && qrMenuOnly ? <MobileNavV2 /> : <LegacyMobileNav />;
}
