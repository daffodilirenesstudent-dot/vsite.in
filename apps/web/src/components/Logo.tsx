/**
 * The vsite logo — single source of truth.
 *
 * The mark is traced from `public/android-chrome-192x192.png` at pixel
 * accuracy (measured off the raster, then verified by overlay: the traced
 * shape covers the original with no bleed). Four rounded bars:
 *
 *     ┌──┐  the stepped bracket, then a full-height bar to its right
 *   ┌─┘  │
 *   └────┘
 *
 * It is SVG rather than the PNG for three reasons: it stays crisp at every
 * DPR and every size, it recolours (the raster is locked to brand purple,
 * which sits at poor contrast on the dark hero and footer), and it costs no
 * network request.
 *
 * Geometry is in a tight 147×152 viewBox — no built-in padding — so callers
 * control spacing with layout rather than fighting baked-in whitespace.
 */

type Tone = 'brand' | 'light' | 'dark' | 'inherit';

const MARK_COLOR: Record<Tone, string> = {
    brand: '#5452F6',
    light: '#FDFCFA',
    dark: '#12100E',
    inherit: 'currentColor',
};

const WORD_COLOR: Record<Tone, string> = {
    brand: 'text-ink',
    light: 'text-[#FDFCFA]',
    dark: 'text-ink',
    inherit: '',
};

// ink-45 measured 4.43:1 against the nav's translucent scrolled background —
// just under AA. ink-70 is 8.9:1 and still reads as secondary at this size.
const TAGLINE_COLOR: Record<Tone, string> = {
    brand: 'text-ink-70',
    light: 'text-white/60',
    dark: 'text-ink-70',
    inherit: 'opacity-70',
};

export function LogoMark({
    size = 28,
    tone = 'brand',
    className = '',
}: {
    size?: number;
    tone?: Tone;
    className?: string;
}) {
    return (
        <svg
            width={(size * 147) / 152}
            height={size}
            viewBox="0 0 147 152"
            fill="none"
            role="img"
            aria-label="vsite"
            className={className}
        >
            <g fill={MARK_COLOR[tone]}>
                <rect x="120" y="0" width="27" height="152" rx="13.5" />
                <rect x="72" y="0" width="28" height="80" rx="14" />
                <rect x="24" y="52" width="76" height="28" rx="14" />
                <rect x="0" y="99" width="99" height="28" rx="14" />
            </g>
        </svg>
    );
}

export default function Logo({
    size = 28,
    tone = 'brand',
    tagline = false,
    className = '',
}: {
    /** Height of the mark in px. The wordmark scales with it. */
    size?: number;
    tone?: Tone;
    /** Show the "Smart QR Menu" descender under the wordmark. */
    tagline?: boolean;
    className?: string;
}) {
    return (
        <span className={`inline-flex items-center gap-2.5 ${className}`}>
            <LogoMark size={size} tone={tone} className="shrink-0" />
            <span className="flex flex-col leading-none">
                <span
                    className={`font-display font-extrabold tracking-[-0.04em] ${WORD_COLOR[tone]}`}
                    style={{ fontSize: size * 0.78 }}
                >
                    vsite
                </span>
                {tagline && (
                    <span
                        className={`mt-1 hidden font-semibold uppercase tracking-[0.16em] sm:block ${TAGLINE_COLOR[tone]}`}
                        // 12px floor: this is real navigation chrome, not mock UI. The ratio
                        // alone gave 9.5px at size=34, which QA flagged as unreadable.
                        style={{ fontSize: Math.max(12, size * 0.28) }}
                    >
                        Smart QR Menu
                    </span>
                )}
            </span>
        </span>
    );
}
