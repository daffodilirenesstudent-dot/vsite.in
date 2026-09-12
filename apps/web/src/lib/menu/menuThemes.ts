/**
 * Menu design themes — the single source of truth.
 *
 * vsite ships THREE designs, not six: `classic` (what every live menu renders
 * today), `cafe`, `premium`. The picker is a SALES tool — it answers the "looks
 * like a free QR tool" objection during a counter demo — which is why it is
 * chosen at onboarding and why there are three of them and not a gallery.
 *
 * ─── TO ADD A FOURTH DESIGN ──────────────────────────────────────────────────
 * Add one entry to MENU_THEMES below and one option to the picker. Nothing else
 * changes: the renderer reads CSS variables, so no component learns a new name.
 * That is deliberate, and it is the reason only seven knobs are themeable.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CLIENT-SAFE. The public menu imports this, so it must never reach for
 * `@/lib/platform/db/supabase-server` (which is `server-only`) — the same rule
 * `productFlags.ts` follows, and for the same reason.
 *
 * WHAT A THEME MAY NOT CHANGE, and why each one is load-bearing:
 *
 *   · The veg / non-veg / egg marks. These are regulated signals in India, not
 *     decoration. An owner must not be able to recolour "this contains meat".
 *   · `offerTint` (#FFECEC). It is an offer's ENTIRE visual signal — the ribbon,
 *     wash, border and shadow were all removed precisely so one thing carries it.
 *   · `saveGreen` (#13801C). Money.
 *   · The sold-out ramp. It says "finished today", never "something went wrong",
 *     which is why it is muted and never red.
 *   · The recommendation badges, whose palette is deliberately never green —
 *     green already means vegetarian on that card.
 *
 * Those live in `menuTokens.ts` as `T` and stay there, untouched, for every
 * theme. `menu-card-system.test.ts` reads them out of source, and this module
 * layers on top rather than rewriting them.
 */

import { T } from '@/components/templates/menuTokens';

/** The seven knobs a design may move. Adding an eighth is a product decision. */
export const THEMEABLE_KNOBS = [
    'surface',
    'cardBg',
    /** Corner shape, applied consistently to the card, the chip and the thumb. */
    'radius',
    'cardEdge',
    'accent',
    'fontPair',
    'density',
] as const;

export type MenuThemeId = 'classic' | 'cafe' | 'premium';
export type FontPairId = 'classic' | 'warm' | 'sharp';

/**
 * A curated font pairing. Never a free choice.
 *
 * Every pair carries a real Tamil face. The root layout loads Outfit, Poppins
 * and Manrope with `subsets: ['latin']` only, so Tamil dish names currently
 * fall back to whatever face the reader's Android happens to ship. Given the
 * market is Tamil Nadu, that is not a detail to leave to chance — and it is
 * why owners pick from three vetted pairs instead of a Google Fonts list, where
 * most choices would render Tamil as empty boxes.
 */
export interface FontPair {
    id: FontPairId;
    label: string;
    /** Dish names and section headers. */
    display: string;
    /** Descriptions, prices, small print. */
    body: string;
    /** Tamil coverage for both. */
    tamil: string;
}

/**
 * Families are `next/font` CSS variables, never literal names — the loader
 * generates a hashed family per face, so `'Newsreader'` would silently resolve
 * to nothing. The Latin face is declared first and the Tamil face immediately
 * after it: the browser resolves font-family per GLYPH, so an English dish name
 * takes the display face and a Tamil one takes the Tamil face, from the same
 * stack, with no branching in any component.
 *
 * The variables are defined in `app/shop/layout.tsx` (Tamil faces) and the root
 * layout (Poppins, Manrope).
 */
export const FONT_PAIRS: Record<FontPairId, FontPair> = {
    classic: {
        id: 'classic',
        label: 'Classic',
        display: 'var(--font-poppins), var(--font-noto-tamil), system-ui, sans-serif',
        body: 'var(--font-manrope), var(--font-noto-tamil), system-ui, sans-serif',
        tamil: 'var(--font-noto-tamil), sans-serif',
    },
    warm: {
        id: 'warm',
        label: 'Warm',
        display: 'var(--font-newsreader), var(--font-mukta-malar), Georgia, serif',
        body: 'var(--font-manrope), var(--font-mukta-malar), system-ui, sans-serif',
        tamil: 'var(--font-mukta-malar), sans-serif',
    },
    sharp: {
        id: 'sharp',
        label: 'Sharp',
        display: 'var(--font-familjen), var(--font-anek-tamil), system-ui, sans-serif',
        body: 'var(--font-manrope), var(--font-anek-tamil), system-ui, sans-serif',
        tamil: 'var(--font-anek-tamil), sans-serif',
    },
};

