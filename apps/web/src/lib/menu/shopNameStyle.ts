/**
 * Size of the shop name in the public menu header.
 *
 * One fixed size cannot serve both "Cream Story" and "Daffodil Irene ❤️ Cafe &
 * Restaurant": sized for the short name, the long one wraps into a ragged
 * block; sized for the long one, the short one looks like body text. The name
 * steps down with its length instead, and the header clamps it to two balanced
 * lines — so a short name reads as a wordmark and a long one still fits.
 *
 * Length is counted in code points, not UTF-16 units. That over-counts Tamil a
 * little (vowel signs are their own code points), which suits it: Tamil glyphs
 * run wider than Latin capitals at the same size.
 */

/** A short name — the full wordmark. */
export const SHOP_NAME_MAX_PX = 22;

/** Never under this: dish names render at 15–16px and the name must out-rank them. */
export const SHOP_NAME_MIN_PX = 17;

/** [max length in code points, size in px], shortest first. */
const STEPS: ReadonlyArray<readonly [number, number]> = [
    [14, SHOP_NAME_MAX_PX],
    [22, 20],
    [30, 18],
];

export function shopNameFontSize(name: string): number {
    const length = Array.from(name.trim()).length;
    for (const [maxLength, px] of STEPS) {
        if (length <= maxLength) return px;
    }
    return SHOP_NAME_MIN_PX;
}
