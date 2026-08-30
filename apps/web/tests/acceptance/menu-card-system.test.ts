import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The locked QR-menu card system.
 *
 * Settled on the design canvas and frozen here so it cannot drift back. Four
 * decisions, each with a reason that outlives the pixel value:
 *
 *   1. AN OFFER IS A TINTED CARD, NOTHING ELSE. The old treatment stacked a
 *      full-width gradient ribbon, a pink wash, a pink border and a pink
 *      shadow. On a list where several dishes are discounted they compete with
 *      each other and with the food. The ground colour alone now carries it.
 *
 *   2. THE CARD MUST LOOK TAPPABLE. It opens a detail sheet and nothing said
 *      so. Google's tappability work is blunt about flat elements being
 *      misread, and our diner has no Swiggy habit to fall back on. A chevron
 *      plus a lift off the page is the cheapest honest signal.
 *
 *   3. SOLD-OUT ITEMS STAY ON THE MENU. They used to be filtered out of the
 *      SQL entirely, so a diner could not tell "finished today" from "not on
 *      the menu" and had to ask staff. Now they are shown greyed, sunk to the
 *      bottom, and not tappable.
 *
 *   4. THE DETAIL SHEET IS A READING SURFACE. vsite takes no orders, so
 *      nothing in it may imply a transaction. Selectable size pills were the
 *      worst of it: they looked like a choice, responded to a tap, and led
 *      nowhere.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');

const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments name the values that were removed, so match on shipped source. */
const shipped = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const CARD = 'components/templates/MenuItemCard.tsx';
const TOKENS = 'components/templates/menuTokens.ts';
const TEMPLATE = 'components/templates/QRMenuTemplate.tsx';
const SHOP_PAGE = 'app/shop/[slug]/page.tsx';
const SHOP_CLIENT = 'app/shop/[slug]/ShopPageClient.tsx';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Offer card — tint only
// ─────────────────────────────────────────────────────────────────────────────

describe('offer card', () => {
    it('marks an offer with the tinted ground', () => {
        expect(read(TOKENS)).toMatch(/offerTint/);
        expect(shipped(TOKENS)).toMatch(/#FFECEC/i);
    });

    it('has no ribbon element at all', () => {
        expect(shipped(CARD)).not.toMatch(/offer-ribbon/);
        expect(shipped(CARD)).not.toMatch(/SAVE \{CURR\}/);
    });

    it('drops the pink wash, pink border and pink shadow', () => {
        const src = shipped(CARD);
        expect(src).not.toMatch(/pinkWash/);
        expect(src).not.toMatch(/pinkLine/);
        expect(src, 'the offer card must not carry its own shadow').not.toMatch(/rgba\(239,89,161/);
    });

    it('has no discount flag on the photo', () => {
        // Drawn once, then removed on the canvas: the tint carries the offer.
        expect(shipped(CARD)).not.toMatch(/% OFF</);
    });

    it('prices the offer in dark ink with a struck original and a green saving', () => {
        const src = shipped(CARD);
        expect(src, 'live price is dark ink, not brand pink').toMatch(/#191919/);
        expect(src).toMatch(/line-through/);
        expect(src, 'saving is green text, not a chip').toMatch(/saveGreen|#13801C/);
        expect(src, 'the green saving chip background is gone').not.toMatch(/saveWash/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tap affordance
// ─────────────────────────────────────────────────────────────────────────────

describe('tap affordance', () => {
    const card = () => shipped(CARD);

    it('lifts the card off the page instead of sitting flat on #FAFAFA', () => {
        expect(card()).toMatch(/box[Ss]hadow/);
    });

    it('draws a chevron on every tappable card', () => {
        expect(card()).toMatch(/M9 18l6-6-6-6/);
    });

    it('gives a pressed state, the only tap feedback a phone has', () => {
        expect(card()).toMatch(/scale\(0\.985\)|qr-card-press/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Product type on the card
// ─────────────────────────────────────────────────────────────────────────────

describe('single / variant / combo', () => {
    const card = () => shipped(CARD);

    it('names how many sizes a variant dish has', () => {
        expect(card()).toMatch(/sizes/);
    });

    it('says a combo is a combo and how many items it holds', () => {
        expect(card()).toMatch(/Combo/);
    });

    it('qualifies a variant price as a minimum', () => {
        // "₹95" alone is a promise the Family size breaks.
        expect(card()).toMatch(/onwards/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sold out
// ─────────────────────────────────────────────────────────────────────────────

describe('sold out', () => {
    it('is no longer filtered out of the menu query', () => {
        expect(
            shipped(SHOP_PAGE),
            'the shop page must fetch sold-out items so they can be shown greyed',
        ).not.toMatch(/\.neq\('is_live', false\)/);
    });

    it('is no longer dropped by the realtime channel', () => {
        const src = shipped(SHOP_CLIENT);
        expect(src).not.toMatch(/function shouldExcludeProduct/);
    });

    it('renders the greyed treatment', () => {
        const src = shipped(CARD);
        expect(src).toMatch(/grayscale\(1\)/);
        expect(src).toMatch(/SOLD OUT/);
    });

    it('is not tappable and says so to a screen reader', () => {
        const src = shipped(CARD);
        expect(src).toMatch(/aria-disabled/);
        expect(src, 'a sold-out card must not carry the tappable chevron').toMatch(/soldOut/);
    });

    it('sinks below the available items in its category', () => {
        expect(shipped(TEMPLATE)).toMatch(/soldOut|is_live === false/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Detail sheet is a reading surface
// ─────────────────────────────────────────────────────────────────────────────

describe('detail sheet', () => {
    const tpl = () => shipped(TEMPLATE);

    it('lists variant prices read-only rather than as selectable pills', () => {
        // The pill set was driven by selectedVariantIdx; in a read-only sheet
        // there is nothing to select.
        expect(
            tpl(),
            'variant selection state has no meaning on a menu that takes no orders',
        ).not.toMatch(/setSelectedVariantIdx/);
    });

    it('tells a combo buyer what is inside', () => {
        expect(tpl()).toMatch(/What's inside|Whats inside|comboItems/);
    });

    it('closes by saying what to do next instead of dead-ending', () => {
        expect(tpl()).toMatch(/tell our staff/i);
    });

    it('opens on the settle curve, not the overshoot one', () => {
        const src = read(TEMPLATE);
        expect(src, 'the bouncing curve makes a photo panel look cheap')
            .not.toMatch(/cubic-bezier\(0\.34,1\.2,0\.64,1\)/);
        expect(src).toMatch(/cubic-bezier\(0\.32,\s*0\.72,\s*0,\s*1\)/);
    });
});
