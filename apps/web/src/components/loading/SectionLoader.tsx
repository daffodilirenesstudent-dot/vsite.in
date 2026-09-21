'use client';

import React from 'react';
import Spinner from './Spinner';

/**
 * The region-level loading states: a panel, a route, and a blocking overlay.
 *
 * These exist so "centre a spinner in a box" stops being rewritten. It was
 * written a dozen times across the dashboard, each with its own padding, its
 * own min-height and its own idea of whether to show text — which is why the
 * settings page settled at 240px tall and the inventory page at 400px, and why
 * four screens said "Loading..." while the rest said nothing.
 *
 * ── On the message ──────────────────────────────────────────────────────────
 * "Loading..." tells the owner nothing they can't already see. Say what is
 * being fetched — "Loading your menu" — or say nothing and let the spinner do
 * its job. The `message` prop is optional for exactly that reason, and the
 * copy that ships with each call site names the thing being loaded.
 *
 * These announce (the spinner carries `label`), because here the spinner IS the
 * only indication that anything is happening.
 */

export interface SectionLoaderProps {
    /** Names what is loading, e.g. "Loading your menu". Omit for a bare spinner. */
    message?: string;
    /** Vertical space the loader holds while it waits. */
    minHeight?: number | string;
    className?: string;
    style?: React.CSSProperties;
}

/** A panel, card or table body that is still resolving. */
export function SectionLoader({
    message,
    minHeight = 220,
    className,
    style,
}: SectionLoaderProps) {
    return (
        <div
            className={className}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                minHeight,
                width: '100%',
                ...style,
            }}
        >
            <Spinner size="lg" tone="brand" label={message ?? 'Loading'} />
            {message && (
                <p style={{ margin: 0, fontSize: 13, color: '#71717A', textAlign: 'center' }}>
                    {message}
                </p>
            )}
        </div>
    );
}

/** A whole route that has nothing to show yet. Fills the viewport. */
export function PageLoader({ message, style }: { message?: string; style?: React.CSSProperties }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                minHeight: '100dvh',
                width: '100%',
                ...style,
            }}
        >
            <Spinner size="xl" tone="brand" label={message ?? 'Loading'} />
            {message && (
                <p style={{ margin: 0, fontSize: 14, color: '#71717A', textAlign: 'center' }}>
                    {message}
                </p>
            )}
        </div>
    );
}

/**
 * Covers content that is being replaced, rather than content that was never
 * there. The scrim keeps the stale data visible underneath — on a slow 4G
 * connection that is reassuring, where a blank panel reads as data loss.
 */
export function LoadingOverlay({
    message,
    rounded = 12,
}: {
    message?: string;
    rounded?: number;
}) {
    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                zIndex: 20,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                borderRadius: rounded,
                background: 'rgba(255, 255, 255, 0.72)',
                backdropFilter: 'blur(2px)',
                WebkitBackdropFilter: 'blur(2px)',
            }}
        >
            <Spinner size="md" tone="brand" label={message ?? 'Loading'} />
            {message && (
                <p style={{ margin: 0, fontSize: 13, color: '#52525C', fontWeight: 500 }}>
                    {message}
                </p>
            )}
        </div>
    );
}

export default SectionLoader;
