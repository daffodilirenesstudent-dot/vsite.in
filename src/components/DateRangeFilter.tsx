'use client';

// DateRangeFilter — preset chips + dropdown for the dashboard / transactions UI.
//
// State lives in the URL (?range=last7d). Reasons:
//   1. Refresh / back / forward all preserve the view.
//   2. Sharing a URL shares the exact filter.
//   3. No prop-drilling between sibling components.
//
// On click:
//   1. Update the URL via router.replace (no scroll, no history blowup).
//   2. The host page reads useSearchParams() and refetches with the new range.

import React, { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { PRESETS, type RangePreset, isPreset } from '@/lib/dateRange';

export const DEFAULT_RANGE: RangePreset = 'today';

interface Props {
    /** Optional className to position the row */
    className?: string;
    /** If true, render as horizontal scrollable chips. Else as a select. */
    variant?: 'chips' | 'select';
}

export default function DateRangeFilter({ className, variant = 'chips' }: Props) {
    const router       = useRouter();
    const pathname     = usePathname();
    const searchParams = useSearchParams();

    const active = useMemo<RangePreset>(() => {
        const raw = searchParams.get('range');
        return isPreset(raw) ? raw : DEFAULT_RANGE;
    }, [searchParams]);

    const setRange = useCallback((key: RangePreset) => {
        const params = new URLSearchParams(searchParams.toString());
        if (key === DEFAULT_RANGE) {
            params.delete('range');  // keep URL clean for the default
        } else {
            params.set('range', key);
        }
        // Strip stale custom-range params when switching to a preset
        params.delete('start');
        params.delete('end');
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [pathname, router, searchParams]);

    if (variant === 'select') {
        return (
            <select
                value={active}
                onChange={(e) => setRange(e.target.value as RangePreset)}
                className={className}
                style={{
                    fontSize: 13, fontWeight: 500, color: '#0A0A0A',
                    border: '1px solid #E4E4E7', borderRadius: 8,
                    padding: '6px 10px', background: '#FFFFFF', cursor: 'pointer',
                    minWidth: 140,
                }}
            >
                {PRESETS.map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                ))}
            </select>
        );
    }

    // chips variant — horizontal row, scrolls on mobile
    return (
        <div
            className={className}
            role="tablist"
            aria-label="Date range"
            style={{
                display: 'flex', gap: 6, overflowX: 'auto',
                padding: '2px 0',  // avoid clipping focus ring
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
            }}
        >
            <style>{`[role="tablist"]::-webkit-scrollbar { display: none; }`}</style>
            {PRESETS.map(p => {
                const isActive = p.key === active;
                return (
                    <button
                        key={p.key}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setRange(p.key)}
                        style={{
                            padding: '6px 12px',
                            borderRadius: 999,
                            fontSize: 12.5,
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? '#FFFFFF' : '#52525C',
                            background: isActive ? '#5137EF' : '#FFFFFF',
                            border: isActive ? '1px solid #5137EF' : '1px solid #E4E4E7',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                            flexShrink: 0,
                        }}
                    >
                        {p.label}
                    </button>
                );
            })}
        </div>
    );
}

/**
 * Hook for host pages — returns the current preset (or default).
 * Pages use this to build their fetch URL with the same range param.
 */
export function useCurrentRange(): RangePreset {
    const searchParams = useSearchParams();
    const raw = searchParams.get('range');
    return isPreset(raw) ? raw : DEFAULT_RANGE;
}
