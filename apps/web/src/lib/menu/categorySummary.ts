/**
 * Category grouping for the dashboard Insights panel.
 *
 * Extracted from `api/manage/menu-summary` so the relationship between the two
 * numbers the dashboard renders is pinned by a test instead of by coincidence.
 *
 * The dashboard shows both at once:
 *   • the "Total Categories" tile  → totalNamedCategories
 *   • the breakdown card's "N groups" label → totalGroups, beside N rows
 *
 * They are deliberately different: a product with no category is not a
 * category the owner created, but it IS a row in the breakdown. Returning both
 * explicitly — rather than letting each caller re-derive one — is what stops
 * them drifting into the contradiction QA found on 2026-09-20 ("4" beside a
 * five-row list labelled "5 groups").
 */

/** Bucket for products the owner never assigned a category to. */
export const UNCATEGORIZED = 'Uncategorized';

export interface CategoryCount {
    name: string;
    count: number;
}

export interface CategorySummary {
    /** One row per group, most populous first. Includes the bucket if non-empty. */
    categories: CategoryCount[];
    /** Categories the owner actually named — excludes the bucket. */
    totalNamedCategories: number;
    /** Rows in `categories`. Always equals `categories.length`. */
    totalGroups: number;
}

export function summariseCategories(
    products: readonly { category: string | null }[],
): CategorySummary {
    const counts = new Map<string, number>();
    for (const product of products) {
        // Trim first so " Soups" and "Soups" are one category, and a
        // whitespace-only value falls through to the bucket.
        const key = product.category?.trim() || UNCATEGORIZED;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const categories = Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    return {
        categories,
        totalNamedCategories: categories.filter(c => c.name !== UNCATEGORIZED).length,
        totalGroups: categories.length,
    };
}
