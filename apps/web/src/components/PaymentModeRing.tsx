'use client';

// PaymentModeRing — donut chart showing the Cash / UPI / Card split of revenue.
//
// SVG-only (no charting library). Animation: each arc's stroke-dasharray
// transitions from 0 → its share of the circumference over 800ms. GPU-friendly,
// runs at 60fps even on cheap Android.
//
// Center label shows the total. A simple legend on the right lists each mode
// with its color swatch and value. Re-keyed by the caller (range key) so the
// animation replays on filter change.

import React, { useEffect, useState, useMemo } from 'react';

interface Props {
    /** Map of label → value. Keys typically 'Cash' | 'UPI' | 'Card' or 'Dine-in' | 'Takeaway'. */
    breakdown: Record<string, number>;
    /** Currency symbol — defaults to ₹ (ignored when formatValue is supplied) */
    currency?: string;
    /** Diameter of the ring in px */
    size?: number;
    /** Stroke width of the ring (px) */
    strokeWidth?: number;
    /** Center label — defaults to "Total" */
    totalLabel?: string;
    /** Per-segment value formatter (legend) — defaults to currency formatting. */
    formatValue?: (n: number) => string;
    /** Center total formatter — defaults to currency formatting. */
    formatTotal?: (n: number) => string;
    /** Custom empty-state message */
    emptyMessage?: string;
}

// Canonical color for each well-known label. Anything else falls back to grey.
const MODE_COLORS: Record<string, string> = {
    Cash:       '#16A34A',  // green
    UPI:        '#5137EF',  // design-system purple
    Card:       '#0EA5E9',  // blue
    UPI2:       '#5137EF',  // (alias just in case)
    Online:     '#5137EF',
    Other:      '#71717A',
    // Order-type breakdown (Dine-in vs Takeaway donut on the dashboard)
    'Dine-in':  '#5137EF',  // design-system purple — primary mode
    Takeaway:   '#F59E0B',  // amber — clearly distinct
};
const FALLBACK = '#A1A1AA';

function colorFor(mode: string): string {
    return MODE_COLORS[mode] ?? FALLBACK;
}

function formatAmount(n: number, currency: string): string {
    if (n >= 100_000) return `${currency}${(n / 100_000).toFixed(1)}L`;
    if (n >= 1_000)   return `${currency}${(n / 1_000).toFixed(1)}K`;
    return `${currency}${Math.round(n)}`;
}

export default function PaymentModeRing({
    breakdown, currency = '₹', size = 140, strokeWidth = 14,
    totalLabel = 'Total',
    formatValue,
    formatTotal,
    emptyMessage = 'No settled payments in this period.',
}: Props) {
    const fmtValue = formatValue ?? ((n: number) => `${currency}${n.toLocaleString('en-IN')}`);
    const fmtTotal = formatTotal ?? ((n: number) => formatAmount(n, currency));
    // Sort: highest revenue first so the legend reads top→bottom by importance.
    const entries = useMemo(() => {
        return Object.entries(breakdown)
            .filter(([, v]) => v > 0)
            .sort(([, a], [, b]) => b - a);
    }, [breakdown]);

    const total = entries.reduce((s, [, v]) => s + v, 0);

    // Animation: arcs grow from 0 → full length on mount.
    const [playing, setPlaying] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setPlaying(true));
        return () => cancelAnimationFrame(id);
    }, []);

    if (entries.length === 0 || total === 0) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: size + 24, borderRadius: 12, background: '#FAFAFA',
                border: '1px solid #E4E4E7',
            }}>
                <p style={{ fontSize: 13, color: '#99A1AF', margin: 0 }}>{emptyMessage}</p>
            </div>
        );
    }

    const R = (size - strokeWidth) / 2;
    const C = 2 * Math.PI * R;
    const cx = size / 2;
    const cy = size / 2;

    // Walk each segment, tracking cumulative fraction so each arc starts where
    // the previous ended. We use strokeDashoffset (rotated -90° so 0 is at top)
    // and strokeDasharray = `${length} ${gap}` to draw a partial arc.
    let cumulative = 0;
    const arcs = entries.map(([mode, value]) => {
        const fraction = value / total;
        const length   = fraction * C;
        const startOff = -cumulative * C;
        cumulative += fraction;
        return { mode, value, fraction, length, startOff };
    });

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            {/* The ring */}
            <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                    {/* background track — the unfilled portion */}
                    <circle
                        cx={cx} cy={cy} r={R}
                        fill="none"
                        stroke="#F4F4F5"
                        strokeWidth={strokeWidth}
                    />
                    {/* each colored arc, animated from length 0 → real length */}
                    {arcs.map(arc => (
                        <circle
                            key={arc.mode}
                            cx={cx} cy={cy} r={R}
                            fill="none"
                            stroke={colorFor(arc.mode)}
                            strokeWidth={strokeWidth}
                            strokeLinecap="butt"
                            strokeDasharray={`${playing ? arc.length : 0} ${C}`}
                            strokeDashoffset={arc.startOff}
                            transform={`rotate(-90 ${cx} ${cy})`}
                            style={{
                                transition: 'stroke-dasharray 800ms cubic-bezier(0.25, 0.1, 0.25, 1)',
                            }}
                        />
                    ))}
                </svg>
                {/* Center: total amount */}
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                }}>
                    <span style={{ fontSize: 10, color: '#71717A', fontWeight: 500, letterSpacing: 0.5, textTransform: 'uppercase' }}>{totalLabel}</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#0A0A0A', lineHeight: 1.1 }}>
                        {fmtTotal(total)}
                    </span>
                </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                {arcs.map(arc => {
                    const pct = Math.round(arc.fraction * 100);
                    return (
                        <div key={arc.mode} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{
                                width: 10, height: 10, borderRadius: 3,
                                background: colorFor(arc.mode),
                                flexShrink: 0,
                            }} />
                            <span style={{ fontSize: 13, color: '#52525C', fontWeight: 500, minWidth: 36 }}>{arc.mode}</span>
                            <span style={{ fontSize: 13, color: '#0A0A0A', fontWeight: 600 }}>
                                {fmtValue(arc.value)}
                            </span>
                            <span style={{ fontSize: 11, color: '#71717A' }}>· {pct}%</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
