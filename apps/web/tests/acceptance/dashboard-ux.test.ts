import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The owner dashboard's user experience.
 *
 * Two review passes over the live dashboard produced findings in four groups,
 * and this suite guards the ones that are checkable from source:
 *
 *   1. Ordering language leaking into dashboard chrome. `ordering-roadmap-copy`
 *      guards `src/content/**` only, so every string under `src/app/manage/`,
 *      `src/app/login`, `src/app/signup` and `src/components/` drifted freely.
 *      That is how "Manage your orders in real-time" survived the freeze.
 *
 *   2. Contrast and touch targets, for owners on mid-range phones in daylight.
 *
 *   3. Controls that do nothing. A search box with no handler, a shortcut hint
 *      bound to nothing, a "coming soon" button — all removed rather than left
 *      to teach owners the app is unreliable.
 *
 *   4. Whatever shape the owner has settled on for the poster and the billing
 *      cycle. Two of these rules were reversed on 11 Sep 2026; the suites that
 *      cover them carry the before/after and the reasoning, so a later reader
 *      does not "fix" a deliberate decision.
 */

const WEB = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(WEB, 'src', p), 'utf8');

const DASHBOARD = 'app/manage/dashboard/page.tsx';
const INVENTORY = 'app/manage/product-inventory/page.tsx';
const QR = 'app/manage/qr/page.tsx';
const SETTINGS = 'app/manage/settings/page.tsx';
const SUBSCRIPTION = 'app/manage/subscription/page.tsx';
const LOGIN = 'app/login/page.tsx';
const SIGNUP = 'app/signup/page.tsx';
const HEADER = 'components/DashboardHeader.tsx';
const SIDEBAR = 'components/Sidebar.tsx';

/** Files an owner sees while signed in, plus the two auth screens. */
const OWNER_SURFACES = [DASHBOARD, INVENTORY, QR, SETTINGS, LOGIN, SIGNUP, HEADER, SIDEBAR];

describe('the dashboard does not promise ordering', () => {
    // Each entry is a string found on the live dashboard during review.
    const BANNED: Array<[string, RegExp]> = [
        ['manage your orders', /Manage your orders/i],
        ['convert crowds into orders', /Convert crowds into orders/i],
        ['continue your order', /continue your order/i],
        ['available for orders', /Available for Orders/i],
        ['sequential tokens', /Tokens are sequential/i],
    ];

    for (const [name, pattern] of BANNED) {
        it(`never says "${name}"`, () => {
            for (const file of OWNER_SURFACES) {
                expect(read(file), `${file} still contains "${name}"`).not.toMatch(pattern);
            }
        });
    }

    it('does not tell owners the store deletion removes their orders', () => {
        expect(read(SETTINGS)).not.toMatch(/banners,\s*and orders/i);
    });
});

