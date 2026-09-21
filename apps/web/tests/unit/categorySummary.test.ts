/**
 * QA 2026-09-20 — the dashboard contradicted itself about category count.
 *
 * The Insights tile read "Total Categories 4 / With products" while the
 * breakdown card beside it read "5 groups" over a 5-row list. Verified live:
 * total_categories excluded the "Uncategorized" bucket, categories[] included
 * it, and the two numbers were rendered side by side with nothing to say they
 * were measuring different things.
 *
 * Both numbers were individually correct, so this is pinned as an INVARIANT
 * rather than a corrected value: whatever the counts are, the number shown
 * beside the list must equal the number of rows IN that list, and the named
 * total must differ from it only by the Uncategorized bucket.
 */

import { describe, it, expect } from 'vitest';
import { summariseCategories, UNCATEGORIZED } from '@/lib/menu/categorySummary';

const p = (category: string | null) => ({ category });

describe('summariseCategories', () => {
    it('counts products per category, most populous first', () => {
        const s = summariseCategories([p('Soups'), p('Mains'), p('Mains')]);
        expect(s.categories).toEqual([
            { name: 'Mains', count: 2 },
            { name: 'Soups', count: 1 },
        ]);
    });

    it('rolls null, empty and whitespace-only categories into one bucket', () => {
        const s = summariseCategories([p(null), p(''), p('   ')]);
        expect(s.categories).toEqual([{ name: UNCATEGORIZED, count: 3 }]);
    });

    it('trims surrounding whitespace so " Soups" is not a second category', () => {
        const s = summariseCategories([p('Soups'), p(' Soups ')]);
        expect(s.categories).toEqual([{ name: 'Soups', count: 2 }]);
    });

    it('excludes the Uncategorized bucket from the named-category total', () => {
        const s = summariseCategories([p('Soups'), p('Mains'), p(null)]);
        expect(s.totalNamedCategories).toBe(2);
    });

    it('reports totalGroups as the number of rows the list will render', () => {
        const s = summariseCategories([p('Soups'), p('Mains'), p(null)]);
        expect(s.totalGroups).toBe(3);
        expect(s.totalGroups).toBe(s.categories.length);
    });

    /**
     * The regression that started this. If these two ever drift apart by
     * anything other than the bucket, the dashboard is lying again.
     */
    it('keeps named total and group total reconciled by exactly the bucket', () => {
        for (const products of [
            [p('Soups'), p('Mains'), p('Mains'), p('Dessert'), p('Sides'), p(null)],
            [p('Soups')],
            [p(null)],
            [],
        ]) {
            const s = summariseCategories(products);
            const hasBucket = s.categories.some(c => c.name === UNCATEGORIZED);
            expect(s.totalGroups).toBe(s.totalNamedCategories + (hasBucket ? 1 : 0));
            expect(s.totalGroups).toBe(s.categories.length);
        }
    });

    it('handles an empty menu without inventing groups', () => {
        const s = summariseCategories([]);
        expect(s).toEqual({ categories: [], totalNamedCategories: 0, totalGroups: 0 });
    });
});
