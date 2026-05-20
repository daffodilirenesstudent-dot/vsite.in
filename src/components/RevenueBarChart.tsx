'use client';

// RevenueBarChart — simple animated bar chart for dashboard revenue series.
//
// ANIMATION (kept minimal per spec):
//   - Each bar starts at scaleY(0) on first paint.
//   - One frame later we set scaleY to the real fraction.
//   - CSS transitions over 600ms with ease-out — bars grow from the bottom.
//   - Re-keyed by range so switching filter restarts the animation.
//
// PERFORMANCE:
//   - `transform: scaleY()` is GPU-composited (no layout/reflow).
//   - No animation libraries. Zero runtime JS during the transition.
//   - Works smoothly on cheap Android devices.

import React, { useEffect, useState } from 'react';

export interface RevenueBucket {
    /** ISO timestamp of bucket start (in UTC, but represents the local boundary) */
    bucket_start: string;
    revenue: number;
    txn_count?: number;
}

interface Props {
    series:   RevenueBucket[];
    /** 'hour' | 'day' | 'week' | 'month' — controls label format */
    bucket:   'hour' | 'day' | 'week' | 'month';
    /** Site timezone for formatting bucket labels */
    timezone: string;
    /** Currency symbol — defaults to ₹ */
    currency?: string;
    /** Height of the chart in px (label area not included) */
    height?:  number;
}

// Format a bucket label appropriate for the bucket size.
function labelFor(bucket: Props['bucket'], iso: string, tz: string): string {
    const d = new Date(iso);
    switch (bucket) {
        case 'hour':
            return d.toLocaleTimeString('en-IN', { hour: 'numeric', hour12: true, timeZone: tz })
                    .replace(/\s/g, '').toLowerCase(); // "9am", "1pm"
        case 'day':
            return d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: tz }); // "Mon"
        case 'week':
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: tz }); // "12 May"
        case 'month':
            return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: tz }); // "May 26"
    }
}

// Display the revenue above each bar. K-format for >= 1000.
function formatAmount(n: number, currency: string): string {
    if (n >= 100_000) return `${currency}${(n / 100_000).toFixed(1)}L`;
    if (n >= 1_000)   return `${currency}${(n / 1_000).toFixed(1)}K`;
    return `${currency}${Math.round(n)}`;
}

export default function RevenueBarChart({
    series, bucket, timezone, currency = '₹', height = 200,
}: Props) {
    // `playing` flips true one frame after mount → triggers the CSS transition.
    const [playing, setPlaying] = useState(false);
    useEffect(() => {
        // requestAnimationFrame ensures the initial scaleY(0) was committed to the
        // DOM before we flip — without this React might batch both renders and the
        // transition would have nothing to animate from.
        const id = requestAnimationFrame(() => setPlaying(true));
        return () => cancelAnimationFrame(id);
    }, []);

    if (series.length === 0) {
        return (
            <div style={{
                height: height + 56, border: '1px solid #E4E4E7', borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#FAFAFA',
            }}>
                <p style={{ fontSize: 13, color: '#99A1AF', margin: 0 }}>No revenue data in this period yet.</p>
            </div>
        );
    }

    // Determine y-axis max. Use the highest bar; minimum scale of ₹1 so all-zero
    // states don't NaN. Round UP to a "nice" number so the tallest bar isn't 100%.
    const rawMax = Math.max(...series.map(b => b.revenue), 1);
    const niceMax = niceCeiling(rawMax);

    return (
        <div style={{
            border: '1px solid #E4E4E7', borderRadius: 12, padding: '16px 20px 12px',
            background: '#FFFFFF',
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height, paddingTop: 24 }}>
                {series.map((b, i) => {
                    const fraction = niceMax > 0 ? b.revenue / niceMax : 0;
                    return (
                        <div key={i} style={{
                            flex: 1, minWidth: 0, height: '100%',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                            position: 'relative',
                        }}>
                            {/* value label — only render when bar has revenue */}
                            {b.revenue > 0 && (
                                <span style={{
                                    position: 'absolute',
                                    bottom: `calc(${fraction * 100}% + 6px)`,
                                    fontSize: 11, fontWeight: 600, color: '#0A0A0A',
                                    whiteSpace: 'nowrap',
                                    opacity: playing ? 1 : 0,
                                    transition: 'opacity 250ms 350ms ease-out',
                                }}>
                                    {formatAmount(b.revenue, currency)}
                                </span>
                            )}
                            {/* the bar itself — scaleY from 0 → fraction. Design-system purple gradient. */}
                            <div style={{
                                width: '70%', maxWidth: 32, minWidth: 14,
                                height: '100%',
                                background: 'linear-gradient(180deg, #7C6BF5 0%, #5137EF 100%)',
                                borderRadius: '6px 6px 0 0',
                                transformOrigin: 'bottom',
                                transform: `scaleY(${playing ? fraction : 0})`,
                                transition: 'transform 600ms cubic-bezier(0.25, 0.1, 0.25, 1)',
                            }} />
                        </div>
                    );
                })}
            </div>
            {/* x-axis labels */}
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                {series.map((b, i) => (
                    <div key={i} style={{
                        flex: 1, minWidth: 0, textAlign: 'center',
                        fontSize: 11, color: '#71717A', fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {labelFor(bucket, b.bucket_start, timezone)}
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Round up to a visually "nice" ceiling so the tallest bar leaves headroom for
 * its label. E.g., 18.6 → 25, 12.4 → 15, 200 → 250.
 */
function niceCeiling(n: number): number {
    if (n <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(n)));
    const ratio = n / pow;
    let nice: number;
    if      (ratio <= 1.5) nice = 1.5;
    else if (ratio <= 2)   nice = 2;
    else if (ratio <= 2.5) nice = 2.5;
    else if (ratio <= 5)   nice = 5;
    else if (ratio <= 7.5) nice = 7.5;
    else                    nice = 10;
    return nice * pow;
}
