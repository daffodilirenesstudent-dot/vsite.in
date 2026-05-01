'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';
import { usePlan } from './PlanContext';
import { useNotifications } from './NotificationContext';

const NAV_ITEMS = [
    { name: 'Dashboard',         icon: 'bar_chart',   href: '/manage/dashboard',          gated: false },
    { name: 'Product Inventory', icon: 'package_2',   href: '/manage/product-inventory',  gated: false },
    { name: 'Banner Management', icon: 'image',        href: '/manage/banner-management',  gated: false },
    { name: 'QR Code & Poster',  icon: 'qr_code_2',   href: '/manage/qr',                 gated: false },
    { name: 'Orders',            icon: 'description', href: '/manage/orders',              gated: true  },
    { name: 'Transactions',      icon: 'credit_card', href: '/manage/transactions',        gated: true  },
    { name: 'Store Settings',    icon: 'settings',    href: '/manage/settings',            gated: false },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { signOut } = useAuth();
    const { plan, isPayEat } = usePlan();
    const { missingImageCount, settingsIncomplete, bannerDot } = useNotifications();

    const handleSignOut = async () => {
        await signOut();
        // Full navigation (not router.push) so the entire Provider tree unmounts
        // and React Query / context caches are cleared. Also prevents browser-back
        // from landing on a cached /manage/* page that then re-triggers AuthGate.
        window.location.replace('/login');
    };

    const planLabel =
        plan === 'pro'      ? 'Pay-Eat QR Menu' :
        plan === 'pay_eat'  ? 'Pay-Eat QR Menu' :
        plan === 'qr_menu'  ? 'QR Menu'         :
        'Free Plan';

    return (
        <>
            {/* ── COLLAPSED ICON SIDEBAR — tablet only (md to lg) ── */}
            <aside className="hidden md:flex lg:hidden flex-col bg-white border-r border-[#E5E7EB] shrink-0 items-center py-3 gap-1" style={{ width: 60 }}>
                <Link href="/" className="mb-2">
                    <Image src="/android-chrome-192x192.png" alt="Vsite" width={36} height={36} className="h-9 w-9 rounded-lg" />
                </Link>
                <nav className="flex flex-col gap-1 flex-1 w-full px-1.5">
                    {NAV_ITEMS.map((item) => {
                        const locked = item.gated && !isPayEat;
                        const href = locked ? '/manage/subscription' : item.href;
                        const active =
                            !locked && (
                                pathname === item.href ||
                                (item.href !== '/manage/dashboard' && pathname.startsWith(item.href))
                            );
                        const showDot =
                            (item.href === '/manage/product-inventory' && missingImageCount > 0) ||
                            (item.href === '/manage/settings'          && settingsIncomplete)    ||
                            (item.href === '/manage/banner-management' && bannerDot);

                        return (
                            <Link
                                key={item.name}
                                href={href}
                                title={item.name}
                                className="flex items-center justify-center relative transition-colors"
                                style={{
                                    width: '100%', height: 36, borderRadius: 8,
                                    background: active ? '#EEEBFD' : 'transparent',
                                    color: locked ? '#C4C4C4' : active ? '#5137EF' : '#4C4C4C',
                                    textDecoration: 'none',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>
                                    {item.icon}
                                </span>
                                {showDot && (
                                    <span style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: '#E7000B' }} />
                                )}
                            </Link>
                        );
                    })}
                </nav>
                <button
                    onClick={handleSignOut}
                    title="Sign Out"
                    className="flex items-center justify-center transition-colors hover:bg-neutral-50 mt-auto"
                    style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #E4E4E7', background: '#FFF', cursor: 'pointer' }}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#52525C' }}>logout</span>
                </button>
            </aside>

            {/* ── FULL SIDEBAR — desktop (lg+) ── */}
            <aside className="hidden lg:flex flex-col bg-white border-r border-[#E5E7EB] shrink-0" style={{ width: 256 }}>
                <div className="flex items-center gap-2.5 px-5 border-b border-[#E5E7EB]" style={{ height: 73 }}>
                    <Image src="/android-chrome-192x192.png" alt="Vsite" width={32} height={32} className="h-8 w-8 rounded-lg" />
                    <span className="font-extrabold text-[#0D0439] tracking-tight" style={{ fontSize: 17 }}>vsite</span>
                </div>

                <div className="flex-1 overflow-y-auto" style={{ padding: '12px 12px 0' }}>
                    <div style={{ marginBottom: 8 }}>
                        <p className="px-2 font-medium text-[#99A1AF]" style={{ fontSize: 12, lineHeight: '16px' }}>GENERAL</p>
                    </div>
                    <nav className="flex flex-col gap-0.5">
                        {NAV_ITEMS.map((item) => {
                            const locked = item.gated && !isPayEat;
                            const active =
                                !locked && (
                                    pathname === item.href ||
                                    (item.href !== '/manage/dashboard' && pathname.startsWith(item.href))
                                );

                            if (locked) {
                                return (
                                    <Link
                                        key={item.name}
                                        href="/manage/subscription"
                                        className="flex items-center justify-between transition-colors hover:bg-neutral-50"
                                        style={{ padding: '0 8px', height: 36, borderRadius: 10, color: '#B0B0B0', fontSize: 14, textDecoration: 'none' }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16, color: '#C4C4C4', width: 16, height: 16 }}>
                                                {item.icon}
                                            </span>
                                            <span>{item.name}</span>
                                        </div>
                                        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.3, color: '#5137EF', background: '#EEEEFF', borderRadius: 4, padding: '2px 5px', whiteSpace: 'nowrap' }}>
                                            SOON
                                        </span>
                                    </Link>
                                );
                            }

                            const showDot =
                                (item.href === '/manage/product-inventory' && missingImageCount > 0) ||
                                (item.href === '/manage/settings'          && settingsIncomplete)    ||
                                (item.href === '/manage/banner-management' && bannerDot);

                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className="flex items-center transition-colors"
                                    style={{
                                        padding: '0 8px', gap: 8, height: 36,
                                        borderRadius: active ? 6 : 10,
                                        background: active ? '#EEEBFD' : 'transparent',
                                        color: active ? '#4F39F6' : '#4C4C4C',
                                        fontWeight: active ? 500 : 400,
                                        fontSize: 14, lineHeight: '20px',
                                        textDecoration: 'none', position: 'relative',
                                    }}
                                >
                                    <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16, color: active ? '#5137EF' : '#4C4C4C', width: 16, height: 16 }}>
                                        {item.icon}
                                    </span>
                                    <span className="flex-1">{item.name}</span>
                                    {showDot && (
                                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E7000B', flexShrink: 0 }} />
                                    )}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                <div style={{ padding: '13px 12px 0', borderTop: '1px solid #E5E7EB' }}>
                    <div className="text-white" style={{ background: 'linear-gradient(90deg, #615FFF 0%, #AD46FF 100%)', borderRadius: 14, padding: '12px 12px 0', marginBottom: 8 }}>
                        <div className="flex items-center gap-2" style={{ marginBottom: 8, height: 36 }}>
                            <div className="flex items-center justify-center" style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.2)', borderRadius: 10 }}>
                                <span className="material-symbols-outlined text-white" style={{ fontSize: 16 }}>group</span>
                            </div>
                            <div className="flex-1">
                                <p className="font-medium text-white" style={{ fontSize: 14, lineHeight: '20px' }}>Team</p>
                                <p className="text-white/80" style={{ fontSize: 12, lineHeight: '16px' }}>{planLabel}</p>
                            </div>
                            <span className="material-symbols-outlined text-white" style={{ fontSize: 12 }}>keyboard_arrow_down</span>
                        </div>
                        <Link href="/manage/subscription" className="flex w-full items-center justify-center text-white transition-colors" style={{ height: 28, background: 'rgba(255,255,255,0.2)', borderRadius: 10, fontSize: 12, lineHeight: '16px', marginBottom: 12, textDecoration: 'none' }}>
                            Upgrade Plan
                        </Link>
                    </div>
                    <button onClick={handleSignOut} className="flex w-full items-center gap-2 transition-colors hover:bg-neutral-50" style={{ height: 36, borderRadius: 8, border: '1px solid #E4E4E7', padding: '0 12px', fontSize: 13, fontWeight: 500, color: '#52525C', background: '#FFFFFF', marginBottom: 8, cursor: 'pointer' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#52525C' }}>logout</span>
                        Sign Out
                    </button>
                    <div className="flex items-center justify-center pb-3">
                        <span className="text-center text-[#99A1AF]" style={{ fontSize: 10, lineHeight: '15px' }}>© 2026 Vsite.com</span>
                    </div>
                </div>
            </aside>
        </>
    );
}
