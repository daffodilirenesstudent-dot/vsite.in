'use client';

import React from 'react';

/**
 * ProgressTrack — the indicator for a long operation.
 *
 * A spinner is a promise that something is about to finish. Onboarding's menu
 * extraction runs to 60 seconds, and a spinner held that long stops reading as
 * "working" and starts reading as "stuck" — which is when owners reload the
 * page and lose the upload.
 *
 * A travelling track keeps making visible progress without claiming to know how
 * much is left, so it survives a wait a spinner cannot. It is the same element
 * BrandLoader already sits under, on the same left-to-right axis as the
 * spinner's bar stagger and the skeleton's sweep.
 *
 * Indeterminate on purpose. `determinate` is offered only because a caller that
 * genuinely knows its percentage should show it — never pass a fabricated one.
 */

export interface ProgressTrackProps {
    /** 0–100 for a known percentage. Omit for indeterminate. */
    value?: number;
    width?: number | string;
    label?: string;
    style?: React.CSSProperties;
}

export default function ProgressTrack({
    value,
    width = 148,
    label,
    style,
}: ProgressTrackProps) {
    const determinate = typeof value === 'number';
    const pct = determinate ? Math.max(0, Math.min(100, value)) : 0;

    return (
        <div
            role="progressbar"
            aria-label={label ?? 'Loading'}
            aria-valuemin={determinate ? 0 : undefined}
            aria-valuemax={determinate ? 100 : undefined}
            aria-valuenow={determinate ? Math.round(pct) : undefined}
            style={{
                position: 'relative',
                width,
                height: 3,
                borderRadius: 3,
                background: 'var(--vs-track-bed, #E6E1F7)',
                overflow: 'hidden',
                ...style,
            }}
        >
            <div
                className={determinate ? undefined : 'vs-track-fill'}
                style={
                    determinate
                        ? {
                              width: `${pct}%`,
                              height: '100%',
                              borderRadius: 3,
                              background: 'var(--vs-loader-brand, #5137EF)',
                              transition: 'width 280ms cubic-bezier(0.4, 0, 0.2, 1)',
                          }
                        : undefined
                }
            />
        </div>
    );
}
