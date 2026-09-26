'use client';

import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useSite } from '@/components/SiteContext';
import { useNotifications } from '@/components/NotificationContext';
import { Skeleton, Spinner } from '@/components/loading';
import { BANNER_ASPECT_CSS, moveBanner, orderChanges, ordinal, type Banner } from '@/lib/you/banners';
import {
    bannerFileProblem, createBanner, deleteBanner, loadBanners, saveBannerOrder, setBannerActive, updateBanner, uploadBannerImage,
} from '@/lib/you/bannerData';
import { refreshPublicMenu } from '@/lib/menu/refreshPublicMenu';
import { releaseMenuPhotos } from '@/lib/menu/releaseMenuPhotos';
import { replacedPhotos } from '@/lib/menu/photoCleanup';
import SubPage from '@/components/you/SubPage';
import Sheet from '@/components/you/Sheet';
import YouStyles, { Y, rise } from '@/components/you/YouStyles';
import { Card, Icon, Toggle, fieldStyle, hintStyle, labelStyle, primaryButton, quietButton } from '@/components/you/YouKit';

/**
 * Banners on a phone: each one shown in the exact crop customers see, with a
 * show/hide switch and a ⋮ menu for the rest. Reordering is Move up / Move
 * down — drag and drop is fiddly on a phone and easy to set off while
 * scrolling. Same table, bucket and compression as the desktop banner page.
 */

interface Draft { id: string | null; name: string; description: string; isActive: boolean; imageUrl: string | null; file: File | null; preview: string | null }

const emptyDraft: Draft = { id: null, name: '', description: '', isActive: true, imageUrl: null, file: null, preview: null };

function Photo({ src, alt, dim }: { src: string | null; alt: string; dim?: boolean }) {
    return (
        <span style={{ display: 'block', aspectRatio: BANNER_ASPECT_CSS, borderRadius: 10, overflow: 'hidden', background: Y.lineSoft, opacity: dim ? 0.45 : 1, position: 'relative' }}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={alt} loading="lazy" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: Y.muted, fontSize: 13 }}>
                    <Icon icon="image" size={20} />No photo
                </span>
            )}
        </span>
    );
}

