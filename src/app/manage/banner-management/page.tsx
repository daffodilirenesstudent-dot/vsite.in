'use client';

import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/utils/compressImage';
import { useSite } from '@/components/SiteContext';

interface Banner {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    sort_order: number;
    is_active: boolean;
    created_at: string;
}

const emptyForm = { name: '', description: '', imagePreview: null as string | null, imageFile: null as File | null };

const COLS = ['BANNER NAME', 'UPLOADED DATE', 'DESCRIPTION', 'PREVIEW THUMBNAIL', 'ACTION'];

export default function BannerManagementPage() {
    const { activeSite } = useSite();

    const [banners, setBanners]     = useState<Banner[]>([]);
    const [loading, setLoading]     = useState(true);

    const [drawerOpen, setDrawerOpen]       = useState(false);
    const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
    const [form, setForm]                   = useState({ ...emptyForm });
    const [saving, setSaving]               = useState(false);
    const [uploading, setUploading]         = useState(false);

    const [deleteTarget, setDeleteTarget]   = useState<{ id: string; name: string } | null>(null);
    const [deleting, setDeleting]           = useState(false);

    const imageInputRef = useRef<HTMLInputElement>(null);

    // Drag-and-drop reorder state
    const dragIndex = useRef<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const siteId   = activeSite?.id   ?? null;
    const siteSlug = activeSite?.slug ?? '';

    // ── Load banners when active site changes ────────────────────────────────
    useEffect(() => {
        if (!siteId) { setLoading(false); return; }
        setLoading(true);
        setBanners([]);
        supabase
            .from('banners')
            .select('*')
            .eq('site_id', siteId)
            .order('sort_order', { ascending: true })
            .then(({ data, error }) => {
                if (error) toast.error('Failed to load banners');
                else setBanners(data ?? []);
                setLoading(false);
            });
    }, [siteId]);

    // ── Drag reorder ─────────────────────────────────────────────────────────
    const handleDragStart = (idx: number) => { dragIndex.current = idx; };
    const handleDragOver  = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIndex(idx); };
    const handleDragEnd   = () => { dragIndex.current = null; setDragOverIndex(null); };

    const handleDrop = async (idx: number) => {
        if (dragIndex.current === null || dragIndex.current === idx) {
            setDragOverIndex(null);
            return;
        }
        const next = [...banners];
        const [moved] = next.splice(dragIndex.current, 1);
        next.splice(idx, 0, moved);
        const reordered = next.map((b, i) => ({ ...b, sort_order: i }));
        setBanners(reordered); // optimistic
        dragIndex.current = null;
        setDragOverIndex(null);

        // Persist sort order in a single round trip — upsert with the existing
        // primary keys is far cheaper than N parallel UPDATEs on 4G (one TLS
        // handshake instead of N).
        const { error } = await supabase
            .from('banners')
            .upsert(
                reordered.map(b => ({ id: b.id, sort_order: b.sort_order })),
                { onConflict: 'id' },
            );
        if (error) {
            toast.error('Failed to save order — please reload');
        }
    };

    // ── Drawer helpers ────────────────────────────────────────────────────────
    // Always revoke any in-progress blob URL when replacing form state so we
    // don't leak across open → edit → save cycles.
    const revokeFormBlob = () => {
        setForm(f => {
            if (f.imagePreview?.startsWith('blob:')) URL.revokeObjectURL(f.imagePreview);
            return f;
        });
    };
    const openDrawer = () => {
        revokeFormBlob();
        setEditingBanner(null);
        setForm({ ...emptyForm });
        setDrawerOpen(true);
    };
    const openEditDrawer = (banner: Banner) => {
        revokeFormBlob();
        setEditingBanner(banner);
        setForm({ name: banner.name, description: banner.description ?? '', imagePreview: banner.image_url, imageFile: null });
        setDrawerOpen(true);
    };
    const closeDrawer = () => {
        revokeFormBlob();
        setDrawerOpen(false);
        setEditingBanner(null);
        setForm({ ...emptyForm });
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) { toast.error('Please choose an image file.'); return; }
        if (file.size > 5 * 1024 * 1024)     { toast.error('Image too large. Max 5 MB.');   return; }
        setForm(f => {
            // Revoke previous local blob URL to avoid memory leak
            if (f.imagePreview?.startsWith('blob:')) URL.revokeObjectURL(f.imagePreview);
            return { ...f, imageFile: file, imagePreview: URL.createObjectURL(file) };
        });
    };

    // ── Upload image to Supabase Storage ─────────────────────────────────────
    const uploadImage = async (file: File): Promise<string | null> => {
        try {
            const compressed = await compressImage(file, { maxWidth: 1200, quality: 0.85 });
            const ext = compressed.name.split('.').pop() ?? 'jpg';
            const filePath = `${siteSlug}/banners/banner-${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from('product-images').upload(filePath, compressed);
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(filePath);
            return publicUrl;
        } catch (err) {
            console.error('Banner image upload error:', err);
            toast.error('Failed to upload image');
            return null;
        }
    };

    // ── Save (add or edit) ────────────────────────────────────────────────────
    const handleSaveBanner = async () => {
        if (!form.name.trim()) { toast.error('Banner name is required'); return; }
        if (!siteId) return;

        setSaving(true);
        setUploading(!!form.imageFile);

        let imageUrl = editingBanner?.image_url ?? null;

        if (form.imageFile) {
            const uploaded = await uploadImage(form.imageFile);
            if (!uploaded) { setSaving(false); setUploading(false); return; }
            imageUrl = uploaded;
        }

        setUploading(false);

        if (editingBanner) {
            const { error } = await supabase
                .from('banners')
                .update({ name: form.name.trim(), description: form.description.trim() || null, image_url: imageUrl, updated_at: new Date().toISOString() })
                .eq('id', editingBanner.id);

            if (error) { toast.error('Failed to save banner'); }
            else {
                setBanners(prev => prev.map(b => b.id === editingBanner.id
                    ? { ...b, name: form.name.trim(), description: form.description.trim() || null, image_url: imageUrl }
                    : b
                ));
                toast.success('Banner updated');
                closeDrawer();
            }
        } else {
            const newSortOrder = banners.length;
            const { data, error } = await supabase
                .from('banners')
                .insert({ site_id: siteId, name: form.name.trim(), description: form.description.trim() || null, image_url: imageUrl, sort_order: newSortOrder })
                .select()
                .single();

            if (error) { toast.error('Failed to add banner'); }
            else {
                setBanners(prev => [...prev, data]);
                toast.success('Banner added');
                closeDrawer();
            }
        }

        setSaving(false);
    };

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        const { error } = await supabase.from('banners').delete().eq('id', deleteTarget.id);
        setDeleting(false);
        if (error) { toast.error('Failed to delete banner'); }
        else {
            setBanners(prev => prev.filter(b => b.id !== deleteTarget.id));
            toast.success('Banner deleted');
            setDeleteTarget(null);
        }
    };

    // ── Toggle active ─────────────────────────────────────────────────────────
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const handleToggleActive = async (banner: Banner) => {
        if (togglingId === banner.id) return; // prevent double-click mid-flight
        const next = !banner.is_active;
        setTogglingId(banner.id);
        setBanners(prev => prev.map(b => b.id === banner.id ? { ...b, is_active: next } : b));
        const { error } = await supabase.from('banners').update({ is_active: next }).eq('id', banner.id);
        if (error) {
            setBanners(prev => prev.map(b => b.id === banner.id ? { ...b, is_active: banner.is_active } : b));
            toast.error('Failed to update banner');
        }
        setTogglingId(null);
    };

    const formatDate = (iso: string) =>
        new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const inp: React.CSSProperties = { width: '100%', border: '1px solid #E4E4E7', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#0A0A0A', outline: 'none', background: '#FFFFFF' };
    const lbl: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#0A0A0A', lineHeight: '20px', marginBottom: 8, display: 'block' };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center py-24">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-gray-200 border-t-[#5137EF]" />
            </div>
        );
    }

    return (
        <div className="px-4 lg:px-8 py-6 lg:py-8">

            {/* Page header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
                <div>
                    <h1 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 22, lineHeight: '28px' }}>
                        <span className="md:hidden">Banners</span>
                        <span className="hidden md:inline" style={{ fontSize: 30, lineHeight: '36px' }}>Banner Management</span>
                    </h1>
                    <p className="text-[#52525C] mt-1" style={{ fontSize: 14, fontWeight: 400, lineHeight: '20px' }}>
                        Create and manage promotional banners to highlight your offers
                    </p>
                </div>
                <button
                    onClick={openDrawer}
                    className="flex items-center justify-center gap-2 text-white hover:opacity-90 transition-opacity w-full md:w-auto"
                    style={{ background: '#5137EF', borderRadius: 10, padding: '12px 18px', fontSize: 14, fontWeight: 500, minHeight: 44 }}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                    Add Banner
                </button>
            </div>

            {/* Empty state */}
            {banners.length === 0 ? (
                <div className="flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 220px)' }}>
                    <span className="material-symbols-outlined text-[#C4C4C4]" style={{ fontSize: 64, marginBottom: 20 }}>add_photo_alternate</span>
                    <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 20, lineHeight: '28px', marginBottom: 8 }}>Promote your offers with banners</p>
                    <p className="text-[#71717A]" style={{ fontSize: 14, fontWeight: 400, lineHeight: '20px', marginBottom: 24 }}>
                        You don&apos;t have any banners yet. Create one to highlight your deals.
                    </p>
                    <button onClick={openDrawer} className="flex items-center gap-2 text-white hover:opacity-90 transition-opacity" style={{ background: '#5137EF', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 500 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                        Add Banner
                    </button>
                </div>
            ) : (
                <>
                {/* ── MOBILE CARDS (below md) ── */}
                <div className="md:hidden flex flex-col gap-3">
                    {banners.map(banner => (
                        <div key={banner.id} style={{ border: '1px solid #E4E4E7', borderRadius: 12, padding: 12, background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div className="flex items-center gap-3">
                                {banner.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={banner.image_url} alt={banner.name} style={{ width: 88, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                                ) : (
                                    <div className="flex items-center justify-center" style={{ width: 88, height: 56, borderRadius: 8, background: '#F4F4F5', flexShrink: 0 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#99A1AF' }}>image</span>
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A', margin: 0 }}>{banner.name}</p>
                                    <p className="truncate" style={{ fontSize: 12, color: '#71717A', margin: '2px 0 0' }}>{banner.description ?? '—'}</p>
                                    <p style={{ fontSize: 11, color: '#A1A1AA', margin: '4px 0 0' }}>{formatDate(banner.created_at)}</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between" style={{ borderTop: '1px solid #F4F4F5', paddingTop: 10 }}>
                                <button
                                    onClick={() => handleToggleActive(banner)}
                                    disabled={togglingId === banner.id}
                                    className="flex items-center gap-2 disabled:opacity-60"
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 500, color: banner.is_active ? '#16A34A' : '#71717A' }}
                                >
                                    <span style={{ position: 'relative', width: 36, height: 20, borderRadius: 10, background: banner.is_active ? '#5137EF' : '#D1D5DB', display: 'inline-block' }}>
                                        <span style={{ position: 'absolute', top: 2, left: banner.is_active ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#FFFFFF', transition: 'left 0.15s' }} />
                                    </span>
                                    {banner.is_active ? 'Visible' : 'Hidden'}
                                </button>
                                <div className="flex items-center gap-2">
                                    <button type="button" aria-label={`Edit ${banner.name}`} className="flex items-center justify-center hover:bg-neutral-100 transition-colors" style={{ width: 40, height: 40, borderRadius: 8 }} onClick={() => openEditDrawer(banner)}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#0A0A0A' }}>edit</span>
                                    </button>
                                    <button className="flex items-center justify-center hover:bg-red-50 transition-colors" style={{ width: 40, height: 40, borderRadius: 8 }} onClick={() => setDeleteTarget({ id: banner.id, name: banner.name })}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#E7000B' }}>delete</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── DESKTOP TABLE (md+) ── */}
                <div className="hidden md:block overflow-x-auto">
                    <div className="overflow-hidden" style={{ border: '1px solid #E4E4E7', borderRadius: 14, minWidth: 700 }}>
                        {/* Header */}
                        <div className="grid" style={{ gridTemplateColumns: '180px 130px 1fr 160px 80px 120px', background: '#F4F4F4', borderBottom: '1px solid #E4E4E7', padding: '0 24px' }}>
                            {[...COLS, 'VISIBLE'].map(col => (
                                <div key={col} className="text-[#71717A]" style={{ padding: '12px 0', fontSize: 12, fontWeight: 500, letterSpacing: '0.6px', textTransform: 'uppercase' }}>{col}</div>
                            ))}
                        </div>

                        {/* Rows */}
                        {banners.map((banner, idx) => (
                            <div
                                key={banner.id}
                                draggable
                                onDragStart={() => handleDragStart(idx)}
                                onDragOver={e => handleDragOver(e, idx)}
                                onDrop={() => handleDrop(idx)}
                                onDragEnd={handleDragEnd}
                                className="grid items-center"
                                style={{
                                    gridTemplateColumns: '180px 130px 1fr 160px 80px 120px',
                                    padding: '0 24px',
                                    minHeight: 72,
                                    background: dragOverIndex === idx ? '#F5F3FF' : '#FFFFFF',
                                    borderBottom: idx < banners.length - 1 ? '1px solid #E4E4E7' : 'none',
                                    borderTop: dragOverIndex === idx ? '2px solid #5137EF' : '2px solid transparent',
                                    transition: 'background 0.15s',
                                    cursor: 'default',
                                }}
                            >
                                {/* Name */}
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>{banner.name}</div>

                                {/* Date */}
                                <div style={{ fontSize: 13, color: '#52525C' }}>{formatDate(banner.created_at)}</div>

                                {/* Description */}
                                <div className="truncate pr-4" style={{ fontSize: 13, color: '#52525C' }}>{banner.description ?? '—'}</div>

                                {/* Thumbnail */}
                                <div>
                                    {banner.image_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={banner.image_url} alt={banner.name} style={{ width: 120, height: 44, objectFit: 'cover', borderRadius: 6 }} />
                                    ) : (
                                        <div className="flex items-center justify-center" style={{ width: 120, height: 44, borderRadius: 6, background: '#F4F4F5' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#99A1AF' }}>image</span>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1">
                                    <button type="button" aria-label={`Edit ${banner.name}`} className="flex items-center justify-center hover:bg-neutral-100 transition-colors" style={{ width: 32, height: 32, borderRadius: 6 }} onClick={() => openEditDrawer(banner)} title="Edit">
                                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#0A0A0A' }}>edit</span>
                                    </button>
                                    <button className="flex items-center justify-center hover:bg-red-50 transition-colors" style={{ width: 32, height: 32, borderRadius: 6 }} onClick={() => setDeleteTarget({ id: banner.id, name: banner.name })} title="Delete">
                                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#E7000B' }}>delete</span>
                                    </button>
                                </div>

                                {/* Visible toggle + drag */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleToggleActive(banner)}
                                        disabled={togglingId === banner.id}
                                        className="relative shrink-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                        style={{ width: 36, height: 20, borderRadius: 10, background: banner.is_active ? '#5137EF' : '#D1D5DB', border: 'none', cursor: 'pointer', padding: 0 }}
                                        title={banner.is_active ? 'Visible — click to hide' : 'Hidden — click to show'}
                                    >
                                        <span style={{
                                            position: 'absolute', top: 2, left: banner.is_active ? 18 : 2,
                                            width: 16, height: 16, borderRadius: '50%', background: '#FFFFFF',
                                            transition: 'left 0.15s',
                                        }} />
                                    </button>
                                    <div className="flex items-center justify-center hover:bg-neutral-100 transition-colors" style={{ width: 28, height: 28, borderRadius: 6, cursor: 'grab' }} title="Drag to reorder">
                                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#71717A' }}>drag_indicator</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                </>
            )}

            {/* ── DELETE MODAL ── */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.35)' }}>
                    <div className="bg-white flex flex-col items-center" style={{ width: '100%', maxWidth: 400, borderRadius: 16, padding: '28px 22px 22px', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
                        <button onClick={() => setDeleteTarget(null)} className="absolute flex items-center justify-center hover:bg-neutral-100 transition-colors" style={{ top: 16, right: 16, width: 28, height: 28, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#71717A' }}>close</span>
                        </button>
                        <div className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: '50%', background: '#FEE2E2', marginBottom: 20 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#E7000B' }}>warning</span>
                        </div>
                        <h3 className="font-semibold text-[#0A0A0A] text-center" style={{ fontSize: 20, lineHeight: '28px', marginBottom: 8 }}>Delete Banner?</h3>
                        <p className="text-[#71717A] text-center" style={{ fontSize: 14, lineHeight: '20px', marginBottom: 16 }}>Are you sure you want to delete this banner?</p>
                        <div className="w-full text-center font-medium" style={{ background: '#FEE2E2', borderRadius: 8, padding: '10px 16px', fontSize: 14, color: '#0A0A0A', marginBottom: 10 }}>
                            &ldquo;{deleteTarget.name}&rdquo;
                        </div>
                        <p className="text-[#99A1AF] text-center" style={{ fontSize: 12, marginBottom: 24 }}>This action cannot be undone.</p>
                        <div className="flex items-center gap-3 w-full">
                            <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="flex-1 hover:bg-neutral-50 transition-colors" style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 500, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleDelete} disabled={deleting} className="flex-1 hover:opacity-90 transition-opacity disabled:opacity-60" style={{ background: '#E7000B', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 500, color: '#FFFFFF', border: 'none', cursor: deleting ? 'wait' : 'pointer' }}>
                                {deleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── ADD / EDIT BANNER DRAWER ── */}
            {drawerOpen && (
                <>
                    <div className="fixed inset-0" style={{ background: 'rgba(0,0,0,0.25)', zIndex: 55 }} onClick={closeDrawer} />
                    <div className="fixed top-0 right-0 flex flex-col bg-white" style={{ width: 'min(480px, 100vw)', height: '100dvh', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', zIndex: 60 }}>

                        {/* Header */}
                        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid #E4E4E7', flexShrink: 0 }}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <h2 className="font-semibold text-[#0A0A0A]" style={{ fontSize: 22, lineHeight: '28px' }}>{editingBanner ? 'Edit Banner' : 'Add New Banner'}</h2>
                                    <p className="text-[#71717A]" style={{ fontSize: 13, marginTop: 2 }}>{editingBanner ? 'Update the banner details below' : 'Fill in the banner details below'}</p>
                                </div>
                                <button onClick={closeDrawer} className="flex items-center justify-center hover:bg-neutral-100 transition-colors" style={{ width: 32, height: 32, borderRadius: 6 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#71717A' }}>close</span>
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>

                            {/* Banner Image */}
                            <div style={{ marginBottom: 20 }}>
                                <label style={lbl}>Banner Image</label>
                                <div
                                    className="flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors"
                                    style={{ border: '1.5px dashed #D4D4D8', borderRadius: 12, padding: '28px 16px', background: '#FAFAFA' }}
                                    onClick={() => imageInputRef.current?.click()}
                                >
                                    {form.imagePreview ? (
                                        <>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={form.imagePreview} alt="preview" style={{ maxHeight: 90, maxWidth: '100%', objectFit: 'contain', borderRadius: 8, marginBottom: 10 }} />
                                            <button type="button" onClick={e => { e.stopPropagation(); imageInputRef.current?.click(); }} className="hover:bg-neutral-100 transition-colors" style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '6px 18px', fontSize: 13, fontWeight: 600, color: '#0A0A0A', background: '#FFFFFF' }}>Change Image</button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-center" style={{ width: 48, height: 48, borderRadius: '50%', background: '#F4F4F4', marginBottom: 12 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#71717A' }}>upload</span>
                                            </div>
                                            <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 14, marginBottom: 4 }}>Upload Banner Image</p>
                                            <p className="text-[#99A1AF] text-center" style={{ fontSize: 12, marginBottom: 14 }}>PNG, JPG or WebP · Max 5 MB · Recommended 1050 × 405 px</p>
                                            <button type="button" onClick={e => { e.stopPropagation(); imageInputRef.current?.click(); }} className="hover:bg-neutral-50 transition-colors" style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '7px 20px', fontSize: 13, fontWeight: 600, color: '#0A0A0A', background: '#FFFFFF' }}>Choose File</button>
                                        </>
                                    )}
                                    <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                                </div>
                            </div>

                            {/* Banner Name */}
                            <div style={{ marginBottom: 20 }}>
                                <label style={lbl}>Banner Name <span style={{ color: '#E7000B' }}>*</span></label>
                                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Summer Offer" style={inp} disabled={saving} />
                            </div>

                            {/* Description */}
                            <div style={{ marginBottom: 20 }}>
                                <label style={lbl}>Description</label>
                                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of your banner..." rows={4} style={{ ...inp, resize: 'none' }} disabled={saving} />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end gap-3" style={{ padding: '16px 24px', borderTop: '1px solid #E4E4E7', flexShrink: 0 }}>
                            <button onClick={closeDrawer} disabled={saving} className="hover:bg-neutral-50 transition-colors" style={{ border: '1px solid #E4E4E7', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer' }}>Cancel</button>
                            <button
                                onClick={handleSaveBanner}
                                disabled={saving}
                                className="flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-60"
                                style={{ background: '#5137EF', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 500, color: '#FFFFFF', border: 'none', cursor: saving ? 'wait' : 'pointer' }}
                            >
                                {uploading ? (
                                    <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Uploading…</>
                                ) : saving ? (
                                    <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Saving…</>
                                ) : editingBanner ? 'Save Changes' : 'Add Banner'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
