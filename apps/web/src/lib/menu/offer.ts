/**
 * Whether a dish is on offer, and by how much.
 *
 * Three rules that the inline version in QRMenuTemplate did not have:
 *
 * 1. The percentage is DERIVED from the two prices, never read from the stored
 *    `discount_pct`. That column is written when the offer is created and does
 *    not follow later edits to `selling_price` — so a card could print
 *    "Flat 80% Off" directly above a price that was 20% off. The two numbers
 *    sit inches apart; they cannot be allowed to disagree.
 *
 * 2. Nonsense is refused rather than rendered. An `original_price` at or below
 *    the selling price produced "-25% OFF" on the card.
 *
 * 3. A saving under 5% is not an offer. A "1% off" badge cheapens every real
 *    offer on the same screen.
 *
 * Metadata comes from a JSON column, so values arrive as numbers or strings
 * depending on who wrote them. The old `numMeta` returned 0 for anything
 * non-numeric, which silently disabled offers stored as strings.
 */

/** Below this, the discount is noise and is not shown. */
const MIN_MEANINGFUL_PCT = 5;

export interface OfferState {
    active: boolean;
    /** Price before the offer. */
    was: number;
    /** Price the customer pays. */
    now: number;
    /** Whole-number percentage off, derived from was/now. */
    pct: number;
    /** Absolute saving in currency units — the number people actually feel. */
    save: number;
}

const INACTIVE: OfferState = { active: false, was: 0, now: 0, pct: 0, save: 0 };

/** Coerces a JSON metadata value to a finite number, or 0. */
function toNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'string') {
        const n = Number(value.trim());
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

export function resolveOffer(
    metadata: Record<string, unknown> | null | undefined,
    sellingPrice: number,
): OfferState {
    if (!metadata || metadata.discount_enabled !== true) return INACTIVE;

    const was = toNumber(metadata.original_price);
    const now = toNumber(sellingPrice);

    // An original price that is not strictly above what they pay is not an offer.
    if (was <= 0 || now <= 0 || was <= now) return INACTIVE;

    const save = was - now;
    const pct = Math.round((save / was) * 100);

    if (pct < MIN_MEANINGFUL_PCT) return INACTIVE;

    return { active: true, was, now, pct, save };
}
