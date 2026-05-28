'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from './AuthContext';
import { supabase } from '@/lib/supabase';
import { useSite } from './SiteContext';
import { usePlan } from './PlanContext';
import PrinterStatusIndicator from './PrinterStatusIndicator';
import NotificationBell from './NotificationBell';

const TRIAL_STORE_LIMIT = 2;
const PAID_STORE_LIMIT  = 5;
const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export default function DashboardHeader() {
    const { user, signOut } = useAuth();
    const router = useRouter();
    const { activeSite, allSites, setActiveSiteId } = useSite();
    const { planLoading, isQrMenu, isQrOrder, isPayEat } = usePlan();
    const qrMenuOnly = isQrMenu && !isQrOrder && !isPayEat;

    const [profile, setProfile] = useState<{ full_name: string; phone_number: string | null } | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [confirmSignOut, setConfirmSignOut] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!user) return;
        supabase
            .from('profiles')
            .select('full_name, phone_number')
            .eq('id', user.id)
            .single()
            .then(({ data }) => {
                if (!data) return;
                // Guard: if full_name was accidentally stored as a phone number, clear it
                const looksLikePhone = /^\+?\d{7,}$/.test((data.full_name ?? '').trim());
                if (looksLikePhone) {
                    setProfile({ ...data, full_name: '' });
                    // Repair the DB row so other consumers don't see the bad value
                    supabase.from('profiles').update({ full_name: '' }).eq('id', user.id);
                } else {
                    setProfile(data);
                }
            });
    }, [user]);

    // Close dropdown on outside click
    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        if (dropdownOpen) document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [dropdownOpen]);

    // Close profile menu on outside click
    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
                setProfileMenuOpen(false);
            }
        };
        if (profileMenuOpen) document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [profileMenuOpen]);

    // Close menus / modal on Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (confirmSignOut) setConfirmSignOut(false);
            else if (profileMenuOpen) setProfileMenuOpen(false);
            else if (dropdownOpen) setDropdownOpen(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [confirmSignOut, profileMenuOpen, dropdownOpen]);

    const handleSignOut = async () => {
        if (signingOut) return;
        setSigningOut(true);
        try {
            await signOut();
            router.replace('/login');
        } catch (err) {
            console.error('[DashboardHeader] signOut failed:', err);
            setSigningOut(false);
            setConfirmSignOut(false);
        }
    };

    // Focus search input when opened
    useEffect(() => {
        if (searchOpen) searchRef.current?.focus();
    }, [searchOpen]);

    const displayName = profile?.full_name || 'User';
    const avatarLetter = displayName.charAt(0).toUpperCase();
    const avatarImg = activeSite?.image_url ?? null;

    const handleSwitchStore = (id: string) => {
        setActiveSiteId(id);
        setDropdownOpen(false);
    };

    return (
        <header className="bg-white border-b border-[#E5E7EB] shrink-0" style={{ height: 60 }}>

            {/* ── Normal row ── */}
            <div className={`flex items-center h-full ${searchOpen ? 'hidden' : 'flex'}`} style={{ padding: '0 16px', gap: 10 }}>

                {/* Store selector */}
                <div className="relative shrink-0" ref={dropdownRef}>
                    <button
                        onClick={() => setDropdownOpen(v => !v)}
                        className="flex items-center gap-1.5 hover:bg-neutral-50 transition-colors"
                        style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '5px 8px', background: '#FFFFFF', cursor: 'pointer', maxWidth: 160 }}
                    >
                        <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 14 }}>receipt_long</span>
                        <span className="truncate inline-block" style={{ fontSize: 12, fontWeight: 500, color: '#0A0A0A', maxWidth: 110 }}>
                            {activeSite?.name ?? 'My Store'}
                        </span>
                        <span
                            className="material-symbols-outlined text-[#99A1AF] shrink-0"
                            style={{ fontSize: 14, transition: 'transform 0.15s', transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        >
                            keyboard_arrow_down
                        </span>
                    </button>

                    {/* Dropdown */}
                    {dropdownOpen && (
                        <div
                            className="absolute left-0 top-full mt-1.5 bg-white"
                            style={{ border: '1px solid #E4E4E7', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', minWidth: 220, zIndex: 100, overflow: 'hidden' }}
                        >
                            {/* All stores */}
                            {allSites.map((site, idx) => {
                                const isActive = site.id === activeSite?.id;
                                const initials = site.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
                                return (
                                    <button
                                        key={site.id}
                                        onClick={() => handleSwitchStore(site.id)}
                                        className="flex w-full items-center gap-2 hover:bg-neutral-50 transition-colors"
                                        style={{
                                            padding: '10px 14px',
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            borderBottom: idx < allSites.length - 1 ? '1px solid #F4F4F5' : 'none',
                                        }}
                                    >
                                        <div style={{ width: 30, height: 30, borderRadius: 7, background: isActive ? '#EEEBFD' : '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                                            {site.image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={site.image_url} alt={site.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? '#5137EF' : '#71717A' }}>{initials}</span>
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                            <p className="truncate" style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A' }}>{site.name}</p>
                                            <p style={{ fontSize: 11, color: '#99A1AF' }}>{site.is_live ? 'Live' : 'Offline'}</p>
                                        </div>
                                        {isActive && (
                                            <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16, color: '#5137EF' }}>check</span>
                                        )}
                                    </button>
                                );
                            })}

                            {/* Divider + store count */}
                            {(() => {
                                const now = Date.now();
                                const activeTrialCount = allSites.filter(s => {
                                    const sub = s.site_subscriptions;
                                    const paidExpiry = sub?.store_expires_at ? new Date(sub.store_expires_at).getTime() : 0;
                                    if (paidExpiry > now) return false;
                                    return new Date(s.created_at).getTime() + TRIAL_DURATION_MS > now;
                                }).length;
                                const paidCount = allSites.filter(s => {
                                    const sub = s.site_subscriptions;
                                    return sub?.store_expires_at
                                        ? new Date(sub.store_expires_at).getTime() > now
                                        : false;
                                }).length;
                                const atTrialLimit = activeTrialCount >= TRIAL_STORE_LIMIT;
                                const atPaidLimit  = allSites.length >= PAID_STORE_LIMIT;
                                const canCreate    = !atTrialLimit && !atPaidLimit;

                                return (
                                    <>
                                        <div style={{ borderTop: '1px solid #E4E4E7', padding: '6px 14px 4px' }}>
                                            {!planLoading && (
                                                <p style={{ fontSize: 10, fontWeight: 500, color: '#99A1AF', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                                    {`${allSites.length} / ${PAID_STORE_LIMIT} stores · ${paidCount} paid · ${activeTrialCount} trial`}
                                                </p>
                                            )}
                                        </div>

                                        {/* Create new store — limit-aware */}
                                        {canCreate ? (
                                            <button
                                                onClick={() => { setDropdownOpen(false); router.push('/onboarding?new=true'); }}
                                                className="flex w-full items-center gap-2 hover:bg-neutral-50 transition-colors"
                                                style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
                                            >
                                                <div style={{ width: 30, height: 30, borderRadius: 7, border: '1.5px dashed #C4B5FD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#5137EF' }}>add</span>
                                                </div>
                                                <span style={{ fontSize: 13, fontWeight: 500, color: '#5137EF' }}>Create New Store</span>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => { setDropdownOpen(false); router.push('/manage/subscription'); }}
                                                className="flex w-full items-center gap-2 hover:bg-neutral-50 transition-colors"
                                                style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer' }}
                                            >
                                                <div style={{ width: 30, height: 30, borderRadius: 7, border: '1.5px dashed #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#DC2626' }}>lock</span>
                                                </div>
                                                <div style={{ textAlign: 'left' }}>
                                                    <p style={{ fontSize: 13, fontWeight: 500, color: '#DC2626' }}>
                                                        {atPaidLimit ? 'Max stores reached' : 'Trial limit reached'}
                                                    </p>
                                                    <p style={{ fontSize: 10, color: '#71717A' }}>
                                                        {atPaidLimit
                                                            ? `${PAID_STORE_LIMIT}-store account limit reached`
                                                            : `Free trial allows ${TRIAL_STORE_LIMIT} unpaid stores — activate a plan to add more`}
                                                    </p>
                                                </div>
                                            </button>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>

                {/* Search bar — desktop only inline, mobile icon */}
                <div
                    className="hidden lg:flex items-center gap-1.5"
                    style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '6px 10px', background: '#FFFFFF', width: 260 }}
                >
                    <span className="material-symbols-outlined text-[#99A1AF] shrink-0" style={{ fontSize: 14 }}>search</span>
                    <input
                        type="text"
                        placeholder="Search"
                        className="flex-1 bg-transparent text-[#0A0A0A] placeholder-[#99A1AF] outline-none min-w-0"
                        style={{ fontSize: 12 }}
                    />
                    <span
                        className="shrink-0 text-[#99A1AF]"
                        style={{ fontSize: 9, fontWeight: 500, border: '1px solid #E4E4E7', borderRadius: 4, padding: '2px 4px', background: '#F4F4F4', lineHeight: '14px', whiteSpace: 'nowrap' }}
                    >
                        ⌘ + F
                    </span>
                </div>

                {/* Mobile search icon */}
                <button
                    type="button"
                    aria-label="Open search"
                    className="lg:hidden flex items-center justify-center shrink-0"
                    style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #E4E4E7', background: '#FFFFFF' }}
                    onClick={() => setSearchOpen(true)}
                >
                    <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 18 }} aria-hidden>search</span>
                </button>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Bell + User */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Printer status — bridge connection + per-role health */}
                    {!qrMenuOnly && <PrinterStatusIndicator />}
                    <NotificationBell />

                    {/* Profile button + dropdown */}
                    <div className="relative" ref={profileMenuRef}>
                        <button
                            type="button"
                            onClick={() => setProfileMenuOpen(v => !v)}
                            aria-haspopup="menu"
                            aria-expanded={profileMenuOpen}
                            className="flex items-center gap-2 hover:bg-neutral-50 transition-colors"
                            style={{ borderRadius: 8, padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                            <div className="shrink-0 overflow-hidden" style={{ width: 34, height: 34, borderRadius: '50%', background: '#5137EF' }}>
                                {avatarImg ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={avatarImg} alt={displayName} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center text-white font-bold" style={{ fontSize: 13 }}>
                                        {avatarLetter}
                                    </div>
                                )}
                            </div>
                            <div className="hidden sm:flex flex-col leading-tight" style={{ maxWidth: 110 }}>
                                <span className="font-semibold text-[#0A0A0A] truncate text-left" style={{ fontSize: 13, lineHeight: '18px' }}>{displayName}</span>
                                <span className="text-[#99A1AF] truncate hidden lg:block text-left" style={{ fontSize: 11, lineHeight: '15px' }}>Product Management</span>
                            </div>
                            <span
                                className="material-symbols-outlined text-[#99A1AF] hidden sm:block shrink-0"
                                style={{ fontSize: 16, transition: 'transform 0.15s', transform: profileMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            >
                                keyboard_arrow_down
                            </span>
                        </button>

                        {profileMenuOpen && (
                            <div
                                role="menu"
                                className="absolute right-0 top-full mt-1.5 bg-white"
                                style={{ border: '1px solid #E4E4E7', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', minWidth: 220, zIndex: 100, overflow: 'hidden' }}
                            >
                                <div style={{ padding: '12px 14px', borderBottom: '1px solid #F4F4F5' }}>
                                    <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>{displayName}</p>
                                    {profile?.phone_number && (
                                        <p className="truncate" style={{ fontSize: 11, color: '#99A1AF', marginTop: 2 }}>{profile.phone_number}</p>
                                    )}
                                </div>
                                <Link
                                    href="/manage/settings"
                                    onClick={() => setProfileMenuOpen(false)}
                                    role="menuitem"
                                    className="flex items-center gap-2 hover:bg-neutral-50 transition-colors"
                                    style={{ padding: '10px 14px', textDecoration: 'none', color: '#0A0A0A' }}
                                >
                                    <span className="material-symbols-outlined text-[#71717A]" style={{ fontSize: 18 }}>settings</span>
                                    <span style={{ fontSize: 13, fontWeight: 500 }}>Settings</span>
                                </Link>
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => { setProfileMenuOpen(false); setConfirmSignOut(true); }}
                                    className="flex w-full items-center gap-2 hover:bg-neutral-50 transition-colors"
                                    style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', borderTop: '1px solid #F4F4F5' }}
                                >
                                    <span className="material-symbols-outlined text-[#DC2626]" style={{ fontSize: 18 }}>logout</span>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: '#DC2626' }}>Sign out</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Sign-out confirmation modal ── */}
            {confirmSignOut && (
                <div
                    className="fixed inset-0 flex items-end sm:items-center justify-center"
                    style={{ zIndex: 200, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
                    onClick={(e) => { if (e.target === e.currentTarget && !signingOut) setConfirmSignOut(false); }}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="signout-title"
                        style={{ background: '#FFFFFF', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 380, padding: '24px 24px 28px' }}
                        className="sm:rounded-2xl sm:mx-4"
                    >
                        <div className="flex flex-col items-center text-center gap-3">
                            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#DC2626' }}>logout</span>
                            </div>
                            <p id="signout-title" className="font-semibold text-[#0A0A0A]" style={{ fontSize: 17 }}>Sign out?</p>
                            <p className="text-[#52525C]" style={{ fontSize: 13, lineHeight: '20px' }}>
                                You&apos;ll need to log in again to access your dashboard.
                            </p>
                        </div>
                        <div className="flex gap-2 mt-5">
                            <button
                                type="button"
                                onClick={() => setConfirmSignOut(false)}
                                disabled={signingOut}
                                style={{ flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 500, border: '1px solid #E4E4E7', background: '#FFFFFF', color: '#52525C', cursor: signingOut ? 'not-allowed' : 'pointer', opacity: signingOut ? 0.5 : 1 }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSignOut}
                                disabled={signingOut}
                                style={{ flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600, border: 'none', background: '#DC2626', color: '#FFFFFF', cursor: signingOut ? 'wait' : 'pointer', opacity: signingOut ? 0.85 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                            >
                                {signingOut ? (
                                    <>
                                        <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'hdr-spin 0.7s linear infinite', display: 'inline-block' }} />
                                        Signing out…
                                    </>
                                ) : 'Sign out'}
                            </button>
                        </div>
                        <style>{`@keyframes hdr-spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                </div>
            )}

            {/* ── Mobile search expanded row ── */}
            {searchOpen && (
                <div className="flex items-center h-full gap-2" style={{ padding: '0 16px' }}>
                    <div className="flex items-center gap-2 flex-1" style={{ border: '1px solid #5137EF', borderRadius: 8, padding: '7px 12px', background: '#FFFFFF' }}>
                        <span className="material-symbols-outlined text-[#5137EF] shrink-0" style={{ fontSize: 16 }}>search</span>
                        <input
                            ref={searchRef}
                            type="text"
                            placeholder="Search products, categories…"
                            className="flex-1 bg-transparent text-[#0A0A0A] placeholder-[#99A1AF] outline-none min-w-0"
                            style={{ fontSize: 14 }}
                        />
                    </div>
                    <button
                        onClick={() => setSearchOpen(false)}
                        className="shrink-0 text-[#71717A] hover:text-[#0A0A0A] transition-colors"
                        style={{ fontSize: 14, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                    >
                        Cancel
                    </button>
                </div>
            )}
        </header>
    );
}
