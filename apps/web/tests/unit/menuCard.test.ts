import { describe, it, expect } from 'vitest';
import { resolveBadge, BADGES } from '@/lib/menu/badges';
import { resolveOffer } from '@/lib/menu/offer';

/**
 * The two facts a menu card renders about a dish beyond its name, photo and
 * price: is it recommended, and is it on offer.
 *
 * Both lived inline in QRMenuTemplate.tsx and both were wrong in production:
 *
 *   - the detail sheet tested `ks_quadrant === 'star'` while the database
 *     stores 'Star', so the Bestseller chip could never render there;
 *   - the discount percentage was read from a stored `discount_pct` that can
 *     drift from the prices printed next to it.
 *
 * Pulling them out into pure functions is what makes those two classes of bug
 * testable at all.
 */

describe('resolveBadge', () => {
    it('matches the capitalised values the database actually stores', () => {
        // Confirmed against 1,000 production rows: Star / Plowhorse / Puzzle / Dog.
        expect(resolveBadge('Star')?.label).toBe('Best Seller');
        expect(resolveBadge('Plowhorse')?.label).toBe('Popular');
        expect(resolveBadge('Puzzle')?.label).toBe("Chef's Pick");
    });

    it('is case-insensitive, which is the bug that shipped', () => {
        // The detail sheet used lowercase 'star' and silently rendered nothing.
        // Accepting either casing means that class of bug cannot come back.
        for (const v of ['star', 'STAR', 'sTaR']) {
            expect(resolveBadge(v)?.label, `"${v}" should resolve`).toBe('Best Seller');
        }
        expect(resolveBadge('plowhorse')?.label).toBe('Popular');
        expect(resolveBadge('puzzle')?.label).toBe("Chef's Pick");
    });

    it('shows nothing for Dog, null, undefined or junk', () => {
        // 'Dog' is the menu-engineering quadrant for low-margin, low-popularity
        // items. Deliberately unbadged — never label it for the customer.
        for (const v of ['Dog', 'dog', null, undefined, '', 'Unicorn']) {
            expect(resolveBadge(v)).toBeNull();
        }
    });

    it('gives every badge a label a screen reader can say', () => {
        // The old markup was aria-hidden, so "Best Seller" was announced to
        // nobody. The label is information about the dish, not decoration.
        for (const b of Object.values(BADGES)) {
            expect(b.label.length).toBeGreaterThan(2);
            expect(b.label).not.toMatch(/[★✦🔥]/); // glyphs live in the icon, not the text
        }
    });
});

describe('resolveOffer', () => {
    it('is inactive when the flag is off or the original price is missing', () => {
        expect(resolveOffer({ discount_enabled: false, original_price: 100 }, 50).active).toBe(false);
        expect(resolveOffer({ discount_enabled: true }, 50).active).toBe(false);
        expect(resolveOffer(null, 50).active).toBe(false);
        expect(resolveOffer(undefined, 50).active).toBe(false);
    });

    it('derives the percentage from the prices rather than trusting the stored one', () => {
        // Real row: Grill Chicken, 300 -> 160. Stored pct was 47.
        const o = resolveOffer({ discount_enabled: true, original_price: 300, discount_pct: 47 }, 160);
        expect(o.active).toBe(true);
        expect(o.pct).toBe(47); // round(46.67)
        expect(o.was).toBe(300);
        expect(o.now).toBe(160);
    });

    it('ignores a stale stored percentage that contradicts the prices', () => {
        // An owner edits selling_price and forgets discount_pct. The card must
        // not shout "80% OFF" above a price that is 20% off.
        const o = resolveOffer({ discount_enabled: true, original_price: 100, discount_pct: 80 }, 80);
        expect(o.pct).toBe(20);
    });

    it('reports the saving in rupees, because that is the number people feel', () => {
        const o = resolveOffer({ discount_enabled: true, original_price: 1000 }, 400);
        expect(o.save).toBe(600);
        expect(o.pct).toBe(60);
    });

    it('refuses nonsense rather than rendering a negative discount', () => {
        // original_price below selling_price would print "-25% OFF".
        expect(resolveOffer({ discount_enabled: true, original_price: 40 }, 50).active).toBe(false);
        expect(resolveOffer({ discount_enabled: true, original_price: 50 }, 50).active).toBe(false);
        expect(resolveOffer({ discount_enabled: true, original_price: 0 }, 50).active).toBe(false);
    });

    it('accepts numeric strings, since JSON metadata is not type-safe', () => {
        const o = resolveOffer({ discount_enabled: true, original_price: '300' }, 160);
        expect(o.active, 'a stringified price must still resolve').toBe(true);
        expect(o.was).toBe(300);
    });

    it('suppresses a discount too small to be worth shouting about', () => {
        // A 1% "offer" cheapens every real one next to it.
        expect(resolveOffer({ discount_enabled: true, original_price: 101 }, 100).active).toBe(false);
    });
});