export interface MenuTheme {
    id: MenuThemeId;
    /** Shown in the picker. */
    label: string;
    /** One line, in the owner's terms — who this design is for. */
    blurb: string;
    /** Page ground. */
    surface: string;
    /** Card ground (an offer and a sold-out card override it — frozen). */
    cardBg: string;
    cardRadius: number;
    /**
     * The card radius alone is not enough to carry a shape. A squared card
     * beside a 40px pill chip and a 10px thumb reads as an accident, not a
     * design — which is exactly how the first build of Premium looked. One
     * knob, applied everywhere it shows.
     */
    chipRadius: number;
    thumbRadius: number;
    cardEdge: { border: string; shadow: string };
    /**
     * Section headings. Part of the type knob: a design's voice lives as much
     * in how it labels a section as in the face it sets the dish names in.
     */
    section: { size: number; weight: number; tracking: string; transform: string };
    /** Default brand colour. The owner may replace it. */
    accent: string;
    fontPair: FontPairId;
    /** Row rhythm. Bigger reads calmer and more expensive. */
    density: { cardPadding: number; cardGap: number; listGap: number };
}

export const MENU_THEMES: Record<MenuThemeId, MenuTheme> = {
    /**
     * BYTE-IDENTICAL TO WHAT SHIPPED. Every value is read off `T` rather than
     * retyped, so this cannot drift from the 56 live menus by a typo.
     */
    classic: {
        id: 'classic',
        label: 'Classic',
        blurb: 'Clean and familiar. The safe choice.',
        surface: T.cardBg,
        cardBg: T.white,
        cardRadius: 8,
        chipRadius: 40,
        thumbRadius: 10,
        section: { size: 16, weight: 500, tracking: 'normal', transform: 'none' },
        cardEdge: {
            border: `1px solid ${T.border}`,
            shadow: '0 1px 3px rgba(25,25,25,0.06), 0 1px 1px rgba(25,25,25,0.04)',
        },
        accent: T.pink,
        fontPair: 'classic',
        density: { cardPadding: 10, cardGap: 10, listGap: 10 },
    },

    /** Warm ground, soft corners, a serif for the dish names. */
    cafe: {
        id: 'cafe',
        label: 'Cafe',
        blurb: 'Warm and hand-made. Suits tiffin rooms and coffee shops.',
        surface: '#FBF7F0',
        cardBg: '#FFFDFA',
        cardRadius: 16,
        chipRadius: 40,
        thumbRadius: 12,
        section: { size: 18, weight: 600, tracking: 'normal', transform: 'none' },
        cardEdge: {
            border: '1px solid transparent',
            shadow: '0 2px 10px rgba(150,110,70,0.08), 0 1px 2px rgba(150,110,70,0.05)',
        },
        accent: '#C2603F',
        fontPair: 'warm',
        density: { cardPadding: 12, cardGap: 12, listGap: 12 },
    },

    /**
     * Crisp and spare. Light, not dark, deliberately: this renders on cheap
     * Androids in variable daylight, and food photography on a dark ground goes
     * muddy. The ground is a warm paper rather than pure white — white cards on
     * a white page read as unstyled on a phone at arm's length, which is the
     * opposite of what this design is for.
     */
    premium: {
        id: 'premium',
        label: 'Premium',
        blurb: 'Spare and expensive. Suits hotels and dine-in restaurants.',
        surface: '#F7F6F3',
        cardBg: T.white,
        cardRadius: 2,
        chipRadius: 2,
        thumbRadius: 2,
        section: { size: 11, weight: 800, tracking: '0.16em', transform: 'uppercase' },
        cardEdge: { border: '1px solid #E8E6E1', shadow: 'none' },
        accent: '#101010',
        fontPair: 'sharp',
        density: { cardPadding: 14, cardGap: 14, listGap: 8 },
    },
};

export const DEFAULT_MENU_THEME: MenuThemeId = 'classic';
export const DEFAULT_FONT_PAIR: FontPairId = 'classic';

export function isMenuThemeId(value: unknown): value is MenuThemeId {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MENU_THEMES, value);
}

export function isFontPairId(value: unknown): value is FontPairId {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FONT_PAIRS, value);
}

/** Narrows a stored value to a theme, falling back rather than throwing. */
export function resolveTheme(stored: unknown): MenuTheme {
    return MENU_THEMES[isMenuThemeId(stored) ? stored : DEFAULT_MENU_THEME];
}

export function resolveFontPair(stored: unknown, theme: MenuTheme): FontPair {
    return FONT_PAIRS[isFontPairId(stored) ? stored : theme.fontPair];
}

