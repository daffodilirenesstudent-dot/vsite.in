'use client';

import React, { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import YouStyles, { Y } from './YouStyles';
import { Icon } from './YouKit';

/**
 * The frame of every screen behind the You tab: a back header, the content,
 * and an optional footer that stays at the bottom (a Save button). On phones
 * the dashboard header and bottom bar are hidden on these routes
 * (ManageLayoutClient), so this is the whole screen.
 *
 * Back goes BACK when the owner came from the You page — so the phone's own
 * back gesture and this arrow agree — and to the You page when they landed
 * here directly (a reload, a shared link).
 */

let openedFromYou = false;

/** Call when a You-page row is tapped. */
export function markOpenedFromYou() {
    openedFromYou = true;
}

export default function SubPage({ title, right, footer, onBack, children }: {
    title: string;
    /** Something small on the right of the header — a "Saved" pill, a count. */
    right?: React.ReactNode;
    footer?: React.ReactNode;
    /** Intercept back (unsaved changes): call `leave` to actually go. */
    onBack?: (leave: () => void) => void;
    children: React.ReactNode;
}) {
    const router = useRouter();
    // Read once per mount, then reset, so a later direct visit is not mistaken for one.
    const fromYou = useRef<boolean | null>(null);
    if (fromYou.current === null) {
        fromYou.current = openedFromYou;
        openedFromYou = false;
    }

    const leave = useCallback(() => {
        if (fromYou.current) router.back();
        else router.replace('/manage/you');
    }, [router]);

    return (
        // Full viewport height on phones (the shell hides its header there), so
        // a short screen still keeps its footer at the bottom edge.
        <div className="you-root you-slide min-h-[100dvh] md:min-h-0" style={{ background: Y.page, display: 'flex', flexDirection: 'column', color: Y.ink }}>
            <YouStyles />
            <header
                style={{
                    position: 'sticky', top: 0, zIndex: 20, height: 56, flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px 0 6px',
                    background: 'rgba(255, 255, 255, 0.94)', backdropFilter: 'saturate(180%) blur(12px)',
                    WebkitBackdropFilter: 'saturate(180%) blur(12px)', borderBottom: `1px solid ${Y.lineSoft}`,
                }}
            >
                <button
                    type="button"
                    aria-label="Back"
                    onClick={() => (onBack ? onBack(leave) : leave())}
                    className="you-press you-focus"
                    style={{ width: 44, height: 44, borderRadius: 22, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: Y.ink, cursor: 'pointer' }}
                >
                    <Icon icon="arrow_back" size={24} />
                </button>
                <h1 className="truncate" style={{ margin: 0, fontSize: 18, fontWeight: 600, flex: 1, minWidth: 0 }}>{title}</h1>
                {right}
            </header>

            <div style={{ flex: 1, width: '100%', maxWidth: 640, margin: '0 auto', padding: '16px 16px 28px', boxSizing: 'border-box' }}>
                {children}
            </div>

            {footer && (
                <div
                    style={{
                        position: 'sticky', bottom: 0, zIndex: 20, background: Y.white,
                        borderTop: `1px solid ${Y.line}`, boxShadow: '0 -6px 20px rgba(20, 16, 60, 0.06)',
                        padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
                    }}
                >
                    <div style={{ maxWidth: 608, margin: '0 auto' }}>{footer}</div>
                </div>
            )}
        </div>
    );
}
