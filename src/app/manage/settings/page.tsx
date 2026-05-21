'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/utils/compressImage';
import { useSite } from '@/components/SiteContext';
import { useAuth } from '@/components/AuthContext';

export default function SettingsPage() {
    const router = useRouter();
    const { activeSite, refreshSites } = useSite();
    const { user, signOut } = useAuth();

    const handleSignOut = async () => {
        await signOut();
        // Full navigation so all context providers unmount cleanly — same reason as Sidebar.
        window.location.replace('/login');
    };

    const [siteId, setSiteId]     = useState('');
    const [siteSlug, setSiteSlug] = useState('');
    const [form, setForm] = useState({ businessName: '', phoneNumber: '', description: '', timing: '' });
    const [logoUrl, setLogoUrl]       = useState<string | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [loading, setLoading]       = useState(true);
    const [saving, setSaving]         = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const logoInputRef = useRef<HTMLInputElement>(null);

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
        // Revoke any blob preview from the previously-selected store so it
        // doesn't sit in memory forever.
        setLogoPreview(prev => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return null; });
        supabase
            .from('sites')
            .select('id, slug, name, description, contact_number, timing, image_url, kot_mode, kot_printer_name, bill_printer_name')
            .eq('id', activeSite.id)
            .single()
            .then(({ data, error }) => {
                if (error) { toast.error('Failed to load settings'); setLoading(false); return; }
                if (data) {
                    setSiteId(data.id);
                    setSiteSlug(data.slug ?? '');
                    setForm({
                        businessName: data.name ?? '',
                        phoneNumber: data.contact_number ?? '',
                        description: data.description ?? '',
                        timing: data.timing ?? '',
                    });
                    setLogoUrl(data.image_url);
                    setKotModeState((data.kot_mode as 'manual' | 'automatic') ?? 'manual');
                    setKotModeLoaded(true);
                    setKotPrinterName((data as Record<string, unknown>).kot_printer_name as string | null ?? null);
                    setBillPrinterName((data as Record<string, unknown>).bill_printer_name as string | null ?? null);
                    try {
                        setKotDevMode(localStorage.getItem('kot_dev_mode') === '1');
                    } catch { /* ignore */ }
                }
                setLoading(false);
            });
    }, [activeSite]);

    // Revoke any blob URL still held when the page unmounts.
    useEffect(() => () => {
        setLogoPreview(prev => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return null; });
    }, []);

    // ── Logo upload ───────────────────────────────────────────────────────────
    const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Reset so picking the same file again still fires the change event.
        e.target.value = '';
        if (!file || !siteId || !siteSlug) return;
        if (!file.type.startsWith('image/')) { toast.error('Please choose an image file.'); return; }
        if (file.size > 5 * 1024 * 1024)     { toast.error('Image too large. Max 5 MB.');   return; }

        setUploadingLogo(true);
        try {
            const compressed = await compressImage(file, { maxWidth: 800, quality: 0.85 });
            const ext = compressed.name.split('.').pop() ?? 'jpg';
            const filePath = `${siteSlug}/logo-${Date.now()}.${ext}`;
            const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, compressed);
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(filePath);
            setLogoUrl(publicUrl);
            // Revoke previous blob (if any) before creating a fresh one.
            setLogoPreview(prev => {
                if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
                return URL.createObjectURL(file);
            });
            toast.success('Logo uploaded');
        } catch (err) {
            console.error('Logo upload error:', err);
            toast.error('Failed to upload logo');
        } finally {
            setUploadingLogo(false);
        }
    };

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!siteId) return;
        if (!form.businessName.trim()) { toast.error('Business name is required'); return; }

        setSaving(true);
        const { error } = await supabase
            .from('sites')
            .update({
                name: form.businessName.trim(),
                description: form.description.trim() || null,
                contact_number: form.phoneNumber.trim() || null,
                timing: form.timing.trim() || null,
                image_url: logoUrl,
            })
            .eq('id', siteId);

        setSaving(false);
        if (error) { toast.error('Failed to save changes'); }
        else { toast.success('Settings saved'); refreshSites(); }
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
            const token = await import('@/lib/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
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
        if (!quiet) setRzpStatusLoading(true);
        try {
            const token = await import('@/lib/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
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
            const token = await import('@/lib/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
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
            const token = await import('@/lib/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
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
            const token = await import('@/lib/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
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
            const token = await import('@/lib/firebase').then(m => m.firebaseAuth.currentUser?.getIdToken());
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
            // Archive to deleted_sites before deleting
            const { data: siteData } = await supabase
                .from('sites')
                .select('*')
                .eq('id', siteId)
                .single();

            if (siteData) {
                await supabase.from('deleted_sites').insert({
                    id: siteData.id,
                    original_created_at: siteData.created_at,
                    user_id: siteData.user_id,
                    name: siteData.name,
                    slug: siteData.slug,
                    type: siteData.type,
                    description: siteData.description,
                    owner_name: siteData.owner_name,
                    contact_number: siteData.contact_number,
                    timing: siteData.timing,
                    established_year: siteData.established_year,
                    location: siteData.location,
                    state: siteData.state,
                    pincode: siteData.pincode,
                    address: siteData.address,
                    image_url: siteData.image_url,
                    email: siteData.email,
                    whatsapp_number: siteData.whatsapp_number,
                    tagline: siteData.tagline,
                    social_links: siteData.social_links,
                    is_live: siteData.is_live,
                });
            }

            // Delete the site — cascades to products, banners, categories, orders, transactions
            const { error } = await supabase.from('sites').delete().eq('id', siteId);
            if (error) throw error;

            toast.success('Store deleted successfully');
            setDeleteModalOpen(false);

            // Re-fetch directly — allSites is a stale closure after refreshSites()
            const { data: remaining } = await supabase
                .from('sites')
                .select('id')
                .eq('user_id', user?.id ?? '')
                .neq('id', siteId);
            await refreshSites();
            router.replace((remaining?.length ?? 0) > 0 ? '/manage/dashboard' : '/onboarding?new=true');
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

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center py-24">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-[#5137EF]" />
            </div>
        );
    }

    return (
        <div className="px-4 md:px-8 py-6 md:py-8 max-w-2xl">

            {/* Mobile-only quick nav */}
            <div className="lg:hidden mb-5 rounded-xl overflow-hidden" style={{ border: '1px solid #E4E4E7' }}>
                {[
                    { label: 'QR Code & Poster',  icon: 'qr_code_2',         href: '/manage/qr',                desc: 'Download your menu QR code' },
                    { label: 'Banner Management', icon: 'image',             href: '/manage/banner-management', desc: 'Manage your store banners' },
                    { label: 'Transactions',       icon: 'credit_card',       href: '/manage/transactions',      desc: 'View payment history' },
                    { label: 'Subscription',       icon: 'workspace_premium', href: '/manage/subscription',      desc: 'Manage your plan' },
                ].map((item, idx, arr) => (
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
                {/* Sign Out */}
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
            </div>

            {/* Page header */}
            <div className="mb-6">
                <h1 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 30, lineHeight: '36px' }}>Settings</h1>
                <p className="text-[#52525C] mt-1" style={{ fontSize: 16, fontWeight: 400, lineHeight: '24px' }}>
                    Update your store details
                </p>
            </div>

            {/* Store Details card */}
            <div className="bg-white" style={{ border: '1px solid #E4E4E7', borderRadius: 14, padding: '24px', marginBottom: 24 }}>
                <h2 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 18, lineHeight: '28px', marginBottom: 20 }}>
                    Store Details
                </h2>

                <div className="flex flex-col gap-5">
                    <div>
                        <label style={labelStyle}>Business Name <span style={{ color: '#E7000B' }}>*</span></label>
                        <input type="text" value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} style={inputStyle} placeholder="e.g. Cream Story" disabled={saving} />
                    </div>
                    <div>
                        <label style={labelStyle}>Phone Number</label>
                        <input type="tel" value={form.phoneNumber} onChange={e => setForm(f => ({ ...f, phoneNumber: e.target.value }))} style={inputStyle} placeholder="+91 9876543210" disabled={saving} />
                    </div>
                    <div>
                        <label style={labelStyle}>Opening Hours</label>
                        <input type="text" value={form.timing} onChange={e => setForm(f => ({ ...f, timing: e.target.value }))} style={inputStyle} placeholder="e.g. 9:00 AM – 11:00 PM" disabled={saving} />
                    </div>
                    <div>
                        <label style={labelStyle}>Description</label>
                        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} style={{ ...inputStyle, resize: 'none' }} placeholder="Tell customers about your business..." disabled={saving} />
                    </div>

                    {/* Business Logo */}
                    <div>
                        <label style={labelStyle}>Business Logo</label>
                        <div className="flex flex-col items-center justify-center" style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '24px 16px', background: '#FAFAFA', minHeight: 160 }}>
                            {(logoPreview || logoUrl) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logoPreview ?? logoUrl!} alt="Logo" style={{ maxHeight: 100, maxWidth: 200, objectFit: 'contain', borderRadius: 8, marginBottom: 12 }} />
                            ) : (
                                <div style={{ width: 80, height: 80, borderRadius: 8, background: '#E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                    <span className="material-symbols-outlined text-[#99A1AF]" style={{ fontSize: 32 }}>image</span>
                                </div>
                            )}
                            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} disabled={uploadingLogo} />
                            <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="transition-colors hover:bg-neutral-100 disabled:opacity-50" style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '6px 20px', fontSize: 13, fontWeight: 500, color: '#0A0A0A', background: '#FFFFFF', cursor: uploadingLogo ? 'wait' : 'pointer' }}>
                                {uploadingLogo ? 'Uploading…' : 'Change Logo'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Save button */}
                <div className="mt-6 flex justify-end">
                    <button onClick={handleSave} disabled={saving || uploadingLogo} className="flex items-center gap-2 text-white transition-opacity hover:opacity-90 disabled:opacity-60" style={{ background: '#5137EF', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, cursor: saving ? 'wait' : 'pointer' }}>
                        {saving ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Saving…</>) : 'Save Changes'}
                    </button>
                </div>
            </div>

            {/* ── Kitchen Printing (KOT) ── */}
            {kotModeLoaded && (
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
                            href="/bys-print-bridge-setup.exe"
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

            {/* ── Danger Zone ── */}
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

                <div className="flex items-center justify-between gap-4 p-4 rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #FECACA' }}>
                    <div>
                        <p className="font-semibold" style={{ fontSize: 14, color: '#0A0A0A', marginBottom: 2 }}>Delete this store</p>
                        <p style={{ fontSize: 12, color: '#71717A', lineHeight: '18px' }}>
                            Permanently removes the store, all products, banners, and orders. This cannot be undone.
                        </p>
                    </div>
                    <button
                        onClick={() => { setDeleteConfirmText(''); setDeleteModalOpen(true); }}
                        className="flex items-center gap-1.5 shrink-0 hover:opacity-90 transition-opacity"
                        style={{ background: '#E7000B', color: '#FFFFFF', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete_forever</span>
                        Delete Store
                    </button>
                </div>
            </div>

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
                                    <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Deleting…</>
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