export default function BannersPage() {
    const { activeSite } = useSite();
    const { refresh } = useNotifications();
    const [banners, setBanners] = useState<Banner[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [menuFor, setMenuFor] = useState<string | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);
    const [toDelete, setToDelete] = useState<Banner | null>(null);
    const [deleting, setDeleting] = useState(false);
    const busyToggle = useRef<Set<string>>(new Set());

    useEffect(() => {
        const siteId = activeSite?.id;
        if (!siteId) return;
        let cancelled = false;
        setBanners(null);
        setFailed(false);
        loadBanners(siteId)
            .then(list => { if (!cancelled) setBanners(list); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [activeSite?.id, attempt]);

    // Close the ⋮ menu on Escape.
    useEffect(() => {
        if (!menuFor) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuFor(null); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [menuFor]);

    // Release a local preview when the editor closes or swaps photos.
    useEffect(() => () => { if (draft?.preview?.startsWith('blob:')) URL.revokeObjectURL(draft.preview); }, [draft?.preview]);

    const list = banners ?? [];
    const showingOrder = list.filter(b => b.is_active).map(b => b.id);

    const toggle = async (b: Banner, next: boolean) => {
        if (busyToggle.current.has(b.id)) return;
        busyToggle.current.add(b.id);
        setBanners(prev => prev?.map(x => (x.id === b.id ? { ...x, is_active: next } : x)) ?? prev);
        const ok = await setBannerActive(b.id, next);
        busyToggle.current.delete(b.id);
        if (!ok) {
            setBanners(prev => prev?.map(x => (x.id === b.id ? { ...x, is_active: b.is_active } : x)) ?? prev);
            toast.error('Could not update the banner. Please try again.');
            return;
        }
        refreshPublicMenu(activeSite?.id);
    };

    const move = async (id: string, dir: 'up' | 'down') => {
        setMenuFor(null);
        const before = list;
        const after = moveBanner(before, id, dir);
        if (after === before) return;
        setBanners(after);
        const ok = await saveBannerOrder(orderChanges(before, after));
        if (!ok) {
            setBanners(before);
            toast.error('Could not save the new order. Please try again.');
            return;
        }
        refreshPublicMenu(activeSite?.id);
    };

    const openEditor = (b: Banner | null) => {
        setMenuFor(null);
        setDraft(b ? { id: b.id, name: b.name, description: b.description ?? '', isActive: b.is_active, imageUrl: b.image_url, file: null, preview: null } : emptyDraft);
    };

    const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !draft) return;
        const problem = bannerFileProblem(file);
        if (problem) { toast.error(problem); return; }
        setDraft({ ...draft, file, preview: URL.createObjectURL(file) });
    };

    const saveDraft = async () => {
        if (!draft || !activeSite || saving) return;
        if (!draft.name.trim()) { toast.error('Give the banner a name'); return; }
        if (!draft.file && !draft.imageUrl) { toast.error('Add a photo for the banner'); return; }
        setSaving(true);
        // Set only when this save uploaded a new file, so a failed save can release it.
        let uploaded: string | null = null;
        try {
            if (draft.file) uploaded = await uploadBannerImage(draft.file, activeSite.slug);
            const imageUrl = uploaded ?? draft.imageUrl;
            const payload = { name: draft.name, description: draft.description, imageUrl, isActive: draft.isActive };
            if (draft.id) {
                const previous = list.find(x => x.id === draft.id)?.image_url;
                if (!(await updateBanner(draft.id, payload))) throw new Error('Could not save the banner. Please try again.');
                // Saved: the photo this banner no longer shows can go.
                releaseMenuPhotos(activeSite.id, replacedPhotos(previous, imageUrl));
                setBanners(prev => prev?.map(x => (x.id === draft.id ? { ...x, name: draft.name.trim(), description: draft.description.trim() || null, image_url: imageUrl, is_active: draft.isActive } : x)) ?? prev);
                toast.success('Banner saved');
            } else {
                const created = await createBanner(activeSite.id, payload, list.length);
                if (!created) throw new Error('Could not add the banner. Please try again.');
                setBanners(prev => [...(prev ?? []), created]);
                toast.success('Banner added');
                refresh();
            }
            setDraft(null);
            refreshPublicMenu(activeSite.id);
        } catch (err) {
            releaseMenuPhotos(activeSite.id, [uploaded]);
            toast.error(err instanceof Error ? err.message : 'Could not save the banner.');
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!toDelete || deleting) return;
        setDeleting(true);
        const ok = await deleteBanner(toDelete.id);
        setDeleting(false);
        if (!ok) { toast.error('Could not delete the banner. Please try again.'); return; }
        setBanners(prev => prev?.filter(x => x.id !== toDelete.id) ?? prev);
        setToDelete(null);
        refreshPublicMenu(activeSite?.id);
        releaseMenuPhotos(activeSite?.id, [toDelete.image_url]);
        toast.success('Banner deleted');
        refresh();
    };

    const count = banners && banners.length > 0
        ? <span style={{ fontSize: 13, color: Y.muted, whiteSpace: 'nowrap' }}>{showingOrder.length} of {banners.length} showing</span>
        : null;

    return (
        <SubPage
            title="Banners"
            right={count}
            footer={banners && banners.length > 0 ? (
                <button type="button" onClick={() => openEditor(null)} className="you-press" style={primaryButton}>
                    <Icon icon="add_photo_alternate" size={22} />Add banner
                </button>
            ) : undefined}
        >
            {!banners ? (
                failed ? (
                    <Card style={{ padding: 24, textAlign: 'center' }}>
                        <p style={{ margin: '0 0 12px', fontSize: 15, color: Y.text }}>Could not load your banners.</p>
                        <button type="button" onClick={() => setAttempt(n => n + 1)} className="you-press you-focus" style={{ ...quietButton, margin: '0 auto', color: Y.brand }}>Try again</button>
                    </Card>
                ) : (
                    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <Skeleton height={20} width={260} />
                        <Skeleton height={200} radius={16} />
                        <Skeleton height={200} radius={16} />
                    </div>
                )
            ) : banners.length === 0 ? (
                <div className="you-rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '28px 8px' }}>
                    <span style={{ width: '100%', maxWidth: 358, aspectRatio: BANNER_ASPECT_CSS, borderRadius: 14, border: `2px dashed #C9C4F5`, background: Y.brandTint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon icon="photo_library" size={36} color={Y.brand} />
                    </span>
                    <h2 style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 700 }}>Add your first banner</h2>
                    <p style={{ margin: 0, fontSize: 15, lineHeight: '22px', color: Y.text, maxWidth: 320 }}>
                        It shows at the top of your menu — an offer, a new dish, a festival special.
                    </p>
                    <button type="button" onClick={() => openEditor(null)} className="you-press" style={{ ...primaryButton, maxWidth: 320, marginTop: 8 }}>
                        <Icon icon="add_photo_alternate" size={22} />Add banner
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <p style={{ margin: '0 4px', fontSize: 14, lineHeight: '20px', color: Y.text }}>
                        Customers swipe through these at the top of your menu, in this order. Tap a photo to change it.
                    </p>
                    {banners.map((b, i) => {
                        const pos = showingOrder.indexOf(b.id);
                        return (
                            <article key={b.id} className="you-rise" style={{ ...rise(i), position: 'relative', background: Y.white, border: `1px solid ${Y.line}`, borderRadius: 16 }}>
                                <button type="button" onClick={() => openEditor(b)} aria-label={`Edit ${b.name}`} className="you-press you-focus" style={{ display: 'block', width: 'calc(100% - 20px)', margin: '10px 10px 0', padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 10 }}>
                                    <Photo src={b.image_url} alt={b.name} dim={!b.is_active} />
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 6px 10px 14px' }}>
                                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span className="truncate" style={{ fontSize: 15, fontWeight: 600, color: b.is_active ? Y.ink : Y.text }}>{b.name}</span>
                                        <span style={{ fontSize: 12, fontWeight: 500, color: b.is_active ? Y.good.fg : Y.muted }}>
                                            {b.is_active ? `Showing · ${ordinal(pos + 1)}` : 'Hidden from menu'}
                                        </span>
                                    </span>
                                    <Toggle checked={b.is_active} label={`Show ${b.name} on menu`} onChange={next => toggle(b, next)} />
                                    <button type="button" aria-label={`More for ${b.name}`} aria-haspopup="menu" aria-expanded={menuFor === b.id}
                                        onClick={() => setMenuFor(menuFor === b.id ? null : b.id)} className="you-press you-focus"
                                        style={{ width: 44, height: 44, borderRadius: 22, border: 'none', background: menuFor === b.id ? '#F4F4F5' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: Y.text, cursor: 'pointer' }}>
                                        <Icon icon="more_vert" />
                                    </button>
                                </div>
                                {menuFor === b.id && (
                                    <>
                                        <div aria-hidden onClick={() => setMenuFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                                        <div role="menu" aria-label={`${b.name} actions`} className="you-pop"
                                            style={{ position: 'absolute', right: 10, bottom: 52, zIndex: 31, width: 200, background: Y.white, borderRadius: 14, border: `1px solid ${Y.lineSoft}`, boxShadow: '0 12px 32px rgba(20, 16, 60, 0.18)', padding: 6, transformOrigin: 'bottom right' }}>
                                            {[
                                                { icon: 'edit', label: 'Edit', run: () => openEditor(b), show: true },
                                                { icon: 'arrow_upward', label: 'Move up', run: () => move(b.id, 'up'), show: i > 0 },
                                                { icon: 'arrow_downward', label: 'Move down', run: () => move(b.id, 'down'), show: i < banners.length - 1 },
                                                { icon: 'delete', label: 'Delete', run: () => { setMenuFor(null); setToDelete(b); }, show: true, danger: true },
                                            ].filter(a => a.show).map(a => (
                                                <button key={a.label} type="button" role="menuitem" onClick={a.run} className="you-press you-row you-focus"
                                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 10px', borderRadius: 10, border: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 15, color: a.danger ? Y.danger : Y.ink, cursor: 'pointer', textAlign: 'left' }}>
                                                    <Icon icon={a.icon} size={20} color={a.danger ? Y.danger : Y.text} />{a.label}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}

            {/* ── Add / edit: a full-screen editor ── */}
            {draft && (
                <div role="dialog" aria-modal="true" aria-labelledby="be-title" className="you-root you-sheet"
                    style={{ position: 'fixed', inset: 0, zIndex: 210, background: Y.white, display: 'flex', flexDirection: 'column', color: Y.ink }}>
                    <YouStyles />
                    <header style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 0 6px', borderBottom: `1px solid ${Y.lineSoft}` }}>
                        <button type="button" aria-label="Close" onClick={() => !saving && setDraft(null)} className="you-press you-focus"
                            style={{ width: 44, height: 44, borderRadius: 22, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: Y.ink, cursor: 'pointer' }}>
                            <Icon icon="close" size={24} />
                        </button>
                        <h2 id="be-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{draft.id ? 'Edit banner' : 'New banner'}</h2>
                    </header>

                    <div style={{ flex: 1, overflowY: 'auto', width: '100%', maxWidth: 640, margin: '0 auto', padding: '18px 16px 24px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {draft.preview || draft.imageUrl ? (
                            <div>
                                <div style={{ position: 'relative' }}>
                                    <Photo src={draft.preview ?? draft.imageUrl} alt="Banner photo" />
                                    <label className="you-press" style={{ position: 'absolute', right: 8, bottom: 8, minHeight: 36, padding: '0 12px', borderRadius: 18, background: 'rgba(10, 10, 10, 0.72)', color: Y.white, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                        <Icon icon="swap_horiz" size={17} />Change photo
                                        <input type="file" accept="image/*" onChange={pickFile} disabled={saving} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
                                    </label>
                                </div>
                                <span style={hintStyle}>This is exactly how it shows at the top of your menu.</span>
                            </div>
                        ) : (
                            <div style={{ aspectRatio: BANNER_ASPECT_CSS, borderRadius: 12, border: '2px dashed #C9C4F5', background: Y.brandTint, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                                {[
                                    { icon: 'photo_camera', label: 'Take photo', capture: true },
                                    { icon: 'photo_library', label: 'From gallery', capture: false },
                                ].map((o, idx) => (
                                    <label key={o.label} className="you-press" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: Y.brandDeep, cursor: 'pointer', position: 'relative', borderRight: idx === 0 ? '1px solid #DDD8FA' : 'none' }}>
                                        <Icon icon={o.icon} size={26} />{o.label}
                                        <input type="file" accept="image/*" {...(o.capture ? { capture: 'environment' as const } : {})} onChange={pickFile} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
                                    </label>
                                ))}
                            </div>
                        )}

                        <div>
                            <label htmlFor="be-name" style={labelStyle}>Banner name</label>
                            <input id="be-name" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Weekend offer" maxLength={80} className="you-field" style={fieldStyle} />
                        </div>
                        <div>
                            <label htmlFor="be-note" style={labelStyle}>Short note <span style={{ fontWeight: 400, color: Y.muted }}>(optional)</span></label>
                            <textarea id="be-note" rows={3} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="e.g. 20% off on Saturdays and Sundays" maxLength={200} className="you-field"
                                style={{ ...fieldStyle, height: 'auto', padding: '12px 14px', resize: 'none', lineHeight: '22px' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48 }}>
                            <span id="be-show" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: 15, fontWeight: 600 }}>Show on menu</span>
                                <span style={{ fontSize: 12, color: Y.muted }}>Turn off to keep it for later</span>
                            </span>
                            <Toggle checked={draft.isActive} labelledBy="be-show" onChange={on => setDraft({ ...draft, isActive: on })} />
                        </div>
                    </div>

                    <div style={{ flexShrink: 0, borderTop: `1px solid ${Y.line}`, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))' }}>
                        <div style={{ maxWidth: 608, margin: '0 auto' }}>
                            <button type="button" onClick={saveDraft} disabled={saving} className="you-press" style={primaryButton}>
                                {saving ? <><Spinner size="sm" tone="onBrand" />{draft.file ? 'Uploading photo…' : 'Saving…'}</> : 'Save banner'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Sheet open={!!toDelete} onClose={() => setToDelete(null)} labelledBy="bn-delete-title" busy={deleting}>
                <h2 id="bn-delete-title" style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Delete this banner?</h2>
                <p style={{ margin: '6px 0 20px', fontSize: 15, lineHeight: '22px', color: Y.text }}>
                    “{toDelete?.name}” comes off your menu for good. To keep it for later, turn it off instead.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button type="button" onClick={confirmDelete} disabled={deleting} className="you-press" style={{ ...primaryButton, background: Y.danger }}>
                        {deleting ? <><Spinner size="sm" tone="onBrand" />Deleting…</> : 'Delete banner'}
                    </button>
                    <button type="button" data-autofocus onClick={() => setToDelete(null)} disabled={deleting} className="you-press you-focus" style={{ ...quietButton, width: '100%', minHeight: 48, color: Y.ink }}>Keep it</button>
                </div>
            </Sheet>
        </SubPage>
    );
}
