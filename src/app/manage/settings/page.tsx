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

    // ── KOT settings state ────────────────────────────────────────────────────
    const [kotMode,         setKotModeState]   = useState<'manual' | 'automatic'>('manual');
    const [kotModeLoaded,   setKotModeLoaded]  = useState(false);
    const [kotModeUpdating, setKotModeUpdating]= useState(false);
    const [isKotStation,    setIsKotStation]   = useState(false);
    const [kotDevMode,      setKotDevMode]     = useState(false);

    // ── Load site data from active site context ───────────────────────────────
    useEffect(() => {
        if (!activeSite) return;
        setLoading(true);
        setLogoPreview(null);
        supabase
            .from('sites')
            .select('id, slug, name, description, contact_number, timing, image_url, kot_mode')
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
                    // Load localStorage KOT flags
                    try {
                        setIsKotStation(localStorage.getItem(`kot_station_${data.id}`) === '1');
                        setKotDevMode(localStorage.getItem('kot_dev_mode') === '1');
                    } catch { /* ignore */ }
                }
                setLoading(false);
            });
    }, [activeSite]);

    // ── Logo upload ───────────────────────────────────────────────────────────
    const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !siteId || !siteSlug) return;
        if (file.size > 5 * 1024 * 1024) { toast.error('Image too large. Max 5 MB.'); return; }

        setUploadingLogo(true);
        try {
            const compressed = await compressImage(file, { maxWidth: 800, quality: 0.85 });
            const ext = compressed.name.split('.').pop() ?? 'jpg';
            const filePath = `${siteSlug}/logo-${Date.now()}.${ext}`;
            const { error: uploadError } = await supabase.storage.from('product-images').upload(filePath, compressed);
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(filePath);
            setLogoUrl(publicUrl);
            setLogoPreview(URL.createObjectURL(file));
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

    const toggleKotStation = () => {
        if (!siteId) return;
        const next = !isKotStation;
        try { localStorage.setItem(`kot_station_${siteId}`, next ? '1' : '0'); } catch { /* ignore */ }
        setIsKotStation(next);
        toast.success(next ? 'This device is now the KOT Station' : 'KOT Station flag cleared');
    };

    const toggleKotDevMode = () => {
        const next = !kotDevMode;
        try { localStorage.setItem('kot_dev_mode', next ? '1' : '0'); } catch { /* ignore */ }
        setKotDevMode(next);
        toast.success(next ? 'KOT dev mode on — toasts instead of printing' : 'KOT dev mode off');
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

                {/* KOT Station toggle — only relevant in automatic mode */}
                {kotMode === 'automatic' && (
                    <div className="flex items-center justify-between p-4 rounded-xl mb-3" style={{ background: isKotStation ? '#F0FDF4' : '#FAFAFA', border: `1px solid ${isKotStation ? '#86EFAC' : '#E4E4E7'}` }}>
                        <div>
                            <p className="font-medium" style={{ fontSize: 14, color: '#0A0A0A', marginBottom: 2 }}>
                                {isKotStation
                                    ? <><span style={{ color: '#16A34A' }}>●</span> KOT Station Active</>
                                    : <><span style={{ color: '#A1A1AA' }}>○</span> Not a KOT Station</>
                                }
                            </p>
                            <p style={{ fontSize: 12, color: '#71717A' }}>
                                Mark this device as the KOT Station. Only KOT Station devices auto-print.
                            </p>
                        </div>
                        <button
                            onClick={toggleKotStation}
                            style={{
                                padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                background: isKotStation ? '#16A34A' : '#5137EF',
                                color: '#fff', border: 'none',
                            }}
                        >
                            {isKotStation ? 'Unmark' : 'Mark as KOT Station'}
                        </button>
                    </div>
                )}

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
