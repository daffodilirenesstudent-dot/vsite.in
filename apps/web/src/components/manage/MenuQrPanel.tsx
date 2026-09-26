'use client';

import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Spinner } from '@/components/loading';
import {
    PLACEMENTS, PLACEMENT_ORDER, DEFAULT_QR_FRACTION,
    printLayout, qrWidthMm, scanDistanceCm, formatDistance, mmToPx, pdfFileName,
    menuLinkDisplay, whatsappShareUrl,
    type Placement, type PrintMethod,
} from '@/lib/qr/printKit';
import { buildPrintPdf } from '@/lib/qr/printPdf';
import { getStyledQRBlob, getStyledQRSvgBlob, downloadBlob } from '@/lib/qr/styledQr';
import { loadImage, qrFractionOf, renderPosterCard, renderStoryImage, canvasToBlob } from '@/lib/qr/posterRender';
import {
    FOOD_POSTERS, POSTER_DESIGNS, CLASSIC_DESIGN_ID, DESIGN_W, DESIGN_H,
    designById, posterFamily, designQrFraction, designStorageKey,
    type PosterFamily,
} from '@/lib/qr/posterDesigns';
import { renderDesignPoster, posterFontsFrom } from '@/lib/qr/designRender';
import { supabase } from '@/lib/platform/db/supabase';

/**
 * The QR page for a menu-only store (NEXT_PUBLIC_QR_PRINT_KIT).
 *
 * Built around the owner's one job — get a QR onto the tables and the link in
 * front of customers — in the order they do it: see the poster, choose where
 * it goes, download a file that prints right, share the link. The download
 * button sits in the Print card, under the choices it prints; on a phone the
 * owner scrolls to it (no floating bar — owner, 2026-09-25).
 */

const A = {
    primary: '#5137EF', primaryBg: '#EEEBFD', white: '#FFFFFF', bg: '#F4F4F4',
    border: '#E4E4E7', dark: '#0A0A0A', text: '#52525C', muted: '#71717A',
};

const PLACE_ICON: Record<Placement, string> = { table: 'table_restaurant', counter: 'point_of_sale', wall: 'storefront' };
const PER_SHEET: Record<Placement, number> = { table: 4, counter: 2, wall: 1 };
const PLACE_NOUN: Record<Placement, [string, string]> = {
    table: ['table stand', 'table stands'], counter: ['counter card', 'counter cards'], wall: ['wall poster', 'wall posters'],
};