// ─────────────────────────────────────────────────────────────────────────────
// The owner's brand colour is untrusted input
// ─────────────────────────────────────────────────────────────────────────────

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * A plain six-digit hex and nothing else.
 *
 * This is a SECURITY boundary, not a formatting nicety. QRMenuTemplate builds
 * its style block with `dangerouslySetInnerHTML`, so a stored value like
 * `red; } body { display: none } .x {` would close the rule and inject CSS into
 * every diner's page. Validated here, at the API, and again by a CHECK
 * constraint in migration 052 — three layers, because the blast radius is every
 * customer of that restaurant.
 *
 * Three digits are rejected too: shorthand would have to be expanded before it
 * reached a style string, and an unexpanded `#FFF` is one more shape to reason
 * about for no benefit.
 */
export function isHexColor(value: unknown): value is string {
    return typeof value === 'string' && HEX.test(value);
}

function channel(v: number): number {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast against a white ground. */
export function contrastOnWhite(hex: string): number {
    if (!isHexColor(hex)) return 1;
    return 1.05 / (luminance(hex) + 0.05);
}

const MIN_CONTRAST = 4.5;

/**
 * Darkens an owner-supplied colour until the price is readable.
 *
 * The accent is drawn as TEXT on a light ground — the price, the shop name, the
 * active category chip. A pale yellow brand colour sits near 1.1:1 against
 * white, which is not a styling quibble: it is a menu whose prices cannot be
 * read. Scaling the channels toward black holds the hue close enough that the
 * colour still reads as theirs.
 *
 * THEME DEFAULTS ARE NOT CLAMPED. The shipped pink is 3.2:1 and has been on
 * every live menu since March; clamping it here would silently restyle 56 menus
 * and break the promise that Classic is byte-identical. Design-reviewed values
 * pass through; unvetted ones do not. A stored value equal to the theme's own
 * default is treated as the default, so an owner who picks the house colour
 * gets the house colour.
 */
export function resolveAccent(stored: unknown, themeId: MenuThemeId = DEFAULT_MENU_THEME): string {
    const theme = MENU_THEMES[isMenuThemeId(themeId) ? themeId : DEFAULT_MENU_THEME];
    if (!isHexColor(stored)) return theme.accent;
    if (stored.toUpperCase() === theme.accent.toUpperCase()) return theme.accent;

    let r = parseInt(stored.slice(1, 3), 16);
    let g = parseInt(stored.slice(3, 5), 16);
    let b = parseInt(stored.slice(5, 7), 16);

    const hex = () =>
        `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

    // 60 steps at 0.96 reaches near-black, so this always terminates.
    for (let i = 0; i < 60 && contrastOnWhite(hex()) < MIN_CONTRAST; i += 1) {
        r *= 0.96;
        g *= 0.96;
        b *= 0.96;
    }
    return hex();
}

// ─────────────────────────────────────────────────────────────────────────────
// Delivery: CSS custom properties
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The theme, as variables to spread onto the menu shell.
 *
 * CSS custom properties rather than a context or a props chain, for three
 * reasons: the menu is drawn almost entirely in inline styles, so `var(...)`
 * drops straight in; `QRMenuTemplate` is 2,100 lines and prop-drilling a token
 * bag through it would touch every component; and the fallback in each
 * `var(--qr-x, <classic literal>)` keeps the shipped value visible in source,
 * which is what `menu-card-system.test.ts` asserts on.
 *
 * Values are validated before they get here — `isHexColor` on anything the
 * owner supplied — because these land in a style block.
 */
export function themeCssVars(
    theme: MenuTheme,
    accent: string,
    fontPair: FontPair,
): Record<string, string> {
    const safeAccent = isHexColor(accent) ? accent : theme.accent;
    return {
        '--qr-accent': safeAccent,
        '--qr-surface': theme.surface,
        '--qr-card-bg': theme.cardBg,
        '--qr-card-radius': `${theme.cardRadius}px`,
        '--qr-chip-radius': `${theme.chipRadius}px`,
        '--qr-thumb-radius': `${theme.thumbRadius}px`,
        '--qr-section-size': `${theme.section.size}px`,
        '--qr-section-weight': String(theme.section.weight),
        '--qr-section-tracking': theme.section.tracking,
        '--qr-section-transform': theme.section.transform,
        '--qr-card-border': theme.cardEdge.border,
        '--qr-card-shadow': theme.cardEdge.shadow,
        '--qr-font-display': fontPair.display,
        '--qr-font-body': fontPair.body,
        '--qr-font-tamil': fontPair.tamil,
        '--qr-card-padding': `${theme.density.cardPadding}px`,
        '--qr-card-gap': `${theme.density.cardGap}px`,
        '--qr-list-gap': `${theme.density.listGap}px`,
    };
}
