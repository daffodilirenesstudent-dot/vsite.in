import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shopNameFontSize, SHOP_NAME_MAX_PX, SHOP_NAME_MIN_PX } from '@/lib/menu/shopNameStyle';

/**
 * The shop name in the menu header.
 *
 * Owner report, 2026-09-21: the name "did not look like a shop name" — it sat
 * at 16px in the same face as the dish names below it — and a long name such as
 * "Daffodil Irene ❤️ Cafe & Restaurant" wrapped into a ragged block. Two causes:
 * one fixed size for every name, and a 700 weight the Warm theme's Newsreader
 * face was never loaded at, so the browser fell back to a near-body weight.
 */

describe('shopNameFontSize', () => {
    it('gives a short name the full wordmark size', () => {
        expect(shopNameFontSize('Cream Story')).toBe(SHOP_NAME_MAX_PX);
    });

    it('steps a long name down so it fits two balanced lines', () => {
        const long = shopNameFontSize('Daffodil Irene ❤️ Cafe & Restaurant');
        expect(long).toBeLessThan(SHOP_NAME_MAX_PX);
        expect(long).toBeGreaterThanOrEqual(SHOP_NAME_MIN_PX);
    });

    it('never shrinks below the floor, however long the name', () => {
        expect(shopNameFontSize('A'.repeat(120))).toBe(SHOP_NAME_MIN_PX);
    });

    it('never grows as the name gets longer', () => {
        let prev = Infinity;
        for (let n = 1; n <= 60; n++) {
            const px = shopNameFontSize('x'.repeat(n));
            expect(px).toBeLessThanOrEqual(prev);
            prev = px;
        }
    });

    it('ignores the padding an owner typed around the name', () => {
        expect(shopNameFontSize('   Cream Story   ')).toBe(shopNameFontSize('Cream Story'));
    });

    it('stays larger than a dish name at its smallest', () => {
        // Dish names render at 16px; the shop name must not drop under them.
        expect(SHOP_NAME_MIN_PX).toBeGreaterThanOrEqual(16);
    });
});

describe('menu fonts', () => {
    it('loads the Warm display face at a real bold, so the name is not faux-bold', () => {
        const src = readFileSync(resolve(__dirname, '../../src/app/shop/layout.tsx'), 'utf8');
        const block = src.match(/Newsreader\(\{[\s\S]*?\}\)/)?.[0] ?? '';
        expect(block).toMatch(/weight:\s*\[[^\]]*'700'/);
    });
});
