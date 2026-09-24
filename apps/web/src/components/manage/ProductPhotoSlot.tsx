'use client';

import React, { useState } from 'react';
import {
    normalizeDishQuery,
    SUGGEST_MIN_CHARS,
    type PhotoSource,
    type SuggestState,
} from '@/lib/menu/photoSuggest';

/**
 * The photo slot in the Add Product drawer (smart layout).
 *
 * One fixed height for every state — empty, searching, suggested, own — so the
 * form below never jumps when a photo arrives. A suggested photo develops in
 * (globals.css, "Photo suggestion") only after this <img> has decoded; a
 * product's saved photo or the owner's upload just appears, because the owner
 * put it there and nothing needs announcing.
 */

const SLOT_HEIGHT = 188;

const btn: React.CSSProperties = {
    border: '1px solid #E4E4E7', borderRadius: 8, padding: '6px 14px',
    fontSize: 13, fontWeight: 600, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer',
};
const link: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0,
    fontSize: 13, fontWeight: 600, color: '#5137EF', background: 'none', border: 'none', cursor: 'pointer',
};

function SlotImage({ url, alt, reveal }: { url: string; alt: string; reveal: boolean }) {
    const [ready, setReady] = useState(false);
    const layer = reveal ? (ready ? 'vs-photo-reveal' : 'vs-photo-pending') : '';

    return (
        <>
            <div className={layer} style={{ position: 'absolute', inset: 0 }}>
                {/* The same photo, blurred, fills the sides: the dish is shown whole
                    (contain) instead of cropped to a wide strip it will never appear as. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(18px) saturate(1.1)', transform: 'scale(1.15)', opacity: 0.5 }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={url}
                    alt={alt}
                    onLoad={e => {
                        const img = e.currentTarget;
                        img.decode().catch(() => undefined).then(() => setReady(true));
                    }}
                    onError={() => setReady(true)}
                    style={{ position: 'relative', width: '100%', height: '100%', objectFit: 'contain' }}
                />
            </div>
            {reveal && ready && <span className="vs-photo-sheen" aria-hidden />}
        </>
    );
}

export default function ProductPhotoSlot({
    imageUrl,
    source,
    dishName,
    suggest,
    dismissed,
    reveal,
    uploadHint,
    onPick,
    onRemove,
    onFind,
}: {
    imageUrl: string | null;
    source: PhotoSource;
    dishName: string;
    suggest: SuggestState;
    dismissed: boolean;
    /** Animate this photo in: it just arrived from the library. */
    reveal: boolean;
    uploadHint: string;
    onPick: () => void;
    onRemove: () => void;
    onFind: () => void;
}) {
    const name = dishName.trim();
    const named = normalizeDishQuery(name).length >= SUGGEST_MIN_CHARS;
    const searching = suggest.status === 'searching' && !imageUrl;
    const noMatch = !imageUrl && named && suggest.status === 'none' && suggest.query === normalizeDishQuery(name);

    const announcement =
        searching ? `Finding a photo for ${name}`
        : imageUrl && source === 'library' ? `Suggested photo added for ${name}. Keep it, upload your own, or remove it.`
        : noMatch ? `No library photo for ${name}. Upload your own.`
        : '';

    return (
        <div>
            <div
                className={`relative overflow-hidden${searching ? ' vs-skeleton vs-skeleton-brand' : ''}`}
                onClick={() => { if (!imageUrl && !searching) onPick(); }}
                style={{
                    height: SLOT_HEIGHT,
                    borderRadius: 12,
                    border: imageUrl ? '1px solid #E4E4E7' : searching ? '1.5px solid #DCD5FF' : '1.5px dashed #C4C4C4',
                    background: imageUrl ? '#F4F3F8' : searching ? undefined : '#FAFAFA',
                    cursor: imageUrl || searching ? 'default' : 'pointer',
                    transition: 'border-color 0.2s',
                }}
            >
                {imageUrl ? (
                    <>
                        <SlotImage key={imageUrl} url={imageUrl} reveal={reveal} alt={source === 'library' ? `Suggested photo for ${name}` : `Photo of ${name || 'the dish'}`} />
                        {source === 'library' && (
                            <span
                                className={reveal ? 'vs-photo-settle' : undefined}
                                style={{
                                    position: 'absolute', top: 10, left: 10,
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '4px 10px 4px 8px', borderRadius: 999,
                                    background: 'rgba(255,255,255,0.92)', boxShadow: '0 1px 4px rgba(20,16,60,0.12)',
                                    fontSize: 12, fontWeight: 600, color: '#5137EF',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>auto_awesome</span>
                                Suggested photo
                            </span>
                        )}
                    </>
                ) : searching ? (
                    <div className="flex flex-col items-center justify-center text-center" style={{ height: '100%', padding: '0 16px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#5137EF', marginBottom: 8 }} aria-hidden>auto_awesome</span>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#3B2BB8' }}>Finding a photo for {name}…</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-center" style={{ height: '100%', padding: '0 16px' }}>
                        <div className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: '50%', background: '#F0F0F0', marginBottom: 8 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#71717A' }} aria-hidden>add_photo_alternate</span>
                        </div>
                        <p className="font-semibold text-[#0A0A0A]" style={{ fontSize: 14, marginBottom: 2 }}>Add a photo of the dish</p>
                        <p className="text-[#6B6A7B]" style={{ fontSize: 12, marginBottom: 10 }}>{uploadHint}</p>
                        <button type="button" onClick={e => { e.stopPropagation(); onPick(); }} className="hover:bg-neutral-50 transition-colors" style={btn}>Choose file</button>
                    </div>
                )}
            </div>

            {/* One row under the slot, the same height in every state. */}
            <div className="flex items-center justify-between gap-3" style={{ minHeight: 34, marginTop: 8 }}>
                {imageUrl && source === 'library' ? (
                    <>
                        <p className={reveal ? 'vs-photo-settle' : undefined} style={{ fontSize: 12, color: '#6B6A7B', lineHeight: '16px' }}>From our photo library. Customers see this on your menu.</p>
                        <div className="flex items-center gap-2 shrink-0">
                            <button type="button" onClick={onPick} className="hover:bg-neutral-50 transition-colors" style={btn}>Upload your own</button>
                            <button type="button" onClick={onRemove} className="hover:bg-neutral-50 transition-colors" style={{ ...btn, color: '#52525C' }}>Remove</button>
                        </div>
                    </>
                ) : imageUrl ? (
                    <button type="button" onClick={onPick} className="hover:bg-neutral-50 transition-colors" style={btn}>Change photo</button>
                ) : searching ? (
                    <span />
                ) : noMatch ? (
                    <p style={{ fontSize: 12, color: '#6B6A7B' }}>No library photo for this dish yet. Upload your own.</p>
                ) : dismissed && named ? (
                    <button type="button" onClick={onFind} style={link}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>auto_awesome</span>
                        Find a photo in our library
                    </button>
                ) : (
                    <p className="flex items-center gap-1" style={{ fontSize: 12, color: '#6B6A7B' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#5137EF' }} aria-hidden>auto_awesome</span>
                        Name the dish and we&apos;ll suggest a photo from our library.
                    </p>
                )}
            </div>

            <p className="sr-only" aria-live="polite">{announcement}</p>
        </div>
    );
}
