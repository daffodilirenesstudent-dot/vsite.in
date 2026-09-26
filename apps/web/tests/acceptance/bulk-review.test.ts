import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Bulk "Scan & Review" had no review (QA 2026-09-26). After extraction the
 * owner was asked only for bestsellers and high-margin picks; the names,
 * prices and categories the AI read went straight onto the live menu, and new
 * categories appeared that nobody chose. Menu data is the core asset — an
 * AI misread must be seen before a diner sees it.
 *
 * Now the first review step is "Check items": every dish, its price and its
 * category, editable, each with a tick to leave it out. Nothing priced ₹0
 * can be added.
 */

const SRC = join(__dirname, '..', '..', 'src');
const shipped = (p: string) =>
    readFileSync(join(SRC, p), 'utf8').replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/\/\/[^\n]*/g, '');
const BULK = 'components/manage/BulkImportModal.tsx';

const row = (over: Partial<{ name: string; price: number; category: string; variants: { size: string; price: number }[]; include: boolean }>) => ({
    name: 'Masala Dosa', price: 80, category: 'Tiffin', variants: [], include: true, ...over,
});

describe('the check step\'s rules', () => {
    it('flags included dishes with no name or no price', async () => {
        const { reviewProblems } = await import('@/lib/menu/bulkReview');
        expect(reviewProblems([row({}), row({ price: 0 }), row({ name: '  ' }), row({ price: 0, include: false })]))
            .toEqual({ missingName: 1, missingPrice: 1 });
    });

    it('a Sizes dish is priced by its sizes', async () => {
        const { reviewProblems } = await import('@/lib/menu/bulkReview');
        expect(reviewProblems([row({ price: 0, variants: [{ size: 'Half', price: 90 }] })])).toEqual({ missingName: 0, missingPrice: 0 });
    });

    it('adds only the ticked dishes, tidied, with a Sizes dish at its cheapest size', async () => {
        const { itemsToAdd } = await import('@/lib/menu/bulkReview');
        const out = itemsToAdd([
            row({ name: ' Idli ', category: ' Tiffin ' }),
            row({ name: 'Vada', include: false }),
            row({ name: 'Lassi', price: 0, variants: [{ size: 'Large', price: 80 }, { size: 'Small', price: 50 }] }),
        ]);
        expect(out.map(i => i.name)).toEqual(['Idli', 'Lassi']);
        expect(out[0].category).toBe('Tiffin');
        expect(out[1].price).toBe(50);
        expect(out.every(i => !('include' in i))).toBe(true);
    });

    it('lists the categories the owner is about to add, with counts', async () => {
        const { categorySummary } = await import('@/lib/menu/bulkReview');
        expect(categorySummary([row({ category: 'Tiffin' }), row({ category: 'Tiffin' }), row({ category: 'Drinks' }), row({ category: 'Ghost', include: false }), row({ category: '' })]))
            .toEqual([{ name: 'Tiffin', count: 2 }, { name: 'Drinks', count: 1 }]);
    });
});

describe('the modal runs the check before anything is added', () => {
    it('extraction lands on the check step, not the bestseller picker', () => {
        const bulk = shipped(BULK);
        expect(bulk).toMatch(/setPhase\('check'\)/);
    });

    it('every dish has an editable, labelled name and price, and a leave-out tick', () => {
        const bulk = shipped(BULK);
        expect(bulk).toMatch(/aria-label=\{`Name of item \$\{idx \+ 1\}`\}/);
        expect(bulk).toMatch(/aria-label=\{`Price of \$\{item\.name \|\| `item \$\{idx \+ 1\}`\}`\}/);
        expect(bulk).toMatch(/type="checkbox"/);
    });

    it('cannot continue while a ticked dish has no price', () => {
        const bulk = shipped(BULK);
        const check = bulk.slice(bulk.indexOf("phase === 'check' && ("));
        expect(check).toMatch(/disabled=\{problems\.missingName > 0 \|\| problems\.missingPrice > 0 \|\| included === 0\}/);
    });

    it('sends only what the owner kept', () => {
        const bulk = shipped(BULK);
        const insert = bulk.slice(bulk.indexOf('const runInsert'), bulk.indexOf('// ── Review helpers'));
        expect(insert).toMatch(/items:\s*itemsToAdd\(extractedItems\)/);
    });

    it('the steps are counted as four', () => {
        expect(shipped(BULK)).toMatch(/Step 2 of 4 — Check names and prices/);
    });
});
