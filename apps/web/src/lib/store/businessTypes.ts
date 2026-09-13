/**
 * What kind of place this is, where it is, and the sentence Google shows.
 *
 * All three used to be one free-text blurb the owner wrote (sites.description),
 * which meant it was usually empty. These are the questions an owner can answer
 * in a tap, and the answers are worth more than the blurb was: they build the
 * public menu's meta description without anyone writing it.
 */

export interface BusinessType {
    id: string;
    /** Shown on the chip. */
    label: string;
    /** Tamil label — most owners here read this first. */
    labelTa: string;
    /** Material symbol name for the chip. */
    icon: string;
    /**
     * How the type reads inside a sentence: "Cream Story — Café in Madurai."
     * Separate from `label` because a chip is a noun and a sentence needs an
     * article-free, lower-context form.
     */
    descriptor: string;
}

/**
 * Five types, and five is the point: they fit one tap-row on a phone without
 * becoming a dropdown, and a dropdown is a field an owner scrolls past.
 *
 * The list is weighted to Tamil Nadu rather than to a generic F&B taxonomy. A
 * mess or tiffin centre is not a restaurant — calling it one is exactly how a
 * type field gets left blank — and a tea shop is the most common food business
 * in the state by count. Bakery lost its slot to mess for that reason: a bakery
 * owner will accept "Takeaway" far more readily than a mess owner will accept
 * "Restaurant".
 */
export const BUSINESS_TYPES: readonly BusinessType[] = [
    { id: 'restaurant', label: 'Restaurant', labelTa: 'உணவகம்',        icon: 'restaurant',      descriptor: 'Restaurant' },
    { id: 'cafe',       label: 'Café',       labelTa: 'கஃபே',           icon: 'local_cafe',      descriptor: 'Café' },
    { id: 'takeaway',   label: 'Takeaway',   labelTa: 'பார்சல் கடை',    icon: 'takeout_dining',  descriptor: 'Takeaway' },
    { id: 'mess',       label: 'Mess / Tiffin', labelTa: 'மெஸ் / டிஃபன்', icon: 'dinner_dining', descriptor: 'Mess and tiffin centre' },
    { id: 'tea_shop',   label: 'Tea / Juice', labelTa: 'டீ / ஜூஸ் கடை', icon: 'emoji_food_beverage', descriptor: 'Tea and juice shop' },
] as const;

export function isBusinessType(value: unknown): boolean {
    return typeof value === 'string' && BUSINESS_TYPES.some(t => t.id === value);
}

export function businessType(id: string | null | undefined): BusinessType | null {
    if (typeof id !== 'string') return null;
    return BUSINESS_TYPES.find(t => t.id === id) ?? null;
}

/**
 * A six-digit Indian PIN, or nothing at all.
 *
 * Blank is VALID: the field is optional and painting an empty box red the
 * moment the tab opens is how a settings screen reads as broken. Only a
 * non-empty wrong value is wrong.
 *
 * The leading digit may not be 0 — no Indian PIN starts with one — which also
 * rejects '000000', the canonical way a required numeric field gets filled in
 * to make it go away. Matches the sites_pincode_format CHECK in migration 054.
 */
export function isValidPincode(value: string): boolean {
    if (value.trim() === '') return true;
    return /^[1-9][0-9]{5}$/.test(value.trim());
}

/** Google truncates around here; past it the tail is invisible anyway. */
const MAX_META_DESCRIPTION = 160;

const MENU_CALL_TO_ACTION = 'Browse the full menu from your phone. No app needed.';

/**
 * The public menu's meta description, built rather than written.
 *
 * This replaces sites.description. Derived beats owner-written for this
 * particular string: it is never empty (which the blurb usually was), never
 * stale after a rename, and never a paragraph of keywords.
 *
 * Degrades one clause at a time. A store with a type and a place gets the full
 * sentence; a store with neither still gets a correct one, because most
 * existing rows have neither and a template with a hole in it is worse than
 * the generic line it replaced.
 */
export function buildMenuDescription(site: {
    name: string;
    type?: string | null;
    location?: string | null;
}): string {
    const type = businessType(site.type)?.descriptor ?? null;
    const place = site.location?.trim() || null;

    let lead: string;
    if (type && place)   lead = `${site.name} — ${type} in ${place}.`;
    else if (type)       lead = `${site.name} — ${type}.`;
    else if (place)      lead = `${site.name} — ${place}.`;
    else                 lead = `${site.name}.`;

    const full = `${lead} ${MENU_CALL_TO_ACTION}`;
    if (full.length <= MAX_META_DESCRIPTION) return full;

    // A long enough name pushes the call to action past the cutoff. Drop the
    // second sentence rather than shipping a truncated one — half a sentence
    // in a search result reads as a broken page.
    return lead.length <= MAX_META_DESCRIPTION
        ? lead
        : `${lead.slice(0, MAX_META_DESCRIPTION - 1).trimEnd()}…`;
}
