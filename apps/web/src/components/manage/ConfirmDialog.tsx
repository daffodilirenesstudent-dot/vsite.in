'use client';

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * A yes/no question before something the owner cannot quietly undo.
 *
 * Focus starts on the safe choice, so a stray Enter keeps things as they were,
 * and Escape or a tap outside means "no". Portaled to <body> so the phone's
 * bottom nav can never paint over the buttons.
 */
export default function ConfirmDialog({
    open,
    title,
    body,
    confirmLabel,
    cancelLabel = 'Cancel',
    tone = 'danger',
    busy = false,
    onConfirm,
    onCancel,
}: {
    open: boolean;
    title: string;
    body: React.ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: 'danger' | 'primary';
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const titleId = useId();
    const bodyId = useId();
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement as HTMLElement | null;
        cancelRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            previous?.focus?.();
        };
    }, [open, onCancel]);

    if (!open || typeof document === 'undefined') return null;

    const confirmBg = tone === 'danger' ? '#DC2626' : '#5137EF';

    return createPortal(
        <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.35)', zIndex: 110 }}
            onClick={onCancel}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={bodyId}
                className="bg-white"
                style={{ width: '100%', maxWidth: 400, borderRadius: 16, padding: '24px 22px 20px', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}
                onClick={e => e.stopPropagation()}
            >
                <h2 id={titleId} style={{ fontSize: 18, lineHeight: '26px', fontWeight: 600, color: '#0A0A0A', margin: 0 }}>{title}</h2>
                <div id={bodyId} style={{ fontSize: 14, lineHeight: '21px', color: '#52525C', marginTop: 8 }}>{body}</div>
                <div className="flex items-center gap-3" style={{ marginTop: 20 }}>
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={onCancel}
                        className="flex-1 hover:bg-neutral-50 transition-colors"
                        style={{ minHeight: 44, border: '1px solid #E4E4E7', borderRadius: 10, fontSize: 14, fontWeight: 500, color: '#0A0A0A', background: '#FFFFFF', cursor: 'pointer' }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className="flex-1 hover:opacity-90 transition-opacity"
                        style={{ minHeight: 44, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#FFFFFF', background: confirmBg, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
