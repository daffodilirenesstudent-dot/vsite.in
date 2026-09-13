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
        expect(shipped(TOKENS)).toMatch(/#FAF5EC/i);
    });

    it('does not tint the ground in a hue that is already a signal', () => {
        // The tint was #FFECEC, a pale RED — and the non-veg mark (#FB2C36) is
        // red, so the one mark Indian law requires to be unmistakable sat on a
        // ground of its own hue. The Popular badge (#FFEDE9) was a near match
        // for it too, so that pill all but vanished on a discounted row.
        // Warm sand collides with neither, and with nothing else in the palette.
        const tokens = shipped(TOKENS);
        expect(tokens).not.toMatch(/offerTint: '#FFE/i);
        expect(tokens).toMatch(/offerTint: '#FAF5EC'/i);
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

    it('does not draw a chevron', () => {
        // Tried, then removed on the owner's call after seeing it on a real
        // phone. The affordance now rests on the lift, the press state and a
        // photo big enough to read as a thing you open.
        expect(card()).not.toMatch(/M9 18l6-6-6-6/);
    });

    it('gives the photo enough size to carry the dish', () => {
        // 108 left the photo smaller than the text block beside it.
        expect(card()).toMatch(/const THUMB = 12\d/);
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
// 4b. Photos actually appear
// ─────────────────────────────────────────────────────────────────────────────

describe('thumbnail loading', () => {
    it('does not lazy-load the first screenful', () => {
        // Every thumb carried loading="lazy", which defers exactly the images
        // the reader opens the menu to look at. On a phone that reads as "the
        // pictures never loaded".
        const src = shipped(CARD);
        expect(src, 'no eager path for above-the-fold thumbs')
            .toMatch(/priority \? 'eager' : 'lazy'/);
        expect(src).toMatch(/fetchPriority/);
        expect(shipped(TEMPLATE), 'the list must decide which cards are eager')
            .toMatch(/eagerImageIds/);
    });

    it('settles an image that was already cached before onLoad attached', () => {
        // A cached image can complete before React attaches the handler, so
        // onLoad never fires and the thumb sits at opacity 0 for ever.
        expect(shipped(CARD)).toMatch(/\.complete/);
    });

    it('renders no image frame at all when the dish has no photo', () => {
        // An empty grey frame with a picture glyph reads as "this image
        // failed", not "this dish has no photo", and it costs a third of the
        // row. The text spans the card instead.
        const src = shipped(CARD);
        expect(src, 'the card must know whether it has an image').toMatch(/hasImage/);
        expect(src, 'the grid must collapse to one column').toMatch(/hasRightColumn \? `1fr \$\{THUMB\}px` : '1fr'/);
        expect(src, 'the no-image placeholder glyph must be gone')
            .not.toMatch(/<rect x="3" y="4" width="18" height="16"/);
    });

    it('never positions the sheet label onto the photo', () => {
        // Absolutely positioned onto the hero, it moved with the hero — and
        // once a dish could have no photo, it landed on the dish name.
        expect(
            shipped(TEMPLATE),
            'the recommendation label must sit in normal flow above the name',
        ).not.toMatch(/position: 'absolute', top: 12, left: 12/);
    });

    it('renders no image frame in the detail sheet either', () => {
        const src = shipped(TEMPLATE);
        expect(src, 'the placeholder component should be gone with its callers')
            .not.toMatch(/function ImgPlaceholder/);
        expect(src, 'the pink gradient stand-in must not render')
            .not.toMatch(/fce4ee/);
    });

    it('reserves the box so the row does not reflow when a photo lands', () => {
        expect(shipped(CARD)).toMatch(/width=\{THUMB\}/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Detail sheet is a reading surface
// ─────────────────────────────────────────────────────────────────────────────

describe('detail sheet', () => {
    const tpl = () => shipped(TEMPLATE);

    it('lists variant prices read-only when nothing can be ordered', () => {
        const src = tpl();

        // The read-only list must exist and be the branch taken on the view
        // tier — that is the defect being fixed.
        expect(src, 'no read-only price row').toMatch(/variant-price-row/);
        expect(src, 'the read-only list must be gated on !canOrder')
            .toMatch(/\{!canOrder && variants\.map/);

        // The selectable picker is deliberately RETAINED behind canOrder. It
        // is what the freeze is hiding and it has to work the day ordering is
        // switched back on — the same reason paymentAttacks.test.ts forces
        // ORDERING_FROZEN off rather than letting the frozen payment defences
        // rot. So this asserts the picker is GATED, not that it is gone.
        expect(src, 'the picker must not render on the view tier')
            .toMatch(/\{canOrder && variants\.map/);
    });

    it('tells a combo buyer what is inside', () => {
        expect(tpl()).toMatch(/What's inside|Whats inside|comboItems/);
    });

    it('does not carry a staff instruction line', () => {
        // Added by me, then cut on the owner's call: the diner already knows
        // how to order in their own restaurant, so the line spent a whole row
        // telling them something they were not asking.
        expect(tpl()).not.toMatch(/tell our staff/i);
    });

    it('opens on the settle curve, not the overshoot one', () => {
        const src = read(TEMPLATE);
        expect(src, 'the bouncing curve makes a photo panel look cheap')
            .not.toMatch(/cubic-bezier\(0\.34,1\.2,0\.64,1\)/);
        expect(src).toMatch(/cubic-bezier\(0\.32,\s*0\.72,\s*0,\s*1\)/);
    });
});
