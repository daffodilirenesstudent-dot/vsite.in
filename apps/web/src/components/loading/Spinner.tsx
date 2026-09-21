'use client';

import React from 'react';

/**
 * Spinner — the one loading indicator in the product.
 *
 * ── Why bars and not a ring ─────────────────────────────────────────────────
 * This replaced 47 hand-rolled indicators, and every one of them was a rotating
 * ring: `border-4 border-gray-200 border-t-[#5137EF]` and inline variants of it.
 * A rotating ring is the most generic loading affordance in software — it said
 * nothing about vsite, and because each copy was written by hand they had
 * drifted into four different purples and five different diameters.
 *
 * The brand already owns a better gesture. `BrandLoader` assembles the vsite
 * mark by raising its four bars in sequence; that stagger is the thing a
 * returning owner sees every time they open the dashboard. So the spinner is
 * the same gesture at a smaller scale: four rounded bars, the mark's own
 * radius-to-width ratio, lifted in the same left-to-right order on the same
 * easing. The splash and a 12px button spinner become one idea at two sizes.
 *
 * Bars also survive the sizes a ring cannot. At 12px a ring's stroke collapses
 * into a grey smudge on the cheap Android screens this dashboard is used on;
 * four 2px bars stay legible.
 *
 * ── Colour ──────────────────────────────────────────────────────────────────
 * `tone` exists because the old spinners hardcoded their colour and therefore
 * could not be reused. `current` inherits `color`, which is what makes this
 * work inside a themed button and on the public menu, where the store owner's
 * own brand colour is in force and a hardcoded indigo would be wrong.
 *
 * ── Accessibility ───────────────────────────────────────────────────────────
 * Decorative by default. A spinner inside a button whose label already reads
 * "Saving…" must not also announce itself, or the button is read out twice.
 * Pass `label` only when the spinner is the sole indication that something is
 * happening — `SectionLoader` and `PageLoader` do this for you.
 *
 * Motion is defined once in globals.css (`.vs-spinner`), not in a per-component
 * <style> tag. Six copies of `@keyframes spin` is how the old ones drifted.
 */

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type SpinnerTone = 'brand' | 'current' | 'onBrand' | 'muted';

/** Rendered px per size. Named rather than free-form so spinners can't drift. */
const SIZE_PX: Record<SpinnerSize, number> = {
    xs: 12,   // dense table rows, chips
    sm: 16,   // inside a button, beside its label
    md: 24,   // a card or panel resolving
    lg: 36,   // a section of the page
    xl: 48,   // a full route
};

const TONE_COLOR: Record<SpinnerTone, string> = {
    // The dashboard's established accent. Deliberately NOT the tailwind
    // `primary` (#5452F6): #5137EF is what the surrounding dashboard cards and
    // icons already use, so matching it keeps the change to the FORM of the
    // indicator rather than also shifting its colour. One token to change if
    // the two are ever reconciled.
    brand: 'var(--vs-loader-brand, #5137EF)',
    current: 'currentColor',
    onBrand: '#FFFFFF',
    muted: '#A1A1AA',
};

export interface SpinnerProps {
    size?: SpinnerSize;
    tone?: SpinnerTone;
    /**
     * Announce the spinner to assistive tech with this text. Omit when adjacent
     * copy already says what is happening — the spinner is then decorative.
     */
    label?: string;
    className?: string;
    style?: React.CSSProperties;
}

export default function Spinner({
    size = 'sm',
    tone = 'current',
    label,
    className,
    style,
}: SpinnerProps) {
    const px = SIZE_PX[size];
    // Four bars plus three gaps span the box: 4w + 3g = px, with g = 0.7w.
    const barWidth = px / 6.1;
    const gap = barWidth * 0.7;

    const announced = Boolean(label);

    return (
        <span
            className={['vs-spinner', className].filter(Boolean).join(' ')}
            role={announced ? 'status' : undefined}
            aria-live={announced ? 'polite' : undefined}
            aria-label={announced ? label : undefined}
            aria-hidden={announced ? undefined : true}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap,
                width: px,
                height: px,
                flexShrink: 0,
                color: TONE_COLOR[tone],
                verticalAlign: 'middle',
                ...style,
            }}
        >
            {[0, 1, 2, 3].map((i) => (
                <span
                    key={i}
                    className="vs-spinner-bar"
                    style={{
                        width: barWidth,
                        height: '100%',
                        // The mark's bars are fully rounded caps; keep the ratio
                        // so the shape reads as the same family at every size.
                        borderRadius: barWidth,
                        background: 'currentColor',
                        // Matches BrandLoader's 0.12s bar-to-bar offset.
                        animationDelay: `${i * 0.12}s`,
                    }}
                />
            ))}
        </span>
    );
}
