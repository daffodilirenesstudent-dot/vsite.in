/**
 * Recommendation badges — "Best Seller", "Popular", "Chef's Pick".
 *
 * The source value is `products.ks_quadrant`, a menu-engineering classification
 * stored capitalised: Star, Plowhorse, Puzzle, Dog. It was compared inline in
 * two places in QRMenuTemplate with two different casings, so the detail sheet
 * tested `=== 'star'` and rendered nothing, ever. Matching case-insensitively
 * here retires that class of bug rather than fixing one instance of it.
 *
 * `Dog` — low popularity, low margin — is deliberately unbadged. It is an
 * internal judgement about the dish and must never reach the customer.
 *
 * Colours are tinted grounds with a one-step-darker border, all AA against
 * their own ground. Deliberately not green: green means vegetarian on this
 * card and must keep meaning only that.
 */

export type BadgeKind = 'best' | 'popular' | 'chef';

export interface BadgeSpec {
    kind: BadgeKind;
    /** Spoken and shown. No glyphs — the icon carries the symbol. */
    label: string;
    bg: string;
    fg: string;
    border: string;
}

export const BADGES: Record<BadgeKind, BadgeSpec> = {
    best: { kind: 'best', label: 'Best Seller', bg: '#FFF6DE', fg: '#8A5B06', border: '#F2DFA8' },
    popular: { kind: 'popular', label: 'Popular', bg: '#FFEDE9', fg: '#A33A22', border: '#F6CFC4' },
    chef: { kind: 'chef', label: "Chef's Pick", bg: '#EFEAFE', fg: '#5A2FB8', border: '#DBCFF7' },
};

const BY_QUADRANT: Record<string, BadgeKind> = {
    star: 'best',
    plowhorse: 'popular',
    puzzle: 'chef',
};

export function resolveBadge(quadrant?: string | null): BadgeSpec | null {
    if (!quadrant) return null;
    const kind = BY_QUADRANT[quadrant.trim().toLowerCase()];
    return kind ? BADGES[kind] : null;
}
