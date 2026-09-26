'use client';

import React, { useEffect, useRef } from 'react';
import { Y } from './YouStyles';

/**
 * A bottom sheet on phones, a centred card from 768 px. For short moments —
 * confirmations, a menu of actions — never for a whole form.
 *
 * Escape and a tap on the dimmed page close it, unless `busy` (a save or a
 * sign-out is in flight). Focus moves into the sheet on open and back to what
 * opened it on close.
 */
export default function Sheet({ open, onClose, labelledBy, busy = false, children }: {
    open: boolean;
    onClose: () => void;
    labelledBy: string;
    busy?: boolean;
    children: React.ReactNode;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const busyRef = useRef(busy);
    busyRef.current = busy;

    useEffect(() => {
        if (!open) return;
        const opener = document.activeElement as HTMLElement | null;
        const focusTimer = window.setTimeout(() => {
            panelRef.current?.querySelector<HTMLElement>('[data-autofocus], button, a[href], input, textarea')?.focus();
        }, 30);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !busyRef.current) onCloseRef.current();
        };
        document.addEventListener('keydown', onKey);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', onKey);
            opener?.focus?.();
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            role="presentation"
            onClick={() => { if (!busy) onClose(); }}
            className="you-fade you-root fixed inset-0 flex items-end md:items-center justify-center"
            style={{ zIndex: 200, background: 'rgba(10, 10, 20, 0.48)' }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                onClick={e => e.stopPropagation()}
                className="you-sheet w-full md:rounded-3xl"
                style={{
                    maxWidth: 440, maxHeight: '92vh', overflowY: 'auto', boxSizing: 'border-box',
                    background: Y.white, borderRadius: '24px 24px 0 0',
                    padding: '10px 20px calc(24px + env(safe-area-inset-bottom))',
                    fontFamily: 'inherit', color: Y.ink,
                }}
            >
                <span aria-hidden className="md:hidden" style={{ display: 'block', width: 40, height: 4, borderRadius: 2, background: Y.field, margin: '0 auto 14px' }} />
                {children}
            </div>
        </div>
    );
}
