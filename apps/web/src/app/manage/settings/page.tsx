'use client';
import { Spinner, SectionLoader } from '@/components/loading';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/platform/db/supabase';
import { useSite } from '@/components/SiteContext';
import { useAuth } from '@/components/AuthContext';
import { usePlan } from '@/components/PlanContext';
import GstWizard, { type GstProfile } from './_components/GstWizard';
import AppearancePanel, { type AppearanceState } from './_components/AppearancePanel';
import {
    MENU_THEMES, DEFAULT_MENU_THEME, DEFAULT_FONT_PAIR,
    isMenuThemeId, isFontPairId, isHexColor,
} from '@/lib/menu/menuThemes';
import { BUSINESS_TYPES, isBusinessType, isValidPincode } from '@/lib/store/businessTypes';
import { TIME_SLOTS, formatTiming, parseTiming, type StoreTiming } from '@/lib/store/storeTiming';
import { ORDERING_FROZEN } from '@/lib/platform/productFlags';
import { deleteStore } from '@/lib/store/deleteStore';
import { refreshPublicMenu } from '@/lib/menu/refreshPublicMenu';

export default function SettingsPage() {
    const router = useRouter();
    const { activeSite, refreshSites } = useSite();
    const { user, signOut } = useAuth();
    const { isQrOrder, isQrMenu } = usePlan();
    const qrMenuOnly = isQrMenu; // isQrMenu now means menu-only (see PlanContext)

    const handleSignOut = async () => {
        await signOut();
        // Full navigation so all context providers unmount cleanly — same reason as Sidebar.
        window.location.replace('/login');
    };

    // ── Active tab (persisted via ?tab=…) ─────────────────────────────────────
    type TabId = 'store' | 'appearance' | 'printing' | 'payments' | 'gst' | 'orders' | 'danger';
    const [activeTab, setActiveTabState] = useState<TabId>('store');
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const t = new URLSearchParams(window.location.search).get('tab');
        const valid: TabId[] = qrMenuOnly
            ? ['store', 'appearance', 'danger']
            : ['store', 'appearance', 'printing', 'payments', 'gst', 'orders', 'danger'];
        if (t && (valid as string[]).includes(t)) setActiveTabState(t as TabId);
        else if (qrMenuOnly) setActiveTabState('store');
    }, [qrMenuOnly]);
    const setActiveTab = (id: TabId) => {
        setActiveTabState(id);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', id);
            // Strip Razorpay callback params so they don't re-trigger the banner
            // when the admin re-clicks the Payments tab.
            url.searchParams.delete('connected');
            url.searchParams.delete('error');
            window.history.replaceState({}, '', url.toString());
        }
    };

    const [siteId, setSiteId]     = useState('');
    const [siteSlug, setSiteSlug] = useState('');
    const [form, setForm] = useState({
        businessName: '', phoneNumber: '', location: '', pincode: '', businessType: '',
    });
    const [timing, setTiming] = useState<StoreTiming>({ open247: false, opensAt: null, closesAt: null });
    /**
     * The raw sites.timing value as loaded. Anything the picker cannot
     * represent (everything the old free-text box collected) is preserved and
     * only overwritten once the owner actually picks something — otherwise
     * merely opening this tab would rewrite a store's published hours.
     */
    const [rawTiming, setRawTiming] = useState('');

    const [appearance, setAppearance] = useState<AppearanceState>({
        menu_theme: DEFAULT_MENU_THEME,
        menu_font: DEFAULT_FONT_PAIR,
        primary_color: MENU_THEMES[DEFAULT_MENU_THEME].accent,
    });
    /** Real dish names for the design swatches — never placeholders. */
    const [dishNames, setDishNames] = useState<string[]>([]);
    const [dishPrices, setDishPrices] = useState<number[]>([]);
    const [loading, setLoading]       = useState(true);
    const [saving, setSaving]         = useState(false);

    // Delete store state
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    // ── Payments (Razorpay OAuth) state ───────────────────────────────────────
    type RzpHealth = 'not_connected' | 'active' | 'expiring_soon' | 'expired' | 'revoked';
    interface RzpStatus {
        connected:      boolean;
        health:         RzpHealth;
        accountId?:     string;
        mode?:          'test' | 'live';
        expiresAt?:     string;
        expiresInDays?: number;
        connectedAt?:   string;
        lastUpdatedAt?: string;
        checkedAt?:     string;
    }
    const [rzpStatus,        setRzpStatus]        = useState<RzpStatus | null>(null);
    const [rzpStatusLoading, setRzpStatusLoading] = useState(true);
    const [rzpBusy,          setRzpBusy]          = useState<'connect' | 'disconnect' | 'change' | null>(null);
    const [rzpBanner,        setRzpBanner]        = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

    // ── WhatsApp order taking ─────────────────────────────────────────────────
    const [whatsappEnabled,    setWhatsappEnabled]    = useState(false);
    const [whatsappNumber,     setWhatsappNumber]     = useState('');
    const [whatsappSaving,     setWhatsappSaving]     = useState(false);

    // ── Display currency ──────────────────────────────────────────────────────
    const [currencyCode,       setCurrencyCode]       = useState<'INR' | 'AED'>('INR');
    const [currencySaving,     setCurrencySaving]     = useState(false);

    // ── GST compliance state ──────────────────────────────────────────────────
    const [gstProfile,        setGstProfile]        = useState<GstProfile | null>(null);
    const [gstLoading,        setGstLoading]        = useState(true);
    const [gstWizardOpen,     setGstWizardOpen]     = useState(false);
    const [gstResetting,      setGstResetting]      = useState(false);

    // ── KOT settings state ────────────────────────────────────────────────────
    const [kotMode,         setKotModeState]   = useState<'manual' | 'automatic'>('manual');
    const [kotModeLoaded,   setKotModeLoaded]  = useState(false);
    const [kotModeUpdating, setKotModeUpdating]= useState(false);
    const [kotDevMode,      setKotDevMode]     = useState(false);

    // ── Windows Print Bridge state ────────────────────────────────────────────
    const BRIDGE_URL = 'http://127.0.0.1:7878';
    const [bridgeOnline,       setBridgeOnline]       = useState<boolean | null>(null);
    const [bridgePrinters,     setBridgePrinters]     = useState<Array<{ name: string; isDefault: boolean; isVirtual: boolean }>>([]);
    const [, setKotPrinterName]  = useState<string | null>(null);
    const [, setBillPrinterName] = useState<string | null>(null);
    const [savingPrinter,      setSavingPrinter]      = useState(false);
    // Local bridge config (role → printer name assignments stored on the PC)
    const [bridgeRoles,        setBridgeRoles]        = useState<{ kot: string | null; bill: string | null; admin: string | null }>({ kot: null, bill: null, admin: null });
    const [autoStartEnabled,   setAutoStartEnabled]   = useState<boolean | null>(null);
    const [testPrinting,       setTestPrinting]       = useState<string | null>(null); // role being test-printed
    // Per-role printer status from bridge GET /status
    const [roleStatus,         setRoleStatus]         = useState<Record<string, { state: string; printerName: string | null; lastError?: string | null }>>({});
    // Bridge auth token — fetched from GET /status; required on mutating endpoints.
    const bridgeTokenRef = useRef<string>('');

    // ── Load site data from active site context ───────────────────────────────
    useEffect(() => {
        if (!activeSite) return;
        setLoading(true);
        supabase
            .from('sites')
            .select('id, slug, name, contact_number, timing, location, pincode, business_type, kot_mode, kot_printer_name, bill_printer_name, whatsapp_order_taking, whatsapp_order_number, currency_code, menu_theme, menu_font, primary_color')
            .eq('id', activeSite.id)
            .single()
            .then(({ data, error }) => {
                if (error) { toast.error('Failed to load settings'); setLoading(false); return; }
                if (data) {
                    setSiteId(data.id);
                    setSiteSlug(data.slug ?? '');
                    const row = data as Record<string, unknown>;
                    setForm({
                        businessName: data.name ?? '',
                        // Seeded below from the OTP-verified sign-in number if
                        // this store has never had one saved.
                        phoneNumber: data.contact_number ?? '',
                        location: (row.location as string | null) ?? '',
                        pincode: (row.pincode as string | null) ?? '',
                        // sites.business_type, NOT sites.type — the latter is
                        // the Shop/Menu discriminator printed on the QR poster.
                        businessType: isBusinessType(row.business_type) ? (row.business_type as string) : '',
                    });
                    const storedTiming = (data.timing as string | null) ?? '';
                    setRawTiming(storedTiming);
                    setTiming(parseTiming(storedTiming));
                    // The owner verified a number by OTP minutes ago. Asking
                    // for it again is asking a question we already know the
                    // answer to — so seed it, but only when nothing is stored:
                    // a shop's published number is often the counter landline,
                    // not the owner's personal phone, and overwriting a saved
                    // one would be a silent edit.
                    if (!data.contact_number && user?.phoneNumber) {
                        setForm(f => ({ ...f, phoneNumber: user.phoneNumber ?? '' }));
                    }
                    {
                        // Newer columns are not on the hand-written Shop type, so
                        // they come through the same Record cast the rest of this
                        // page uses. Each falls back to the shipped default rather
                        // than to undefined — a store row written before 052 must
                        // render Classic, not a blank picker.
                        const d = data as Record<string, unknown>;
                        // The design swatches must preview the owner's OWN menu.
                        // Two names is all a swatch shows, so this stays a tiny
                        // query on a settings screen rather than a menu fetch.
                        supabase
                            .from('products')
                            .select('name, selling_price')
                            .eq('site_id', activeSite.id)
                            .order('display_order')
                            .limit(2)
                            .then(({ data: rows }) => {
                                if (rows?.length) {
                                    setDishNames(rows.map(r => String(r.name)));
                                    setDishPrices(rows.map(r => Number(r.selling_price) || 0));
                                }
                            });
                        setAppearance({
                            menu_theme: isMenuThemeId(d.menu_theme) ? d.menu_theme : DEFAULT_MENU_THEME,
                            menu_font: isFontPairId(d.menu_font) ? d.menu_font : DEFAULT_FONT_PAIR,
                            primary_color: isHexColor(d.primary_color)
                                ? d.primary_color
                                : MENU_THEMES[DEFAULT_MENU_THEME].accent,
                        });
                    }
                    setKotModeState((data.kot_mode as 'manual' | 'automatic') ?? 'manual');
                    setKotModeLoaded(true);
                    setKotPrinterName((data as Record<string, unknown>).kot_printer_name as string | null ?? null);
                    setBillPrinterName((data as Record<string, unknown>).bill_printer_name as string | null ?? null);
                    const d = data as Record<string, unknown>;
                    setWhatsappEnabled(d.whatsapp_order_taking === true);
                    setWhatsappNumber((d.whatsapp_order_number as string | null) ?? '');
                    setCurrencyCode((d.currency_code === 'AED' ? 'AED' : 'INR'));
                    try {
                        setKotDevMode(localStorage.getItem('kot_dev_mode') === '1');
                    } catch { /* ignore */ }
                }
                setLoading(false);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloads only on store switch; user is read once for the phone seed.
    }, [activeSite]);

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!siteId) return;
        if (!form.businessName.trim()) { toast.error('Business name is required'); return; }
        if (!isValidPincode(form.pincode)) { toast.error('Enter a valid 6-digit PIN code'); return; }

        const pickedTiming = formatTiming(timing);

        setSaving(true);
        const { error } = await supabase
            .from('sites')
            .update({
                name: form.businessName.trim(),
                contact_number: form.phoneNumber.trim() || null,
                location: form.location.trim() || null,
                pincode: form.pincode.trim() || null,
                business_type: form.businessType || null,
                // Only overwrite hours the picker can actually express. An
                // owner whose stored value is old free text and who did not
                // touch the picker keeps what they published.
                timing: pickedTiming || rawTiming || null,
            })
            .eq('id', siteId);

        setSaving(false);
        if (error) { toast.error('Failed to save changes'); }
        else {
            setRawTiming(pickedTiming || rawTiming);
            toast.success('Settings saved');
            refreshSites();
            refreshPublicMenu(siteId);
        }
    };

    // ── KOT mode toggle ───────────────────────────────────────────────────────
    const handleKotModeChange = async (newMode: 'manual' | 'automatic') => {
        if (newMode === kotMode || !siteId || kotModeUpdating) return;
        const confirmMsg = newMode === 'automatic'
            ? 'Switch to Automatic? New orders will print immediately on the KOT Station device.'
            : 'Switch to Manual? You must click KOT for each order.';
        if (!confirm(confirmMsg)) return;

        setKotModeUpdating(true);
        try {
            const token = await import('@/lib/auth/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
            if (!token) return;
            const res = await fetch(`/api/manage/sites/${siteId}/kot-mode`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ kot_mode: newMode }),
            });
            if (res.ok) {
                setKotModeState(newMode);
                toast.success(`KOT mode set to ${newMode}`);
            } else {
                toast.error('Failed to update KOT mode');
            }
        } catch {
            toast.error('Failed to update KOT mode');
        } finally {
            setKotModeUpdating(false);
        }
    };

    // ── Razorpay OAuth handlers ───────────────────────────────────────────────
    // Quiet refresh = update state without flashing the loading skeleton.
    // Used by the 20s poller + tab-visibility refresh so the UI doesn't blink.
    const loadRzpStatus = async (sid: string, quiet = false) => {
        // Razorpay Connect is an ordering feature. While ORDERING_FROZEN the
        // route answers 403 FEATURE_FROZEN, so asking is pure console/Sentry
        // noise — on mount, every 20s, and on every tab focus. Report the
        // not-connected state the UI already renders and make no request.
        if (ORDERING_FROZEN) {
            setRzpStatus({ connected: false, health: 'not_connected' });
            if (!quiet) setRzpStatusLoading(false);
            return;
        }
        if (!quiet) setRzpStatusLoading(true);
        try {
            const token = await import('@/lib/auth/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
            if (!token) return;
            const res = await fetch(`/api/manage/payments/razorpay/status?siteId=${sid}`, {
                headers: { Authorization: `Bearer ${token}` },
                cache:   'no-store',
            });
            if (res.ok) setRzpStatus(await res.json());
            else setRzpStatus({ connected: false, health: 'not_connected' });
        } catch {
            // Network blips: don't clobber existing status, just retry on next poll.
            if (!quiet) setRzpStatus({ connected: false, health: 'not_connected' });
        } finally {
            if (!quiet) setRzpStatusLoading(false);
        }
    };

    // Initial load + live polling. Polls every 20s while the tab is visible,
    // refreshes immediately when the tab regains focus. This catches:
    //   - Razorpay revoking the integration via webhook
    //   - Token auto-refresh extending the expiry
    //   - Manual changes by another admin on the same site
    useEffect(() => {
        if (!siteId) return;
        loadRzpStatus(siteId);
        // Nothing can change while frozen, so no interval and no focus listener.
        if (ORDERING_FROZEN) return;
        const intervalId = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                loadRzpStatus(siteId, true);
            }
        }, 20_000);
        const onVisibility = () => {
            if (document.visibilityState === 'visible') loadRzpStatus(siteId, true);
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [siteId]);

    // ── GST profile load ──────────────────────────────────────────────────────
    const loadGstProfile = async (sid: string) => {
        setGstLoading(true);
        try {
            const token = await import('@/lib/auth/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
            if (!token) return;
            const res = await fetch(`/api/manage/sites/${sid}/gst`, {
                headers: { Authorization: `Bearer ${token}` },
                cache:   'no-store',
            });
            if (res.ok) setGstProfile(await res.json());
            else setGstProfile(null);
        } catch {
            setGstProfile(null);
        } finally {
            setGstLoading(false);
        }
    };
    useEffect(() => {
        if (!siteId) return;
        loadGstProfile(siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteId]);

    const saveWhatsapp = async (enabled: boolean, number: string) => {
        if (!siteId || whatsappSaving) return;
        setWhatsappSaving(true);
        try {
            const token = await import('@/lib/auth/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
            if (!token) return;
            const res = await fetch(`/api/manage/sites/${siteId}/whatsapp-orders`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ enabled, whatsapp_number: number }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(data.error ?? 'Failed to save'); return; }
            setWhatsappEnabled(data.whatsapp_order_taking);
            setWhatsappNumber(data.whatsapp_order_number ?? '');
            toast.success(enabled ? 'WhatsApp ordering enabled' : 'WhatsApp ordering disabled');
        } finally {
            setWhatsappSaving(false);
        }
    };

    const saveCurrency = async (code: 'INR' | 'AED') => {
        if (!siteId || currencySaving || code === currencyCode) return;
        setCurrencySaving(true);
        try {
            const token = await import('@/lib/auth/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
            if (!token) return;
            const res = await fetch(`/api/manage/sites/${siteId}/currency`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ currency_code: code }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(data.error ?? 'Failed to switch currency'); return; }
            setCurrencyCode(data.currency_code);
            toast.success(`Currency set to ${code}`);
        } finally {
            setCurrencySaving(false);
        }
    };

    const handleEditGst = async () => {
        if (!siteId || gstResetting) return;
        if (!confirm('Edit your GST setup? Your current GSTIN and rate will be cleared and you\'ll go through the wizard again. Past orders keep their original GST.')) return;
        setGstResetting(true);
        try {
            const token = await import('@/lib/auth/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
            if (!token) return;
            const res = await fetch(`/api/manage/sites/${siteId}/gst/reset`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) { toast.error('Failed to reset GST profile'); return; }
            await loadGstProfile(siteId);
            setGstWizardOpen(true);
        } finally {
            setGstResetting(false);
        }
    };

    // Show banner from OAuth callback redirect query params (?connected=1 | ?error=…).
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('tab') !== 'payments') return;
        if (params.get('connected') === '1') {
            setRzpBanner({ kind: 'success', text: 'Razorpay account connected successfully.' });
        } else if (params.get('error')) {
            const map: Record<string, string> = {
                state_mismatch:        'Security check failed. Please try connecting again.',
                state_not_found:       'Connection link expired. Please try again.',
                state_expired:         'Connection link expired. Please try again.',
                token_exchange_failed: 'Razorpay rejected the authorization. Please try again.',
                persist_failed:        'Could not save your tokens. Please contact support.',
                missing_code_or_state: 'Razorpay did not return a valid code.',
                no_account_id:         'Razorpay did not return an account id.',
            };
            const code = params.get('error') ?? '';
            setRzpBanner({ kind: 'error', text: map[code] ?? `Connection failed (${code}).` });
        }
        // Strip the query params so a refresh doesn't re-show the banner.
        if (params.get('connected') || params.get('error')) {
            const clean = new URL(window.location.href);
            clean.searchParams.delete('connected');
            clean.searchParams.delete('error');
            clean.searchParams.delete('tab');
            window.history.replaceState({}, '', clean.toString());
        }
    }, []);

    const handleConnectRazorpay = async () => {
        if (!siteId) return;
        setRzpBusy('connect');
        try {
            const token = await import('@/lib/auth/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
            if (!token) { toast.error('Please sign in again'); return; }
            const res = await fetch('/api/manage/payments/razorpay/connect', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId }),
            });
            const data = await res.json();
            if (!res.ok || !data.url) {
                toast.error(data.error ?? 'Could not start Razorpay connection');
                return;
            }
            window.location.href = data.url;
        } catch {
            toast.error('Could not start Razorpay connection');
        } finally {
            setRzpBusy(null);
        }
    };

    const handleDisconnectRazorpay = async () => {
        if (!siteId) return;
        if (!confirm('Disconnect Razorpay? Online payments will be disabled until you reconnect.')) return;
        setRzpBusy('disconnect');
        try {
            const token = await import('@/lib/auth/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
            if (!token) return;
            const res = await fetch('/api/manage/payments/razorpay/disconnect', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ siteId }),
            });
            if (res.ok) {
                toast.success('Razorpay disconnected');
                setRzpBanner(null);
                await loadRzpStatus(siteId);
            } else {
                toast.error('Failed to disconnect');
            }
        } finally {
            setRzpBusy(null);
        }
    };

    // "Change account" — atomic-ish: revoke the current account's tokens with
    // Razorpay, then immediately kick off the OAuth flow for a new account.
    // The admin should sign into the *new* Razorpay account when redirected.
    const handleChangeRazorpay = async () => {
        if (!siteId) return;
        const ok = confirm(
            'Switch to a different Razorpay account?\n\n' +
            'Your current account will be disconnected, then you\'ll be redirected to Razorpay to sign in with the new account.\n\n' +
            'Avoid doing this while customers are mid-checkout — any in-flight payments may need a manual refund.',
        );
        if (!ok) return;

        setRzpBusy('change');
        try {
            const token = await import('@/lib/auth/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
            if (!token) { toast.error('Please sign in again'); return; }

            // 1. Revoke current account.
            const dRes = await fetch('/api/manage/payments/razorpay/disconnect', {
                method:  'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ siteId }),
            });
            if (!dRes.ok && dRes.status !== 200) {
                const d = await dRes.json().catch(() => ({}));
                toast.error(d.error ?? 'Could not disconnect the current account');
                return;
            }

            // 2. Immediately start OAuth for the new account.
            const cRes = await fetch('/api/manage/payments/razorpay/connect', {
                method:  'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body:    JSON.stringify({ siteId }),
            });
            const cData = await cRes.json();
            if (!cRes.ok || !cData.url) {
                toast.error(cData.error ?? 'Could not start the new connection');
                await loadRzpStatus(siteId); // status will now show disconnected
                return;
            }
            window.location.href = cData.url;
        } catch {
            toast.error('Could not switch Razorpay accounts');
            await loadRzpStatus(siteId);
        } finally {
            setRzpBusy(null);
        }
    };

    const toggleKotDevMode = () => {
        const next = !kotDevMode;
        try { localStorage.setItem('kot_dev_mode', next ? '1' : '0'); } catch { /* ignore */ }
        setKotDevMode(next);
        toast.success(next ? 'KOT dev mode on — toasts instead of printing' : 'KOT dev mode off');
    };

    // ── Poll local print bridge every 8 s ─────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        const poll = async () => {
            try {
                const [printersRes, statusRes] = await Promise.all([
                    fetch(`${BRIDGE_URL}/printers`, { signal: AbortSignal.timeout(3000) }),
                    fetch(`${BRIDGE_URL}/status`,   { signal: AbortSignal.timeout(3000) }),
                ]);
                if (!printersRes.ok) throw new Error('not ok');
                const { printers } = await printersRes.json();
                if (!cancelled) { setBridgeOnline(true); setBridgePrinters(printers ?? []); }
                if (statusRes.ok) {
                    const status = await statusRes.json();
                    if (!cancelled) {
                        const cfg = status.config ?? {};
                        setBridgeRoles({ kot: cfg.roles?.kot ?? null, bill: cfg.roles?.bill ?? null, admin: cfg.roles?.admin ?? null });
                        setAutoStartEnabled(status.autoStart ?? null);
                        setRoleStatus(status.roleStatus ?? {});
                        // Capture the bridge auth token so mutating calls can authenticate.
                        if (cfg.token && typeof cfg.token === 'string') bridgeTokenRef.current = cfg.token;
                    }
                }
            } catch {
                if (!cancelled) { setBridgeOnline(false); setBridgePrinters([]); }
            }
        };
        poll();
        const id = setInterval(poll, 8000);
        return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const savePrinterAssignment = async (field: 'kot' | 'bill', printerName: string | null) => {
        if (!siteId) return;
        setSavingPrinter(true);
        try {
            // 1. Save to local bridge config (source of truth for routing)
            const bridgeRes = await fetch(`${BRIDGE_URL}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-BYS-Token': bridgeTokenRef.current },
                body: JSON.stringify({ roles: { [field]: printerName } }),
                signal: AbortSignal.timeout(4000),
            });
            if (!bridgeRes.ok) throw new Error('Bridge config save failed');
            const { config: newConfig } = await bridgeRes.json();
            setBridgeRoles({ kot: newConfig.roles?.kot ?? null, bill: newConfig.roles?.bill ?? null, admin: newConfig.roles?.admin ?? null });

            // 2. Mirror to cloud DB (display cache only — not used for routing)
            const token = await import('@/lib/auth/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
            if (token) {
                const body = field === 'kot'
                    ? { kot_printer_name: printerName }
                    : { bill_printer_name: printerName };
                await fetch(`/api/manage/sites/${siteId}/printer-settings`, {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                }).catch(() => { /* non-fatal — local config already saved */ });
            }

            if (field === 'kot')  setKotPrinterName(printerName);
            else                  setBillPrinterName(printerName);
            const label = field === 'kot' ? 'KOT' : 'Bill';
            toast.success(printerName ? `${label} printer set to "${printerName}"` : `${label} printer cleared`);
        } catch {
            toast.error('Could not save — is the Print Bridge running?');
        } finally {
            setSavingPrinter(false);
        }
    };

    const testPrint = async (role: 'kot' | 'bill') => {
        const printerName = bridgeRoles[role];
        if (!printerName) { toast.error(`No ${role.toUpperCase()} printer assigned`); return; }
        setTestPrinting(role);
        try {
            const res = await fetch(`${BRIDGE_URL}/test-print`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-BYS-Token': bridgeTokenRef.current },
                body: JSON.stringify({ printerName, type: role }),
                signal: AbortSignal.timeout(15000),
            });
            if (res.ok) toast.success(`Test print sent to "${printerName}"`);
            else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.error || 'Test print failed');
            }
        } catch {
            toast.error('Bridge unreachable — is it running?');
        } finally {
            setTestPrinting(null);
        }
    };

    const toggleAutoStart = async () => {
        const endpoint = autoStartEnabled ? '/autostart/disable' : '/autostart/enable';
        try {
            const res = await fetch(`${BRIDGE_URL}${endpoint}`, { method: 'POST', headers: { 'X-BYS-Token': bridgeTokenRef.current }, signal: AbortSignal.timeout(5000) });
            if (res.ok) {
                const { registered } = await res.json();
                setAutoStartEnabled(registered);
                toast.success(registered ? 'Auto-start enabled — bridge will launch on Windows login' : 'Auto-start disabled');
            } else {
                toast.error('Failed to update auto-start');
            }
        } catch {
            toast.error('Bridge unreachable — is it running?');
        }
    };

    // ── Delete store ──────────────────────────────────────────────────────────
    const handleDeleteStore = async () => {
        if (!siteId || deleting) return;
        setDeleting(true);

        try {
            // Archive + delete lives in one place, shared with the phone Store details screen.
            const { remaining } = await deleteStore(siteId, user?.id ?? '');
            toast.success('Store deleted successfully');
            setDeleteModalOpen(false);
            await refreshSites();
            router.replace(remaining > 0 ? '/manage/dashboard' : '/onboarding?intent=first-store');
        } catch (err) {
            console.error('Delete store error:', err);
            toast.error('Failed to delete store');
            setDeleting(false);
        }
    };

    const storeName = form.businessName || activeSite?.name || '';
    const deleteConfirmMatch = deleteConfirmText.trim().toLowerCase() === storeName.trim().toLowerCase();

    const inputStyle: React.CSSProperties = {
        width: '100%', border: '1px solid #E4E4E7', borderRadius: 8, padding: '10px 14px',
        fontSize: 14, fontWeight: 400, color: '#0A0A0A', lineHeight: '20px', outline: 'none', background: '#FFFFFF',
    };
    const labelStyle: React.CSSProperties = {
        fontSize: 14, fontWeight: 500, color: '#0A0A0A', lineHeight: '20px', marginBottom: 6, display: 'block',
    };
    const hintStyle: React.CSSProperties = {
        fontSize: 12, lineHeight: '18px', color: '#71717A', marginTop: 6,
    };

    // Only ever wrong once something has been typed — an empty box on arrival
    // is an unanswered optional question, not an error.
    const pincodeInvalid = form.pincode.length > 0 && !isValidPincode(form.pincode);
    // Stored hours the picker cannot express: free text from the old box.
    const legacyTiming = rawTiming.trim() !== '' && !timing.open247
        && timing.opensAt === null && timing.closesAt === null;

    if (loading) {
        return (
            <SectionLoader message="Loading your store settings" minHeight={280} />
        );
    }

    return (
        <div className="px-4 md:px-8 py-6 md:py-8 max-w-2xl">

            {/* Mobile-only quick nav.
                qr_menu plan already has QR & Banners in the bottom tab bar, and
                Transactions is gated — so only show Subscription here. */}
            <div className="lg:hidden mb-5 rounded-xl overflow-hidden" style={{ border: '1px solid #E4E4E7' }}>
                {(qrMenuOnly
                    ? [
                        { label: 'Subscription', icon: 'workspace_premium', href: '/manage/subscription', desc: 'Manage your plan' },
                      ]
                    : [
                        { label: 'QR Code & Poster',  icon: 'qr_code_2',         href: '/manage/qr',                desc: 'Download your menu QR code' },
                        { label: 'Banner Management', icon: 'image',             href: '/manage/banner-management', desc: 'Manage your store banners' },
                        { label: 'Transactions',       icon: 'credit_card',       href: '/manage/transactions',      desc: 'View payment history' },
                        { label: 'Subscription',       icon: 'workspace_premium', href: '/manage/subscription',      desc: 'Manage your plan' },
                      ]
                ).map((item, idx, arr) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#FFFFFF', textDecoration: 'none', borderBottom: idx < arr.length - 1 ? '1px solid #E4E4E7' : 'none' }}
                    >
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#5137EF' }}>{item.icon}</span>
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A', lineHeight: '20px' }}>{item.label}</p>
                            <p style={{ fontSize: 12, color: '#71717A', lineHeight: '16px' }}>{item.desc}</p>
                        </div>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#99A1AF' }}>chevron_right</span>
                    </Link>
                ))}
                {/* Sign Out — hidden for qr_menu plan (Subscription only) */}
                {!qrMenuOnly && (
                    <div style={{ borderTop: '1px solid #E4E4E7' }}>
                        <button
                            onClick={handleSignOut}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#FFFFFF', width: '100%', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                        >
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#E7000B' }}>logout</span>
                            </div>
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 14, fontWeight: 500, color: '#E7000B', lineHeight: '20px' }}>Sign Out</p>
                                <p style={{ fontSize: 12, color: '#71717A', lineHeight: '16px' }}>Sign out of your account</p>
                            </div>
                        </button>
                    </div>
                )}
            </div>

            {/* Page header — breadcrumb + horizontal tab nav */}
            {(() => {
                const ALL_TABS: Array<{ id: TabId; label: string; show?: boolean }> = [
                    { id: 'store',      label: 'Store details' },
                    { id: 'appearance', label: 'Menu design' },
                    { id: 'printing',   label: 'Printing' },
                    { id: 'payments', label: 'Payments' },
                    { id: 'gst',      label: 'GST details' },
                    { id: 'orders',   label: 'Order taking' },
                    { id: 'danger',   label: 'Danger zone' },
                ];
                // qr_menu / base plan: profile, menu design, danger zone.
                // 'appearance' MUST be in this list — while ORDERING_FROZEN every
                // store normalizes to qr_menu, so anything missing here is a tab
                // no current customer can ever reach.
                const TABS = qrMenuOnly
                    ? ALL_TABS.filter(t => t.id === 'store' || t.id === 'appearance' || t.id === 'danger')
                    : ALL_TABS;
                const activeLabel = TABS.find(t => t.id === activeTab)?.label ?? '';
                return (
                    <>
                        {/* Breadcrumb */}
                        <div className="mb-3 flex items-center gap-2" style={{ fontSize: 14 }}>
                            <button
                                onClick={() => router.push('/manage/dashboard')}
                                aria-label="Back to dashboard"
                                className="hover:bg-[#F4F4F5] transition-colors"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, padding: 0, color: '#52525C' }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                            </button>
                            <span style={{ color: '#52525C', fontWeight: 500 }}>Account &amp; Settings</span>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#A1A1AA' }}>chevron_right</span>
                            <span style={{ color: '#5137EF', fontWeight: 500 }}>{activeLabel}</span>
                        </div>

                        {/* Horizontal tab bar */}
                        <div
                            className="mb-6 -mx-4 md:-mx-8 px-4 md:px-8"
                            style={{ borderBottom: '1px solid #E4E4E7', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
                        >
                            <div role="tablist" aria-label="Settings sections" style={{ display: 'flex', gap: 28, whiteSpace: 'nowrap' }}>
                                {TABS.map(t => {
                                    const selected = activeTab === t.id;
                                    return (
                                        <button
                                            key={t.id}
                                            role="tab"
                                            aria-selected={selected}
                                            onClick={() => setActiveTab(t.id)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                padding: '12px 0',
                                                fontSize: 14,
                                                fontWeight: selected ? 600 : 500,
                                                color: selected ? '#0A0A0A' : '#71717A',
                                                cursor: 'pointer',
                                                borderBottom: selected ? '2px solid #0A0A0A' : '2px solid transparent',
                                                marginBottom: -1,
                                                transition: 'color 0.15s, border-color 0.15s',
                                            }}
                                        >
                                            {t.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                );
            })()}

            {/* Hidden — preserved for the existing layout container width */}
            <div className="mb-6 hidden">
                <h1 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 30, lineHeight: '36px' }}>Settings</h1>
                <p className="text-[#52525C] mt-1" style={{ fontSize: 16, fontWeight: 400, lineHeight: '24px' }}>
                    Update your store details
                </p>
            </div>

            {/* Store Details card */}
            {activeTab === 'store' && (
            <div className="bg-white" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '24px', marginBottom: 24 }}>
                <h2 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, lineHeight: '28px', marginBottom: 20 }}>
                    Store Details
                </h2>

                <div className="flex flex-col gap-5">
                    <div>
                        <label htmlFor="settings-business-name" style={labelStyle}>Business Name <span style={{ color: '#E7000B' }}>*</span></label>
                        <input type="text" value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} style={inputStyle} id="settings-business-name" placeholder="e.g. Cream Story" disabled={saving} />
                    </div>
                    <div>
                        <label htmlFor="settings-mobile" style={labelStyle}>Mobile Number</label>
                        <input
                            type="tel"
                            inputMode="tel"
                            value={form.phoneNumber}
                            onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))}
                            style={inputStyle}
                            id="settings-mobile"
                            placeholder="+91 9876543210"
                            disabled={saving}
                        />
                        <p style={hintStyle}>
                            Filled in from the number you signed in with. Change it if customers should call a different one.
                        </p>
                    </div>

                    {/* Where the store is. Two fields, one row on desktop —
                        they are answered together and reading them apart makes
                        the PIN look like a second, unrelated question. */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div style={{ flex: 2 }}>
                            <label htmlFor="settings-location" style={labelStyle}>Location</label>
                            <input
                                type="text"
                                value={form.location}
                                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                                style={inputStyle}
                                id="settings-location"
                                placeholder="e.g. Anna Nagar, Madurai"
                                disabled={saving}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label htmlFor="settings-pincode" style={labelStyle}>PIN Code</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={form.pincode}
                                // Digits only at the keystroke, so the error
                                // state below can only ever mean "too short" —
                                // one rule for the owner to work out, not two.
                                onChange={e => setForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                                style={{ ...inputStyle, border: pincodeInvalid ? '1px solid #E7000B' : '1px solid #E4E4E7' }}
                                id="settings-pincode"
                                placeholder="625001"
                                aria-invalid={pincodeInvalid}
                                disabled={saving}
                            />
                            {pincodeInvalid && (
                                <p style={{ ...hintStyle, color: '#E7000B' }}>Enter all 6 digits.</p>
                            )}
                        </div>
                    </div>

                    {/* Business type — five chips, not a dropdown. A dropdown
                        is a field an owner scrolls past. */}
                    <div>
                        <label style={labelStyle}>Business Type</label>
                        <div className="flex flex-wrap gap-2">
                            {BUSINESS_TYPES.map(type => {
                                const selected = form.businessType === type.id;
                                return (
                                    <button
                                        key={type.id}
                                        type="button"
                                        aria-pressed={selected}
                                        disabled={saving}
                                        // Tapping the current choice clears it.
                                        // The field is optional and a chip row
                                        // with no other way out traps the first
                                        // owner who taps the wrong one.
                                        onClick={() => setForm(f => ({ ...f, businessType: selected ? '' : type.id }))}
                                        className="flex items-center gap-1.5 transition-colors disabled:opacity-60"
                                        style={{
                                            border: selected ? '1.5px solid #5137EF' : '1px solid #E4E4E7',
                                            background: selected ? '#F1EEFE' : '#FFFFFF',
                                            color: selected ? '#5137EF' : '#3F3F46',
                                            borderRadius: 999,
                                            padding: '9px 14px',
                                            fontSize: 13,
                                            fontWeight: 500,
                                            minHeight: 42,
                                            cursor: saving ? 'wait' : 'pointer',
                                        }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{type.icon}</span>
                                        {type.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Opening hours — tapped, never typed. The free-text box
                        this replaces collected "9-11", "morning to night" and
                        mostly nothing, none of which reads on a menu header. */}
                    <div>
                        <label style={labelStyle}>Opening Hours</label>
                        <button
                            type="button"
                            aria-pressed={timing.open247}
                            disabled={saving}
                            onClick={() => setTiming(t => ({ ...t, open247: !t.open247 }))}
                            className="flex items-center gap-1.5 transition-colors disabled:opacity-60"
                            style={{
                                border: timing.open247 ? '1.5px solid #5137EF' : '1px solid #E4E4E7',
                                background: timing.open247 ? '#F1EEFE' : '#FFFFFF',
                                color: timing.open247 ? '#5137EF' : '#3F3F46',
                                borderRadius: 999, padding: '9px 14px', fontSize: 13,
                                fontWeight: 500, minHeight: 42, marginBottom: 12,
                                cursor: saving ? 'wait' : 'pointer',
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>schedule</span>
                            Open 24 hours
                        </button>

                        {!timing.open247 && (
                            <div className="flex items-center gap-3">
                                <select
                                    value={timing.opensAt ?? ''}
                                    onChange={e => setTiming(t => ({ ...t, opensAt: e.target.value || null }))}
                                    style={{ ...inputStyle, flex: 1 }}
                                    aria-label="Opening time"
                                    disabled={saving}
                                >
                                    <option value="">Opens at…</option>
                                    {TIME_SLOTS.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                                </select>
                                <span style={{ fontSize: 13, color: '#71717A' }}>to</span>
                                <select
                                    value={timing.closesAt ?? ''}
                                    onChange={e => setTiming(t => ({ ...t, closesAt: e.target.value || null }))}
                                    style={{ ...inputStyle, flex: 1 }}
                                    aria-label="Closing time"
                                    disabled={saving}
                                >
                                    <option value="">Closes at…</option>
                                    {TIME_SLOTS.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                                </select>
                            </div>
                        )}

                        {legacyTiming && (
                            // Their published hours are free text from the old
                            // box. Say so rather than silently showing an empty
                            // picker that looks like the hours were lost.
                            <p style={hintStyle}>
                                Currently showing “{rawTiming}”. Pick times above to replace it.
                            </p>
                        )}
                    </div>
                </div>

                {/* Save button */}
                <div className="mt-6 flex justify-stretch md:justify-end">
                    <button onClick={handleSave} disabled={saving} className="flex w-full md:w-auto items-center justify-center gap-2 text-white transition-opacity hover:opacity-90 disabled:opacity-60" style={{ background: '#5137EF', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 500, minHeight: 46, cursor: saving ? 'wait' : 'pointer' }}>
                        {saving ? (<><Spinner size="sm" tone="onBrand" />Saving…</>) : 'Save Changes'}
                    </button>
                </div>
            </div>
            )}

            {/* ── Kitchen Printing (KOT) ── */}
            {activeTab === 'appearance' && siteId && (
                <AppearancePanel
                    siteId={siteId}
                    siteSlug={siteSlug || null}
                    dishNames={dishNames}
                    dishPrices={dishPrices}
                    value={appearance}
                    onChange={setAppearance}
                />
            )}

            {activeTab === 'printing' && kotModeLoaded && (
            <div className="bg-white" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '24px', marginBottom: 24 }}>
                <div className="flex items-start gap-3 mb-5">
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#F97316' }}>receipt_long</span>
                    </div>
                    <div>
                        <h2 className="font-semibold" style={{ fontSize: 16, lineHeight: '24px', color: '#0A0A0A' }}>Kitchen Printing (KOT)</h2>
                        <p style={{ fontSize: 13, color: '#71717A', lineHeight: '20px', marginTop: 2 }}>
                            Control how kitchen order tokens are sent when customers place orders.
                        </p>
                    </div>
                </div>

                {/* Mode toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl mb-3" style={{ background: '#FAFAFA', border: '1px solid #E4E4E7' }}>
                    <div>
                        <p className="font-medium" style={{ fontSize: 14, color: '#0A0A0A', marginBottom: 2 }}>Printing Mode</p>
                        <p style={{ fontSize: 12, color: '#71717A' }}>
                            {kotMode === 'manual' ? 'Admin clicks KOT for each order' : 'Kitchen device auto-prints on arrival'}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {(['manual', 'automatic'] as const).map(m => (
                            <button
                                key={m}
                                onClick={() => handleKotModeChange(m)}
                                disabled={kotModeUpdating}
                                style={{
                                    padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: kotModeUpdating ? 'wait' : 'pointer',
                                    border: kotMode === m ? '2px solid #5137EF' : '1px solid #E4E4E7',
                                    background: kotMode === m ? '#EEEEFF' : '#fff',
                                    color: kotMode === m ? '#5137EF' : '#52525C',
                                    textTransform: 'capitalize',
                                }}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Windows Print Bridge */}
                <div className="rounded-xl mb-3 overflow-hidden" style={{ border: '1px solid #E4E4E7' }}>
                    {/* Bridge header */}
                    <div className="flex items-center justify-between p-4" style={{ background: '#FAFAFA', borderBottom: bridgeOnline === true ? '1px solid #E4E4E7' : undefined }}>
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: bridgeOnline === true ? '#16A34A' : bridgeOnline === false ? '#DC2626' : '#99A1AF' }}>
                                {bridgeOnline === true ? 'wifi' : bridgeOnline === false ? 'wifi_off' : 'wifi'}
                            </span>
                            <div>
                                <p className="font-medium" style={{ fontSize: 14, color: '#0A0A0A' }}>
                                    Print Bridge&nbsp;
                                    <span style={{ fontSize: 12, fontWeight: 400, color: bridgeOnline === true ? '#16A34A' : bridgeOnline === false ? '#DC2626' : '#99A1AF' }}>
                                        {bridgeOnline === null ? '(checking…)' : bridgeOnline ? '● Connected' : '● Not running'}
                                    </span>
                                </p>
                                <p style={{ fontSize: 12, color: '#71717A' }}>
                                    {bridgeOnline
                                        ? `${bridgePrinters.length} printer${bridgePrinters.length !== 1 ? 's' : ''} found`
                                        : 'Download & install the bridge below (one-time setup)'}
                                </p>
                            </div>
                        </div>
                        <a
                            href={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/downloads/bys-print-bridge-setup.exe`}
                            download
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                                padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                background: '#F4F4F5', color: '#0A0A0A', textDecoration: 'none', border: '1px solid #E4E4E7',
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
                            Download Installer
                        </a>
                    </div>

                    {/* Printer assignment rows — only when bridge is online */}
                    {bridgeOnline === true && bridgePrinters.length > 0 && (
                        <div className="divide-y" style={{ borderTop: '1px solid #E4E4E7' }}>
                            {(['kot', 'bill'] as const).map((role) => {
                                const label       = role === 'kot' ? 'KOT Printer (Kitchen)' : 'Bill Printer (Counter)';
                                const icon        = role === 'kot' ? 'receipt_long' : 'print';
                                const assigned    = bridgeRoles[role]; // local bridge config is source of truth
                                const setAssigned = (name: string | null) => savePrinterAssignment(role, name);
                                const isTesting   = testPrinting === role;
                                const rs          = roleStatus[role];
                                const statusColor = !rs || rs.state === 'unknown' || rs.state === 'not_assigned' ? '#99A1AF'
                                    : rs.state === 'ready'         ? '#16A34A'
                                    : rs.state === 'incompatible'  ? '#D97706'
                                    : /* disconnected */             '#DC2626';
                                const statusLabel = !rs || rs.state === 'not_assigned' ? 'Not assigned'
                                    : rs.state === 'ready'         ? 'Ready'
                                    : rs.state === 'incompatible'  ? 'Not a thermal printer'
                                    : rs.state === 'disconnected'  ? 'Disconnected'
                                    : null;
                                return (
                                    <div key={role} className="p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#5137EF' }}>{icon}</span>
                                            <p style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>{label}</p>
                                            {statusLabel && (
                                                <span style={{ fontSize: 11, fontWeight: 500, color: statusColor, background: `${statusColor}18`, borderRadius: 4, padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                                                    {statusLabel}
                                                </span>
                                            )}
                                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                                                {assigned && (
                                                    <button
                                                        onClick={() => testPrint(role)}
                                                        disabled={isTesting || savingPrinter}
                                                        style={{ fontSize: 11, color: '#5137EF', background: '#EEEEFF', border: '1px solid #C7C2F8', borderRadius: 6, cursor: 'pointer', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{isTesting ? 'hourglass_empty' : 'print'}</span>
                                                        {isTesting ? 'Printing…' : 'Test'}
                                                    </button>
                                                )}
                                                {assigned && (
                                                    <button
                                                        onClick={() => setAssigned(null)}
                                                        disabled={savingPrinter}
                                                        style={{ fontSize: 11, color: '#71717A', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {bridgePrinters.map((p) => (
                                                <button
                                                    key={p.name}
                                                    onClick={() => !p.isVirtual && setAssigned(assigned === p.name ? null : p.name)}
                                                    disabled={savingPrinter || p.isVirtual}
                                                    title={p.isVirtual ? 'Virtual printers cannot print ESC/POS receipts — connect a real thermal printer' : undefined}
                                                    className="flex items-center gap-3 text-left transition-colors"
                                                    style={{
                                                        padding: '8px 12px', borderRadius: 8, fontSize: 13,
                                                        border: assigned === p.name ? '2px solid #5137EF' : '1px solid #E4E4E7',
                                                        background: assigned === p.name ? '#EEEEFF' : p.isVirtual ? '#FAFAFA' : '#fff',
                                                        color: p.isVirtual ? '#99A1AF' : '#0A0A0A',
                                                        cursor: savingPrinter || p.isVirtual ? 'not-allowed' : 'pointer',
                                                        opacity: p.isVirtual ? 0.7 : 1,
                                                    }}
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: p.isVirtual ? '#D97706' : assigned === p.name ? '#5137EF' : '#99A1AF' }}>
                                                        {p.isVirtual ? 'computer' : assigned === p.name ? 'radio_button_checked' : 'radio_button_unchecked'}
                                                    </span>
                                                    <span style={{ flex: 1 }}>{p.name}</span>
                                                    {p.isVirtual && (
                                                        <span style={{ fontSize: 10, color: '#D97706', background: '#FEF3C7', borderRadius: 4, padding: '2px 6px' }}>Virtual — not compatible</span>
                                                    )}
                                                    {!p.isVirtual && p.isDefault && (
                                                        <span style={{ fontSize: 10, color: '#71717A', background: '#F4F4F5', borderRadius: 4, padding: '2px 6px' }}>Default</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                            {/* Auto-start toggle */}
                            <div className="flex items-center justify-between p-4">
                                <div>
                                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', marginBottom: 2 }}>Auto-start on Windows Login</p>
                                    <p style={{ fontSize: 12, color: '#71717A' }}>
                                        Bridge launches automatically when admin logs in — no daily manual setup needed.
                                    </p>
                                </div>
                                <button
                                    onClick={toggleAutoStart}
                                    disabled={autoStartEnabled === null}
                                    style={{
                                        padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                                        border: autoStartEnabled ? '2px solid #5137EF' : '1px solid #E4E4E7',
                                        background: autoStartEnabled ? '#EEEEFF' : '#fff',
                                        color: autoStartEnabled ? '#5137EF' : '#52525C',
                                    }}
                                >
                                    {autoStartEnabled === null ? '…' : autoStartEnabled ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* No printers found message */}
                    {bridgeOnline === true && bridgePrinters.length === 0 && (
                        <div className="p-4 text-center" style={{ color: '#71717A', fontSize: 13 }}>
                            No printers found. Make sure printers are installed in Windows &gt; Devices and Printers.
                        </div>
                    )}
                </div>

                {/* Dev / test mode */}
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: '#FAFAFA', border: '1px solid #E4E4E7' }}>
                    <div>
                        <p className="font-medium" style={{ fontSize: 14, color: '#0A0A0A', marginBottom: 2 }}>Show Toast Instead of Printing</p>
                        <p style={{ fontSize: 12, color: '#71717A' }}>
                            For testing — shows a notification instead of sending to printer.
                        </p>
                    </div>
                    <button
                        onClick={toggleKotDevMode}
                        style={{
                            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            border: kotDevMode ? '2px solid #5137EF' : '1px solid #E4E4E7',
                            background: kotDevMode ? '#EEEEFF' : '#fff',
                            color: kotDevMode ? '#5137EF' : '#52525C',
                        }}
                    >
                        {kotDevMode ? 'On' : 'Off'}
                    </button>
                </div>
            </div>
            )}

            {/* ── Payments (Razorpay OAuth) ── */}
            {activeTab === 'payments' && (
            <div className="bg-white" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '24px', marginBottom: 24 }}>
                <div className="flex items-start gap-3 mb-5">
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#2563EB' }}>credit_card</span>
                    </div>
                    <div>
                        <h2 className="font-semibold" style={{ fontSize: 16, lineHeight: '24px', color: '#0A0A0A' }}>Online Payments (Razorpay)</h2>
                        <p style={{ fontSize: 13, color: '#71717A', lineHeight: '20px', marginTop: 2 }}>
                            Connect your Razorpay account so customer payments go directly to you. The platform takes no commission.
                        </p>
                    </div>
                </div>

                {rzpBanner && (
                    <div
                        style={{
                            padding: '10px 14px',
                            borderRadius: 8,
                            marginBottom: 16,
                            fontSize: 13,
                            background: rzpBanner.kind === 'success' ? '#ECFDF5' : '#FEF2F2',
                            color:      rzpBanner.kind === 'success' ? '#047857' : '#B91C1C',
                            border:     `1px solid ${rzpBanner.kind === 'success' ? '#A7F3D0' : '#FECACA'}`,
                        }}
                    >
                        {rzpBanner.text}
                    </div>
                )}

                {/* ── Live status card ────────────────────────────────────────── */}
                {(() => {
                    // Single source of truth for the colored health pill. Driven by
                    // the `health` field returned by /status (polled every 20s).
                    const health = rzpStatus?.health ?? 'not_connected';
                    const cfg = {
                        active:         { dot: '#16A34A', label: 'Connected · Working',           tone: '#065F46' },
                        expiring_soon:  { dot: '#D97706', label: `Connected · Refresh in ${rzpStatus?.expiresInDays ?? '?'}d`, tone: '#92400E' },
                        expired:        { dot: '#DC2626', label: 'Connected · Token expired',     tone: '#991B1B' },
                        revoked:        { dot: '#DC2626', label: 'Disconnected · Revoked',        tone: '#991B1B' },
                        not_connected:  { dot: '#99A1AF', label: 'Not connected',                 tone: '#3F3F46' },
                    }[health];

                    return (
                <div className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: '#FAFAFA', border: '1px solid #E4E4E7' }}>
                    {/* Top row: health pill + action buttons */}
                    <div className="flex items-start justify-between gap-3">
                        <div style={{ minWidth: 0, flex: 1 }}>
                            {rzpStatusLoading ? (
                                <p style={{ fontSize: 13, color: '#71717A' }}>Checking connection…</p>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot }} />
                                        <p style={{ fontSize: 14, fontWeight: 600, color: cfg.tone }}>{cfg.label}</p>
                                        {rzpStatus?.mode && (
                                            <span style={{
                                                fontSize: 10, fontWeight: 600,
                                                color: rzpStatus.mode === 'live' ? '#047857' : '#B45309',
                                                background: rzpStatus.mode === 'live' ? '#D1FAE5' : '#FEF3C7',
                                                borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase',
                                            }}>
                                                {rzpStatus.mode}
                                            </span>
                                        )}
                                        {/* "Live" green dot when polling confirmed a fresh status. */}
                                        {rzpStatus?.checkedAt && (
                                            <span title={`Last checked ${new Date(rzpStatus.checkedAt).toLocaleTimeString()}`}
                                                  style={{ fontSize: 10, color: '#71717A' }}>
                                                · live
                                            </span>
                                        )}
                                    </div>
                                    {rzpStatus?.accountId && (
                                        <p style={{ fontSize: 12, color: '#71717A', fontFamily: 'monospace' }}>
                                            {rzpStatus.accountId}
                                        </p>
                                    )}
                                    {!rzpStatus?.accountId && health === 'not_connected' && (
                                        <p style={{ fontSize: 12, color: '#71717A' }}>
                                            Customers won&rsquo;t see &ldquo;Pay Online&rdquo; until you connect.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="flex flex-col items-end gap-2" style={{ flexShrink: 0 }}>
                            {rzpStatus?.connected ? (
                                <>
                                    <button
                                        onClick={handleChangeRazorpay}
                                        disabled={rzpBusy !== null}
                                        style={{
                                            padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                            border: 'none', background: '#2563EB', color: '#FFFFFF',
                                            cursor: rzpBusy ? 'wait' : 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                                        }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>swap_horiz</span>
                                        {rzpBusy === 'change' ? 'Switching…' : 'Change account'}
                                    </button>
                                    <button
                                        onClick={handleDisconnectRazorpay}
                                        disabled={rzpBusy !== null}
                                        style={{
                                            padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                                            border: 'none', background: 'transparent', color: '#B91C1C',
                                            cursor: rzpBusy ? 'wait' : 'pointer', textDecoration: 'underline',
                                        }}
                                    >
                                        {rzpBusy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={handleConnectRazorpay}
                                    disabled={rzpBusy !== null || rzpStatusLoading}
                                    style={{
                                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                        border: 'none', background: '#2563EB', color: '#FFFFFF',
                                        cursor: rzpBusy ? 'wait' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                                    }}
                                >
                                    {rzpBusy === 'connect' ? 'Redirecting…' : (
                                        <>{health === 'revoked' ? 'Reconnect' : 'Connect Razorpay Account'} <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span></>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Conditional warnings — only render when something needs attention. */}
                    {health === 'expiring_soon' && (
                        <div style={{ padding: '8px 12px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 12, color: '#92400E', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>
                            We&rsquo;ll auto-refresh your token before it expires. No action needed.
                        </div>
                    )}
                    {(health === 'revoked' || health === 'expired') && (
                        <div style={{ padding: '8px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', fontSize: 12, color: '#991B1B', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                            {health === 'revoked'
                                ? 'This integration was revoked. Online payments are turned off until you reconnect.'
                                : 'Token expired and could not be refreshed. Reconnect to restore online payments.'}
                        </div>
                    )}
                    {health === 'active' && rzpStatus?.connectedAt && (
                        <p style={{ fontSize: 11, color: '#71717A' }}>
                            Connected on {new Date(rzpStatus.connectedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' · '}Funds settle directly to your Razorpay account
                        </p>
                    )}
                </div>
                    );
                })()}
            </div>
            )}

            {/* ── GST Compliance ── */}
            {activeTab === 'gst' && (
            <div className="bg-white" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '24px', marginBottom: 24 }}>
                <div className="flex items-start gap-3 mb-5">
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#047857' }}>verified_user</span>
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 className="font-semibold" style={{ fontSize: 16, lineHeight: '24px', color: '#0A0A0A' }}>GST Compliance</h2>
                        <p style={{ fontSize: 13, color: '#71717A', lineHeight: '20px', marginTop: 2 }}>
                            Verify your GSTIN and choose your collection rate. Tax is added automatically to every customer bill.
                        </p>
                    </div>
                </div>

                {gstLoading || !gstProfile ? (
                    <div className="flex items-center justify-center p-4" style={{ background: '#FAFAFA', borderRadius: 12, border: '1px solid #E4E4E7' }}>
                        <Spinner size="md" tone="brand" label="Loading GST details" />
                    </div>
                ) : gstProfile.gst_status === 'pending' ? (
                    <div className="flex items-center justify-between gap-3 p-4 rounded-xl" style={{ background: '#FAFAFA', border: '1px solid #E4E4E7' }}>
                        <div>
                            <p className="font-medium" style={{ fontSize: 14, color: '#0A0A0A', marginBottom: 2 }}>Not set up yet</p>
                            <p style={{ fontSize: 12, color: '#71717A' }}>This step is required before GST can appear on customer bills.</p>
                        </div>
                        <button
                            onClick={() => setGstWizardOpen(true)}
                            className="hover:opacity-90"
                            style={{ background: '#5137EF', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                            Set up GST
                        </button>
                    </div>
                ) : gstProfile.gst_status === 'not_registered' ? (
                    <div className="flex items-center justify-between gap-3 p-4 rounded-xl" style={{ background: '#FAFAFA', border: '1px solid #E4E4E7' }}>
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#047857' }}>check_circle</span>
                            <div>
                                <p className="font-medium" style={{ fontSize: 14, color: '#0A0A0A' }}>Marked as not GST-registered</p>
                                <p style={{ fontSize: 12, color: '#71717A' }}>No GST will be added to customer bills.</p>
                            </div>
                        </div>
                        <button
                            onClick={handleEditGst}
                            disabled={gstResetting}
                            className="hover:bg-neutral-50"
                            style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 500, color: '#0A0A0A', background: '#fff', cursor: gstResetting ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
                        >
                            Change
                        </button>
                    </div>
                ) : (
                    /* gst_status === 'registered' */
                    <div className="rounded-xl" style={{ background: '#FAFAFA', border: '1px solid #E4E4E7' }}>
                        <div className="flex items-center justify-between gap-3 p-4" style={{ borderBottom: '1px solid #E4E4E7' }}>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#047857' }}>verified</span>
                                <div>
                                    <p className="font-medium" style={{ fontSize: 14, color: '#0A0A0A' }}>
                                        GST registered · {Number(gstProfile.gst_rate_pct ?? 0)}% collection rate
                                    </p>
                                    <p style={{ fontSize: 12, color: '#71717A' }}>
                                        Verified {gstProfile.gst_verified_at
                                            ? new Date(gstProfile.gst_verified_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                            : ''}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleEditGst}
                                disabled={gstResetting}
                                className="hover:bg-white"
                                style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 500, color: '#0A0A0A', background: '#fff', cursor: gstResetting ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
                            >
                                {gstResetting ? 'Resetting…' : 'Edit'}
                            </button>
                        </div>
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3" style={{ fontSize: 13 }}>
                            <div>
                                <p style={{ fontSize: 11, color: '#71717A', textTransform: 'uppercase', letterSpacing: 0.3 }}>GSTIN</p>
                                <p style={{ color: '#0A0A0A', fontFamily: 'monospace', marginTop: 2 }}>{gstProfile.gstin}</p>
                            </div>
                            <div>
                                <p style={{ fontSize: 11, color: '#71717A', textTransform: 'uppercase', letterSpacing: 0.3 }}>Legal name</p>
                                <p style={{ color: '#0A0A0A', marginTop: 2 }}>{gstProfile.gst_legal_name ?? '—'}</p>
                            </div>
                            <div>
                                <p style={{ fontSize: 11, color: '#71717A', textTransform: 'uppercase', letterSpacing: 0.3 }}>Owner</p>
                                <p style={{ color: '#0A0A0A', marginTop: 2 }}>{gstProfile.gst_owner_name ?? '—'}</p>
                            </div>
                            <div>
                                <p style={{ fontSize: 11, color: '#71717A', textTransform: 'uppercase', letterSpacing: 0.3 }}>State</p>
                                <p style={{ color: '#0A0A0A', marginTop: 2 }}>{gstProfile.gst_state ?? '—'}</p>
                            </div>
                            <div className="md:col-span-2">
                                <p style={{ fontSize: 11, color: '#71717A', textTransform: 'uppercase', letterSpacing: 0.3 }}>Registered address</p>
                                <p style={{ color: '#0A0A0A', marginTop: 2 }}>{gstProfile.gst_address ?? '—'} {gstProfile.gst_pincode ? `– ${gstProfile.gst_pincode}` : ''}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            )}

            {/* ── WhatsApp Order Taking — QR-Order plan only ── */}
            {activeTab === 'orders' && isQrOrder && (
            <div className="bg-white" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '24px', marginBottom: 24 }}>
                <div className="flex items-start gap-3 mb-5">
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#25D366' }}>chat</span>
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 className="font-semibold" style={{ fontSize: 16, lineHeight: '24px', color: '#0A0A0A' }}>WhatsApp Order Taking</h2>
                        <p style={{ fontSize: 13, color: '#71717A', lineHeight: '20px', marginTop: 2 }}>
                            For stores on the QR-Order (no-payment) plan. When on, customers go straight to your WhatsApp with a prefilled order message — no in-app token or counter step.
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl mb-3" style={{ background: '#FAFAFA', border: '1px solid #E4E4E7' }}>
                    <div>
                        <p className="font-medium" style={{ fontSize: 14, color: '#0A0A0A', marginBottom: 2 }}>Send orders to my WhatsApp</p>
                        <p style={{ fontSize: 12, color: '#71717A' }}>
                            {whatsappEnabled ? 'On — customer orders open a WhatsApp chat to you' : 'Off — orders use the in-app token flow'}
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            const next = !whatsappEnabled;
                            if (next && !whatsappNumber.trim()) {
                                toast.error('Enter your WhatsApp number first');
                                return;
                            }
                            saveWhatsapp(next, whatsappNumber);
                        }}
                        disabled={whatsappSaving}
                        style={{
                            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: whatsappSaving ? 'wait' : 'pointer',
                            border: whatsappEnabled ? '2px solid #16A34A' : '1px solid #E4E4E7',
                            background: whatsappEnabled ? '#DCFCE7' : '#fff',
                            color: whatsappEnabled ? '#15803D' : '#52525C',
                        }}
                    >
                        {whatsappEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                </div>

                <div>
                    <label style={labelStyle}>WhatsApp number {whatsappEnabled && <span style={{ color: '#E7000B' }}>*</span>}</label>
                    <div className="flex gap-2">
                        <input
                            value={whatsappNumber}
                            onChange={e => setWhatsappNumber(e.target.value)}
                            placeholder="+91 98765 43210"
                            disabled={whatsappSaving}
                            style={{ ...inputStyle, flex: 1 }}
                        />
                        <button
                            onClick={() => saveWhatsapp(whatsappEnabled, whatsappNumber)}
                            disabled={whatsappSaving || !whatsappNumber.trim()}
                            className="hover:opacity-90"
                            style={{ background: '#5137EF', color: '#fff', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                        >
                            {whatsappSaving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                    <p style={{ fontSize: 11, color: '#99A1AF', marginTop: 6 }}>
                        Include the country code (e.g. +91 for India, +971 for UAE). Spaces and dashes are allowed.
                    </p>
                </div>
            </div>
            )}

            {/* ── Display Currency ── */}
            {activeTab === 'orders' && (
            <div className="bg-white" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '24px', marginBottom: 24 }}>
                <div className="flex items-start gap-3 mb-5">
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#D97706' }}>payments</span>
                    </div>
                    <div style={{ flex: 1 }}>
                        <h2 className="font-semibold" style={{ fontSize: 16, lineHeight: '24px', color: '#0A0A0A' }}>Display Currency</h2>
                        <p style={{ fontSize: 13, color: '#71717A', lineHeight: '20px', marginTop: 2 }}>
                            The symbol shown to customers on the menu and bill. Past orders keep their original currency.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {([
                        { code: 'INR' as const, label: 'Indian Rupee', symbol: '₹' },
                        { code: 'AED' as const, label: 'UAE Dirham',   symbol: 'AED' },
                    ]).map(opt => (
                        <button
                            key={opt.code}
                            onClick={() => saveCurrency(opt.code)}
                            disabled={currencySaving}
                            style={{
                                padding: '14px 16px', borderRadius: 12, cursor: currencySaving ? 'wait' : 'pointer',
                                border: currencyCode === opt.code ? '2px solid #5137EF' : '1px solid #E4E4E7',
                                background: currencyCode === opt.code ? '#EEEEFF' : '#fff',
                                textAlign: 'left',
                                display: 'flex', alignItems: 'center', gap: 12,
                            }}
                        >
                            <div style={{
                                width: 44, height: 44, borderRadius: 10,
                                background: currencyCode === opt.code ? '#5137EF' : '#F4F4F5',
                                color: currencyCode === opt.code ? '#fff' : '#52525C',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: opt.code === 'AED' ? 13 : 20, fontWeight: 700,
                            }}>
                                {opt.symbol}
                            </div>
                            <div>
                                <p style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>{opt.label}</p>
                                <p style={{ fontSize: 12, color: '#71717A' }}>{opt.code}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
            )}

            {/* ── Danger Zone ── */}
            {activeTab === 'danger' && (
            <div style={{ border: '1px solid #FECACA', borderRadius: 14, padding: '24px', background: '#FFFBFB' }}>
                <div className="flex items-start gap-3 mb-4">
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#E7000B' }}>warning</span>
                    </div>
                    <div>
                        <h2 className="font-semibold" style={{ fontSize: 16, lineHeight: '24px', color: '#0A0A0A' }}>Danger Zone</h2>
                        <p style={{ fontSize: 13, color: '#71717A', lineHeight: '20px', marginTop: 2 }}>
                            Irreversible actions that permanently affect your store.
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #FECACA' }}>
                    <div>
                        <p className="font-semibold" style={{ fontSize: 14, color: '#0A0A0A', marginBottom: 2 }}>Delete this store</p>
                        <p style={{ fontSize: 12, color: '#71717A', lineHeight: '18px' }}>
                            Permanently removes the store, all products, banners and menu data. This cannot be undone.
                        </p>
                    </div>
                    <button
                        onClick={() => { setDeleteConfirmText(''); setDeleteModalOpen(true); }}
                        className="flex items-center justify-center gap-1.5 w-full sm:w-auto shrink-0 hover:opacity-90 transition-opacity"
                        style={{ background: '#E7000B', color: '#FFFFFF', border: 'none', borderRadius: 10, padding: '12px 18px', fontSize: 14, fontWeight: 500, minHeight: 44, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete_forever</span>
                        Delete Store
                    </button>
                </div>
            </div>
            )}

            {gstWizardOpen && siteId && (
                <GstWizard
                    siteId={siteId}
                    onClose={(updated) => {
                        setGstWizardOpen(false);
                        if (updated) setGstProfile(updated);
                    }}
                />
            )}

            {/* ── Delete Confirmation Modal ── */}
            {deleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
                    <div className="bg-white w-full flex flex-col" style={{ maxWidth: 440, borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden' }}>

                        {/* Red header */}
                        <div className="flex items-center justify-between" style={{ background: '#E7000B', padding: '16px 20px' }}>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-white" style={{ fontSize: 20 }}>delete_forever</span>
                                <span className="font-semibold text-white" style={{ fontSize: 15 }}>Delete Store</span>
                            </div>
                            <button onClick={() => setDeleteModalOpen(false)} disabled={deleting} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-symbols-outlined text-white/80" style={{ fontSize: 20 }}>close</span>
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '24px 24px 20px' }}>
                            <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 16, marginBottom: 8 }}>
                                Are you absolutely sure?
                            </p>
                            <p style={{ fontSize: 13, color: '#52525C', lineHeight: '20px', marginBottom: 20 }}>
                                This will permanently delete <strong style={{ color: '#0A0A0A' }}>{storeName}</strong> and all associated data including:
                            </p>

                            <div className="flex flex-col gap-2 mb-6">
                                {[
                                    { icon: 'inventory_2',    label: 'All products & menu items' },
                                    { icon: 'image',          label: 'All banners' },
                                    { icon: 'receipt_long',   label: 'All orders & transactions' },
                                    { icon: 'link',           label: `Public menu URL (/shop/${siteSlug})` },
                                ].map(item => (
                                    <div key={item.icon} className="flex items-center gap-2.5">
                                        <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#E7000B' }}>{item.icon}</span>
                                        <span style={{ fontSize: 13, color: '#52525C' }}>{item.label}</span>
                                    </div>
                                ))}
                            </div>

                            <p style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A', marginBottom: 8 }}>
                                Type <strong style={{ fontFamily: 'monospace', background: '#F4F4F5', padding: '2px 6px', borderRadius: 4 }}>{storeName}</strong> to confirm:
                            </p>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                placeholder={storeName}
                                disabled={deleting}
                                style={{ width: '100%', border: `1.5px solid ${deleteConfirmMatch && deleteConfirmText ? '#E7000B' : '#E4E4E7'}`, borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#0A0A0A', outline: 'none', background: '#FFFFFF', boxSizing: 'border-box' }}
                                autoFocus
                            />
                        </div>

                        {/* Footer */}
                        <div className="flex items-center gap-3" style={{ padding: '0 24px 20px' }}>
                            <button
                                onClick={() => setDeleteModalOpen(false)}
                                disabled={deleting}
                                className="flex-1 hover:bg-neutral-50 transition-colors"
                                style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 500, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteStore}
                                disabled={!deleteConfirmMatch || !deleteConfirmText || deleting}
                                className="flex-1 flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-40"
                                style={{ background: '#E7000B', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 500, color: '#FFFFFF', border: 'none', cursor: (!deleteConfirmMatch || deleting) ? 'not-allowed' : 'pointer' }}
                            >
                                {deleting ? (
                                    <><Spinner size="sm" tone="onBrand" />Deleting…</>
                                ) : (
                                    <><span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete_forever</span>Delete Store</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
