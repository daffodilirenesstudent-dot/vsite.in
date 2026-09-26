/**
 * Rules for the "Check items" step of bulk upload. Pure and client-safe.
 *
 * AI extraction reads a photo of a printed menu; it misreads prices and
 * invents categories. Every dish is shown to the owner, editable, before it is
 * added — and a dish without a price cannot be added, because it would go live
 * at ₹0. See tests/acceptance/bulk-review.test.ts.
 */
import { listedPrice } from '@/lib/menu/productForm';

export interface ReviewableItem {
    name: string;
    price: number;
    category: string;
    variants?: { size: string; price: number }[];
    /** false = the owner unticked it; it is not added. */
    include: boolean;
}

/** The dish's menu price: its own, or its cheapest size. */
function priceOf(item: ReviewableItem): number {
    return item.price > 0 ? item.price : listedPrice('Variants', '', item.variants ?? []);
}

export function reviewProblems(items: readonly ReviewableItem[]): { missingName: number; missingPrice: number } {
    let missingName = 0;
    let missingPrice = 0;
    for (const item of items) {
        if (!item.include) continue;
        if (!item.name.trim()) missingName++;
        else if (priceOf(item) <= 0) missingPrice++;
    }
    return { missingName, missingPrice };
}

/** What gets sent to the insert route: the ticked dishes, trimmed, priced. */
export function itemsToAdd<T extends ReviewableItem>(items: readonly T[]): Array<Omit<T, 'include'>> {
    return items
        .filter(item => item.include)
        .map(item => {
            const out: Omit<T, 'include'> & { include?: boolean } = {
                ...item,
                name: item.name.trim(),
                category: item.category.trim(),
                price: priceOf(item),
            };
            delete out.include;
            return out;
        });
}

/** Categories the ticked dishes will be filed under, in first-seen order. */
export function categorySummary(items: readonly ReviewableItem[]): { name: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const item of items) {
        const name = item.category.trim();
        if (!item.include || !name) continue;
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count }));
}