const card: React.CSSProperties = { border: `1px solid ${A.border}`, borderRadius: 14, background: A.white };
const cardHead: React.CSSProperties = { padding: '14px 20px', borderBottom: `1px solid ${A.border}` };
const h2: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600, color: A.dark };
const sub: React.CSSProperties = { margin: '2px 0 0', fontSize: 13, color: A.muted };
const label: React.CSSProperties = { margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: A.dark };
const ghostBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 40, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${A.border}`, background: A.white, color: A.dark, fontSize: 13, fontWeight: 600,
};

const cm = (mm: number) => `${Number((mm / 10).toFixed(1))}`;

type Busy = 'pdf' | 'png' | 'svg' | 'story' | null;

interface StoredDesign { family: PosterFamily; designId: string; accent: string | null }

export default function MenuQrPanel({ menuUrl, siteId, slug, storeName, posterTemplate, stickerCard }: {
    menuUrl: string;
    siteId: string;
    slug: string;
    storeName: string;
    posterTemplate: string;
    stickerCard: React.ReactNode;
}) {
    const [placement, setPlacement] = useState<Placement>('table');
    const [method, setMethod] = useState<PrintMethod>('home');
    const [busy, setBusy] = useState<Busy>(null);
    const [copied, setCopied] = useState(false);
    const [qrFraction, setQrFraction] = useState(DEFAULT_QR_FRACTION);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewFailed, setPreviewFailed] = useState(false);
    const templateRef = useRef<HTMLImageElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);

    // ── Poster design (NEXT_PUBLIC_FOOD_POSTERS) ──
    // The family starts from the store's business type; the choice itself is
    // remembered per store on this device (no schema change).
    const [family, setFamily] = useState<PosterFamily>('restaurant');
    const [designId, setDesignId] = useState<string>(FOOD_POSTERS ? POSTER_DESIGNS[0].id : CLASSIC_DESIGN_ID);
    const [accent, setAccent] = useState<string | null>(null);
    const [thumbs, setThumbs] = useState<Record<string, string>>({});
    const design = FOOD_POSTERS ? designById(designId) : null;
    const accentNow = design ? (accent ?? design.accent) : null;

    useEffect(() => {
        if (!FOOD_POSTERS || !siteId) return;
        let stored: StoredDesign | null = null;
        try {
            const raw = localStorage.getItem(designStorageKey(siteId));
            if (raw) stored = JSON.parse(raw) as StoredDesign;
        } catch { /* private window or cleared storage: start fresh */ }
        if (stored && (stored.designId === CLASSIC_DESIGN_ID || designById(stored.designId))) {
            setFamily(stored.family === 'cafe' ? 'cafe' : 'restaurant');
            setDesignId(stored.designId);
            setAccent(stored.accent);
            return;
        }
        let cancelled = false;
        (async () => {
            const { data } = await supabase.from('sites').select('business_type').eq('id', siteId).maybeSingle();
            if (cancelled) return;
            const fam = posterFamily((data as { business_type?: string | null } | null)?.business_type);
            setFamily(fam);
            setDesignId(POSTER_DESIGNS.find(d => d.family === fam)?.id ?? POSTER_DESIGNS[0].id);
        })();
        return () => { cancelled = true; };
    }, [siteId]);

    function choose(next: Partial<StoredDesign>) {
        const value: StoredDesign = { family, designId, accent, ...next };
        setFamily(value.family); setDesignId(value.designId); setAccent(value.accent);
        try { localStorage.setItem(designStorageKey(siteId), JSON.stringify(value)); } catch { /* not remembered; still applied */ }
    }

    const qrFor = (px: number) => getStyledQRBlob(menuUrl, undefined, px);

    async function template(): Promise<HTMLImageElement> {
        if (!templateRef.current) templateRef.current = await loadImage(posterTemplate);
        return templateRef.current;
    }

    /** The poster's height for a given width, in the chosen design's own shape. */
    async function posterHeight(w: number, id: string = designId): Promise<number> {
        if (FOOD_POSTERS && designById(id)) return Math.round(w * DESIGN_H / DESIGN_W);
        const t = await template();
        return Math.round(w * t.naturalHeight / t.naturalWidth);
    }

    /** Every poster the page makes (preview, tiles, PDF, Status image) comes through here. */
    async function renderCard(widthPx: number, heightPx: number, pick?: { id: string; accent: string | null }): Promise<HTMLCanvasElement> {
        const d = pick ? designById(pick.id) : design;
        if (FOOD_POSTERS && d) {
            return renderDesignPoster({
                design: d, accent: (pick ? pick.accent : accentNow) ?? d.accent, storeName,
                qrBlobFor: qrFor, widthPx, heightPx, fonts: posterFontsFrom(rootRef.current ?? document.body),
            });
        }
        return renderPosterCard({ template: await template(), qrBlobFor: qrFor, widthPx, heightPx });
    }

    useEffect(() => {
        let cancelled = false;
        let url: string | null = null;
        templateRef.current = null;
        setPreviewUrl(null);
        setPreviewFailed(false);
        (async () => {
            try {
                if (design) setQrFraction(designQrFraction(design));
                else setQrFraction(qrFractionOf(await template()));
                const w = 720;
                const canvas = await renderCard(w, await posterHeight(w));
                const blob = await canvasToBlob(canvas);
                if (cancelled) return;
                url = URL.createObjectURL(blob);
                setPreviewUrl(url);
            } catch {
                if (!cancelled) setPreviewFailed(true);
            }
        })();
        return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [menuUrl, posterTemplate, designId, accentNow, storeName]);

    // Small pictures for the design choices of the current family.
    useEffect(() => {
        if (!FOOD_POSTERS) return;
        let cancelled = false;
        const made: string[] = [];
        const ids = [...POSTER_DESIGNS.filter(d => d.family === family).map(d => d.id), CLASSIC_DESIGN_ID];
        (async () => {
            for (const id of ids) {
                try {
                    const w = 300;
                    const canvas = await renderCard(w, await posterHeight(w, id), { id, accent: null });
                    const u = URL.createObjectURL(await canvasToBlob(canvas));
                    made.push(u);
                    if (cancelled) return;
                    setThumbs(t => ({ ...t, [id]: u }));
                } catch { /* the tile shows its name without a picture */ }
            }
        })();
        return () => { cancelled = true; made.forEach(u => URL.revokeObjectURL(u)); setThumbs({}); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [family, menuUrl, storeName]);

    const layout = printLayout(placement, method);
    const perSheet = PER_SHEET[placement];
    const summary = method === 'home'
        ? `${perSheet} ${PLACE_NOUN[placement][perSheet > 1 ? 1 : 0]} on one A4 sheet. ${perSheet > 1 ? 'Cut along' : 'Trim along'} the dashed lines.`
        : `${PLACEMENTS[placement].paper} at exact size with 3 mm bleed. Give this file to the print shop.`;

    async function downloadPdf() {
        setBusy('pdf');
        try {
            const c = layout.cards[0];
            const canvas = await renderCard(mmToPx(c.w), mmToPx(c.h));
            const pdf = await buildPrintPdf(layout, canvas.toDataURL('image/png'));
            downloadBlob(new Blob([pdf], { type: 'application/pdf' }), pdfFileName(slug, placement, method));
            toast.success('PDF downloaded');
        } catch {
            toast.error('Could not make the PDF. Please try again.');
        } finally { setBusy(null); }
    }

    async function downloadQr(format: 'png' | 'svg') {
        setBusy(format);
        try {
            const blob = format === 'png' ? await getStyledQRBlob(menuUrl, undefined, 1000) : await getStyledQRSvgBlob(menuUrl, 1000);
            if (!blob) throw new Error('empty');
            downloadBlob(blob, `${slug}-qr.${format}`);
        } catch {
            toast.error('Could not make the QR image. Please try again.');
        } finally { setBusy(null); }
    }

    async function statusImage() {
        setBusy('story');
        try {
            const w = 880;
            const poster = await renderCard(w, await posterHeight(w));
            const blob = await renderStoryImage(poster);
            const file = new File([blob], `${slug}-whatsapp-status.png`, { type: 'image/png' });
            // On a phone, hand it straight to the share sheet (WhatsApp Status is
            // one tap from there); everywhere else, download it.
            const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
            if (touch && navigator.canShare?.({ files: [file] })) {
                try { await navigator.share({ files: [file], title: `${storeName} menu` }); }
                catch (err) { if ((err as Error).name !== 'AbortError') throw err; }
            } else {
                downloadBlob(blob, file.name);
            }
        } catch {
            toast.error('Could not make the Status image. Please try again.');
        } finally { setBusy(null); }
    }

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(menuUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Could not copy. Press and hold the link to copy it.');
        }
    }

    const pdfButton = (
        <button
            type="button"
            onClick={downloadPdf}
            disabled={busy !== null}
            style={{
                width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: A.primary, color: '#fff', border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
                opacity: busy && busy !== 'pdf' ? 0.7 : 1,
                boxShadow: '0 6px 18px rgba(81, 55, 239, 0.28)',
            }}
        >
            {busy === 'pdf'
                ? <><Spinner size="sm" tone="onBrand" />Making your PDF…</>
                : <><span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>picture_as_pdf</span>Download PDF</>}
        </button>
    );

    return (
        <div className="qrk-root" ref={rootRef}>
            <style>{`
                .qrk-grid { display: grid; grid-template-columns: minmax(260px, 380px) minmax(0, 1fr); gap: 24px; align-items: start; }
                .qrk-poster { position: sticky; top: 24px; }
                .qrk-poster-img { display: block; width: auto; max-width: 100%; max-height: min(62vh, 560px); margin: 0 auto; border-radius: 10px; }
                .qrk-side { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
                .qrk-choice:focus-visible, .qrk-seg:focus-visible { outline: 2px solid ${A.primary}; outline-offset: 2px; }
                /* Icons are clipped to 1em app-wide; in a squeezed flex row they
                   would shrink to a sliver (the WhatsApp one did) — so they don't. */
                .qrk-root .material-symbols-outlined { flex-shrink: 0; }
                .qrk-designs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
                .qrk-share { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
                @media (max-width: 480px) { .qrk-share { grid-template-columns: minmax(0, 1fr); } }
                @media (max-width: 960px) {
                    .qrk-grid { grid-template-columns: minmax(0, 1fr); }
                    .qrk-poster { position: static; }
                    .qrk-poster-img { max-height: 42vh; }
                }
            `}</style>

            <div className="qrk-grid">
                {/* ── Poster ── */}
                <div className="qrk-poster">
                    <div style={card}>
                        <div style={cardHead}>
                            <p style={h2}>Your QR poster</p>
                            <p style={sub}>What customers see on the table</p>
                        </div>
                        <div style={{ padding: 16 }}>
                            <div style={{ borderRadius: 10, background: A.bg, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {previewUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className="qrk-poster-img" src={previewUrl} alt={`QR poster for ${storeName}`} />
                                ) : previewFailed ? (
                                    <p style={{ margin: 0, padding: 24, fontSize: 13, color: A.muted, textAlign: 'center' }}>The preview could not load. Downloads still work.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '40px 0' }}>
                                        <Spinner size="md" tone="brand" />
                                        <p style={{ margin: 0, fontSize: 13, color: A.muted }}>Preparing your poster…</p>
                                    </div>
                                )}
                            </div>
                            <p className="flex items-center justify-center gap-1" style={{ margin: '10px 0 0', fontSize: 12, color: A.text, textAlign: 'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: A.primary }} aria-hidden>smartphone</span>
                                Test it first: point your phone camera at this poster.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="qrk-side">
                    {/* ── Poster design (food posters) ── */}
                    {FOOD_POSTERS && (
                        <div style={card}>
                            <div style={cardHead}>
                                <p style={h2}>Poster design</p>
                                <p style={sub}>Food around the code tells diners it opens your menu</p>
                            </div>
                            <div style={{ padding: '16px 20px 20px' }}>
                                <div role="radiogroup" aria-label="Kind of place" className="grid grid-cols-2" style={{ padding: 3, gap: 3, borderRadius: 10, background: '#F4F4F5', marginBottom: 14 }}>
                                    {([['restaurant', 'Restaurant', 'restaurant'], ['cafe', 'Café', 'local_cafe']] as const).map(([f, text, icon]) => {
                                        const active = family === f;
                                        return (
                                            <button
                                                key={f}
                                                type="button"
                                                role="radio"
                                                aria-checked={active}
                                                className="qrk-seg"
                                                onClick={() => choose({ family: f, designId: POSTER_DESIGNS.find(d => d.family === f)?.id ?? CLASSIC_DESIGN_ID, accent: null })}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                    border: 'none', borderRadius: 8, padding: '9px 6px', cursor: 'pointer',
                                                    fontSize: 13, fontWeight: 600,
                                                    color: active ? A.dark : A.muted,
                                                    background: active ? A.white : 'transparent',
                                                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                                                }}
                                            >
                                                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>{icon}</span>
                                                {text}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div role="radiogroup" aria-label="Poster design" className="qrk-designs">
                                    {[...POSTER_DESIGNS.filter(d => d.family === family), null].map(d => {
                                        const id = d ? d.id : CLASSIC_DESIGN_ID;
                                        const active = designId === id;
                                        return (
                                            <button
                                                key={id}
                                                type="button"
                                                role="radio"
                                                aria-checked={active}
                                                className="qrk-choice"
                                                onClick={() => choose({ designId: id, accent: null })}
                                                style={{
                                                    display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6,
                                                    padding: active ? 5 : 6, borderRadius: 12, cursor: 'pointer',
                                                    border: active ? `2px solid ${A.primary}` : `1px solid ${A.border}`,
                                                    background: active ? A.primaryBg : A.white,
                                                }}
                                            >
                                                <span style={{ display: 'block', aspectRatio: '559 / 794', borderRadius: 8, overflow: 'hidden', background: A.bg }}>
                                                    {thumbs[id] && (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={thumbs[id]} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    )}
                                                </span>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: A.dark, textAlign: 'center' }}>{d ? d.label : 'Current poster'}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {design && (
                                    <div className="flex items-center" style={{ gap: 12, marginTop: 14 }}>
                                        <span id="qrk-colour" style={{ fontSize: 13, fontWeight: 600, color: A.dark }}>Colour</span>
                                        <div role="radiogroup" aria-labelledby="qrk-colour" className="flex" style={{ gap: 10 }}>
                                            {design.accentOptions.map(c => {
                                                const active = accentNow === c;
                                                return (
                                                    <button
                                                        key={c}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={active}
                                                        aria-label={`Colour ${c}`}
                                                        className="qrk-choice"
                                                        onClick={() => choose({ accent: c })}
                                                        style={{
                                                            width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer', background: c,
                                                            boxShadow: active ? `0 0 0 2px #FFFFFF, 0 0 0 4px ${c}` : 'inset 0 0 0 1px rgba(0,0,0,0.12)',
                                                        }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Print ── */}
                    <div style={card}>
                        <div style={cardHead}>
                            <p style={h2}>Print it</p>
                            <p style={sub}>Pick where it goes and we size it to scan from there</p>
                        </div>
                        <div style={{ padding: '16px 20px 20px' }}>
                            <p id="qrk-place" style={label}>Where will it go?</p>
                            <div role="radiogroup" aria-labelledby="qrk-place" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                                {PLACEMENT_ORDER.map(p => {
                                    const active = placement === p;
                                    const info = PLACEMENTS[p];
                                    const reach = formatDistance(scanDistanceCm(qrWidthMm(printLayout(p, method), qrFraction)));
                                    return (
                                        <button
                                            key={p}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            className="qrk-choice"
                                            onClick={() => setPlacement(p)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
                                                padding: active ? '11px 13px' : '12px 14px', borderRadius: 10,
                                                border: active ? `2px solid ${A.primary}` : `1px solid ${A.border}`,
                                                background: active ? A.primaryBg : A.white,
                                                transition: 'background 0.15s, border-color 0.15s',
                                            }}
                                        >
                                            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 22, color: active ? A.primary : A.muted, flexShrink: 0 }}>{PLACE_ICON[p]}</span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: A.dark }}>{info.label}</span>
                                                <span style={{ display: 'block', fontSize: 12, color: A.muted, marginTop: 1 }}>{info.hint}</span>
                                            </span>
                                            <span style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: A.dark }}>{info.paper} · {cm(info.trimMm.w)} × {cm(info.trimMm.h)} cm</span>
                                                <span style={{ display: 'block', fontSize: 12, color: A.muted, marginTop: 1 }}>Scans from {reach}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <p id="qrk-method" style={label}>How will you print it?</p>
                            <div role="radiogroup" aria-labelledby="qrk-method" className="grid grid-cols-2" style={{ padding: 3, gap: 3, borderRadius: 10, background: '#F4F4F5', marginBottom: 10 }}>
                                {([['home', 'Home printer', 'print'], ['shop', 'Print shop', 'store']] as const).map(([m, text, icon]) => {
                                    const active = method === m;
                                    return (
                                        <button
                                            key={m}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            className="qrk-seg"
                                            onClick={() => setMethod(m)}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                border: 'none', borderRadius: 8, padding: '9px 6px', cursor: 'pointer',
                                                fontSize: 13, fontWeight: 600,
                                                color: active ? A.dark : A.muted,
                                                background: active ? A.white : 'transparent',
                                                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                                            }}
                                        >
                                            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>{icon}</span>
                                            {text}
                                        </button>
                                    );
                                })}
                            </div>
                            <p aria-live="polite" style={{ margin: '0 0 16px', fontSize: 12, color: A.text, lineHeight: '17px' }}>{summary}</p>

                            {pdfButton}

                            <div className="flex items-center flex-wrap" style={{ gap: 8, marginTop: 14, fontSize: 12, color: A.muted }}>
                                <span>QR code only:</span>
                                <button type="button" onClick={() => downloadQr('png')} disabled={busy !== null} style={{ ...ghostBtn, minHeight: 34, padding: '5px 12px', fontSize: 12 }}>
                                    {busy === 'png' ? <Spinner size="xs" tone="current" /> : <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>download</span>}
                                    PNG
                                </button>
                                <button type="button" onClick={() => downloadQr('svg')} disabled={busy !== null} style={{ ...ghostBtn, minHeight: 34, padding: '5px 12px', fontSize: 12 }}>
                                    {busy === 'svg' ? <Spinner size="xs" tone="current" /> : <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>download</span>}
                                    SVG
                                </button>
                                <span>for designers and sign makers</span>
                            </div>
                        </div>
                    </div>

                    {/* ── Share ── */}
                    <div style={card}>
                        <div style={cardHead}>
                            <p style={h2}>Share your menu link</p>
                            <p style={sub}>For WhatsApp, Instagram and Google Maps</p>
                        </div>
                        <div style={{ padding: '16px 20px 20px' }}>
                            <div className="flex items-center" style={{ gap: 8, marginBottom: 12 }}>
                                <input
                                    readOnly
                                    value={menuLinkDisplay(menuUrl)}
                                    aria-label="Your menu link"
                                    onFocus={e => e.currentTarget.select()}
                                    style={{ flex: 1, minWidth: 0, minHeight: 40, padding: '0 12px', borderRadius: 8, border: `1px solid ${A.border}`, background: A.bg, fontSize: 13, color: A.dark, outline: 'none' }}
                                />
                                <button type="button" onClick={copyLink} style={{ ...ghostBtn, flexShrink: 0, color: copied ? '#16794C' : A.dark, borderColor: copied ? '#B7E2C8' : A.border }}>
                                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>{copied ? 'check' : 'content_copy'}</span>
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                            <span className="sr-only" aria-live="polite">{copied ? 'Link copied' : ''}</span>

                            <div className="qrk-share">
                                <a href={whatsappShareUrl(menuUrl, storeName)} target="_blank" rel="noopener noreferrer" style={{ ...ghostBtn, textDecoration: 'none' }}>
                                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17, color: '#16794C' }}>chat</span>
                                    WhatsApp
                                </a>
                                <a href={menuUrl} target="_blank" rel="noopener noreferrer" style={{ ...ghostBtn, textDecoration: 'none' }}>
                                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>open_in_new</span>
                                    Open menu
                                </a>
                                <button type="button" onClick={statusImage} disabled={busy !== null} style={ghostBtn}>
                                    {busy === 'story' ? <Spinner size="xs" tone="current" /> : <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>wallpaper</span>}
                                    Status image
                                </button>
                            </div>

                            <details style={{ marginTop: 14, borderTop: `1px solid ${A.border}`, paddingTop: 12 }}>
                                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: A.dark, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, color: A.primary }}>map</span>
                                    Add it to Google Maps
                                </summary>
                                <ol style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13, color: A.text, lineHeight: '20px' }}>
                                    <li>Open your business on Google Maps and tap <strong>Edit profile</strong>.</li>
                                    <li>Find <strong>Menu</strong>, then <strong>Menu link</strong>.</li>
                                    <li>Paste your link and save. It can take a day or two to show.</li>
                                </ol>
                                <a href="https://business.google.com/" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 13, fontWeight: 600, color: A.primary, textDecoration: 'none' }}>
                                    Open Google Business Profile
                                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>open_in_new</span>
                                </a>
                            </details>
                        </div>
                    </div>

                    {stickerCard}
                </div>
            </div>
        </div>
    );
}