describe('the printed poster uses the owner\'s own artwork', () => {
    /**
     * REVERSED BY THE OWNER, 11 Sep 2026.
     *
     * This suite previously required the opposite: that the menu-only plan be
     * routed away from the "Scan & Order" template and given a poster drawn in
     * code, because ordering is frozen and that artwork tells a customer to do
     * something every order route answers with a 403.
     *
     * The owner asked for their own template back. That is their call, so the
     * tests now guard the shape they chose rather than the one I argued for.
     *
     * UPDATED BY THE OWNER, 26 Sep 2026. Their QA list flagged the "SCAN &
     * ORDER" headline as a freeze break, and — asked explicitly, with the
     * 11 Sep decision in front of them — they chose a copy of the same artwork
     * reading "SCAN FOR MENU" while ordering is frozen. It is still their own
     * PNG, not a code-drawn poster; the ordering artwork stays for the day
     * ordering ships. The rule lives in lib/qr/posterTemplate.ts and is guarded
     * by ordering-roadmap-copy.test.ts.
     */
    it('composites onto the owner\'s PNG templates', () => {
        const rule = read('lib/qr/posterTemplate.ts');
        expect(read(QR)).toMatch(/classicPosterTemplate\(/);
        expect(rule).toMatch(/brand poster scan menu\.png/);
        expect(rule).toMatch(/brand poster scan order\.png/);
        expect(rule).toMatch(/brand poster template\.png/);
    });

    it('does not reintroduce the code-drawn poster', () => {
        expect(read(QR)).not.toMatch(/drawMenuPoster/);
    });
});

describe('the QR page carries only what the owner asked for', () => {
    it('has no Design Tip card', () => {
        expect(read(QR)).not.toMatch(/Design Tip/);
    });

    it('does not advertise a poster customiser that does not exist', () => {
        expect(read(QR)).not.toMatch(/Customise Poster/);
    });
});

describe('the plan runs a plain 30-day cycle', () => {
    /**
     * REVERSED BY THE OWNER, 11 Sep 2026.
     *
     * This suite previously required an active plan to stay payable, because
     * `verify-payment` bases a same-plan renewal on max(now, current expiry)
     * and so paying early costs the owner nothing. The owner wants standard
     * SaaS instead: pay, get 30 days, pay again once they lapse.
     *
     * The accepted consequence is a gap — the menu is offline between expiry
     * and payment. The T-3 reminder email is what keeps that gap short.
     */
    it('offers nothing to buy while the plan is running', () => {
        expect(read(SUBSCRIPTION)).toMatch(/disabled=\{isQrMenuActive \|\| isTrialActive\}/);
    });

    it('does not offer an early extension', () => {
        expect(read(SUBSCRIPTION)).not.toMatch(/Extend by 30 days/);
    });

    it('still lets a lapsed plan be renewed', () => {
        expect(read(SUBSCRIPTION)).toMatch(/isPlanExpired\s*\n?\s*\?\s*`Renew/);
    });

    it('keeps the invoice history', () => {
        // The one part of the subscription work the owner kept.
        expect(read(SUBSCRIPTION)).toMatch(/Invoice history/);
    });
});

describe('text stays readable on a phone in daylight', () => {
    it('does not use the 2.6:1 grey for text on the dashboard surfaces', () => {
        // #99A1AF on white measures 2.60:1 — below the 4.5:1 AA threshold — and
        // it was carrying 9px and 11px labels.
        for (const file of [DASHBOARD, INVENTORY, HEADER]) {
            expect(read(file), `${file} still uses #99A1AF`).not.toMatch(/#99A1AF/i);
        }
    });
});

describe('search is gone rather than half-working', () => {
    // The owner's instruction was "if it is not working, remove it". Both the
    // global header search and the in-page product search are out.
    it('the header renders no search field', () => {
        const header = read(HEADER);
        expect(header).not.toMatch(/placeholder="Search/);
        expect(header).not.toMatch(/role="search"/);
    });

    it('does not advertise a keyboard shortcut for a search that is gone', () => {
        const header = read(HEADER);
        expect(header).not.toMatch(/⌘ \+ F/);
        expect(header).not.toMatch(/Ctrl \+ K/);
    });

    it('the inventory page has no search box either', () => {
        expect(read(INVENTORY)).not.toMatch(/Search your menu/);
    });
});

describe('a missing product image is reported once', () => {
    it('has no page-level missing-image banner', () => {
        // It was showing on the card and again at the top of the page, which
        // read as two separate problems.
        expect(read(INVENTORY)).not.toMatch(/missing an image/);
    });

    it('still flags it on the product row', () => {
        expect(read(INVENTORY)).toMatch(/No photo yet/);
    });
});

describe('the inventory list shows the food', () => {
    it('renders a product thumbnail in the list', () => {
        // Every product has an image, the edit drawer shows it and the customer
        // menu shows it — but the management list was text-only, which makes the
        // owner read instead of recognise.
        expect(read(INVENTORY)).toMatch(/ProductThumb/);
    });
});
