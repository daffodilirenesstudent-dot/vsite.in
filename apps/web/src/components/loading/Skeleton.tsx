'use client';

import React from 'react';

/**
 * Skeleton — placeholder geometry for content that is still arriving.
 *
 * ── Why a primitive, and why a sweep ────────────────────────────────────────
 * Four separate opacity-pulse keyframes existed for this: `skeleton-pulse` in
 * globals.css plus `dash-pulse`, `pi-pulse` and `tx-pulse` redeclared inside
 * the dashboard, inventory and transactions pages. They were the same
 * animation, written four times, and the whole-block opacity fade they shared
 * makes a page look like it is flickering rather than loading.
 *
 * One primitive, and a highlight that sweeps left-to-right instead. The sweep
 * travels in the same direction as the spinner's bar stagger and the splash's
 * bar assembly, so a page that is half skeleton and half spinner still reads as
 * one system moving one way.
 *
 * ── Use the real shape ──────────────────────────────────────────────────────
 * A skeleton is only worth having if it matches the layout it stands in for —
 * otherwise the page jumps when content lands, which is the jank the skeleton
 * was supposed to hide. Prefer composing `Skeleton` into the actual row/card
 * geometry over dropping in a generic grey block.
 *
 * Decorative throughout: `aria-hidden`. The surrounding region announces its
 * own loading state, and a screen reader has no use for placeholder rectangles.
 */

export interface SkeletonProps {
    width?: number | string;
    height?: number | string;
    radius?: number;
    circle?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

export function Skeleton({
    width = '100%',
    height = 14,
    radius = 8,
    circle = false,
    className,
    style,
}: SkeletonProps) {
    return (
        <span
            aria-hidden="true"
            className={['vs-skeleton', className].filter(Boolean).join(' ')}
            style={{
                display: 'block',
                width: circle ? height : width,
                height,
                borderRadius: circle ? '50%' : radius,
                ...style,
            }}
        />
    );
}

/**
 * A paragraph of placeholder lines.
 *
 * The last line is short because real text rarely fills its final line, and
 * that one detail is most of what makes a skeleton read as text rather than as
 * a stack of bars.
 */
export function SkeletonText({
    lines = 3,
    lineHeight = 12,
    gap = 8,
    lastLineWidth = '62%',
    style,
}: {
    lines?: number;
    lineHeight?: number;
    gap?: number;
    lastLineWidth?: string;
    style?: React.CSSProperties;
}) {
    return (
        <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
            {Array.from({ length: lines }, (_, i) => (
                <Skeleton
                    key={i}
                    height={lineHeight}
                    radius={lineHeight / 2}
                    width={i === lines - 1 ? lastLineWidth : '100%'}
                />
            ))}
        </span>
    );
}

/**
 * Repeating list rows — the shape the dashboard, inventory and transactions
 * tables were each hand-rolling.
 */
export function SkeletonRows({
    rows = 5,
    height = 44,
    gap = 10,
    radius = 10,
    style,
}: {
    rows?: number;
    height?: number;
    gap?: number;
    radius?: number;
    style?: React.CSSProperties;
}) {
    return (
        <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
            {Array.from({ length: rows }, (_, i) => (
                <Skeleton key={i} height={height} radius={radius} />
            ))}
        </span>
    );
}

export default Skeleton;
