import { test, expect, type Page } from '@playwright/test';

/**
 * The customer-facing menu card, driven on /shop/preview.
 *
 * That route renders one product in each state the card can be in — plain,
 * each recommendation badge, an active offer, an offer with a badge, and a
 * missing photo — so it is both the design harness and the test fixture.
 *
 * These cover the three defects found in the teardown:
 *   1. the detail sheet's badge check was dead code (lowercase 'star');
 *   2. search results had no offer treatment at all;
 *   3. an offer restyled only the price row, so it was invisible while scrolling.
 *
 * On (3): the fix was the tinted card ground, NOT a ribbon. The offer
 * treatment is locked by tests/acceptance/menu-card-system.test.ts — one
 * signal, the ground colour, with the saving stated in rupees in the price
 * row. That file forbids a ribbon element outright, so these tests read the
 * price row and the card's own background. Do not reintroduce a ribbon
 * locator here without changing the frozen decision there first.
 */

const CARD = '[data-testid="menu-item-card"]';
const BADGE = '[data-testid="menu-badge"]';

/**
 * The preview route resolves a Suspense boundary after `load`, which swaps the
 * card nodes out. Locators resolved before that point end up detached, and
 * getComputedStyle on a detached node returns empty strings — which read as
 * "the styles are identical" rather than as an error. Wait for the network to
 * settle and for the full set to be present before measuring anything.
 */
const SAMPLE_CARD_COUNT = 6;

async function gotoMenu(page: Page) {
    await page.goto('/shop/preview', { waitUntil: 'networkidle' });
    await expect(page.locator(CARD)).toHaveCount(SAMPLE_CARD_COUNT);
    await expect(page.locator(CARD).first()).toBeVisible();
}

test.describe('offer cards stand out', () => {
    test('an offer restyles the whole card, not just the price', async ({ page }) => {
        await gotoMenu(page);

        const offerCard = page.locator(`${CARD}[data-offer="true"]`).first();
        const plainCard = page.locator(`${CARD}[data-offer="false"]`).first();
        await expect(offerCard).toBeVisible();

        // backgroundColor, not backgroundImage: the offer ground is a flat
        // tint (T.offerTint), so both cards report backgroundImage:none and
        // the old assertion compared two empty values against each other.
        const read = (el: Element) =>
            getComputedStyle(el).backgroundColor + '|' + getComputedStyle(el).borderColor;
        const [offerBg, plainBg] = await Promise.all([
            offerCard.evaluate(read),
            plainCard.evaluate(read),
        ]);

        // The whole card must differ — this is what makes an offer findable
        // while scrolling. Previously only the bottom-left corner changed.
        expect(offerBg).not.toBe(plainBg);
    });

    test('the saving is stated in rupees, not as a percentage', async ({ page }) => {
        await gotoMenu(page);
        const offerCard = page.locator(`${CARD}[data-offer="true"]`).first();
        // "₹65 OFF" — the rupee figure is the one people feel. A percentage
        // asks the reader to do arithmetic on a price they have not read yet.
        await expect(offerCard).toContainText(/₹\d+ OFF/);
    });

    test('the saving is derived from the prices, never from stored metadata', async ({ page }) => {
        await gotoMenu(page);
        // Chocolate Milk Shake is 260 -> 195 and carries NO discount_pct in
        // metadata at all, so ₹65 can only have come from the two prices.
        // resolveOffer is the single source; see tests/unit for the arithmetic.
        const shake = page.locator(CARD).filter({ hasText: 'Chocolate Milk Shake' });
        await expect(shake).toContainText('₹65 OFF');
    });

    test('a discounted card still shows both prices', async ({ page }) => {
        await gotoMenu(page);
        const shake = page.locator(CARD).filter({ hasText: 'Chocolate Milk Shake' });
        await expect(shake).toContainText('₹195');
        await expect(shake).toContainText('₹260');
        await expect(shake).toContainText('₹65 OFF');
    });
});

test.describe('recommendation badges', () => {
    test('render for every quadrant the database stores', async ({ page }) => {
        await gotoMenu(page);
        await expect(page.locator(CARD).filter({ hasText: 'The Matilda Cake' }).locator(BADGE))
            .toContainText('Best Seller');
        await expect(page.locator(CARD).filter({ hasText: 'Chocolate Milk Shake' }).locator(BADGE))
            .toContainText('Popular');
        await expect(page.locator(CARD).filter({ hasText: 'Heaven Cake' }).locator(BADGE))
            .toContainText("Chef's Pick");
    });

    test('never label a Dog item', async ({ page }) => {
        // Low popularity, low margin. An internal judgement that must not reach
        // the customer.
        await gotoMenu(page);
        const waffle = page.locator(CARD).filter({ hasText: 'Smoothy Waffle' });
        await expect(waffle.locator(BADGE)).toHaveCount(0);
    });

    test('are announced to screen readers', async ({ page }) => {
        // The old badge was aria-hidden, so "Best Seller" reached nobody.
        await gotoMenu(page);
        const label = await page.locator(CARD).filter({ hasText: 'The Matilda Cake' })
            .first().getAttribute('aria-label');
        expect(label).toContain('Best Seller');
    });

    test('an offer is announced with both prices', async ({ page }) => {
        await gotoMenu(page);
        const label = await page.locator(CARD).filter({ hasText: 'Chocolate Milk Shake' })
            .first().getAttribute('aria-label');
        expect(label).toMatch(/on offer/i);
        expect(label).toContain('₹195');
        expect(label).toContain('₹260');
    });
});

test.describe('legibility and layout', () => {
    test('descriptions clear the mobile legibility floor', async ({ page }) => {
        // They were 10px at weight 300 in mid-grey — the one asset on the card
        // proven to move order value, set below the point it can be read.
        await page.setViewportSize({ width: 390, height: 844 });
        await gotoMenu(page);

        const desc = page.locator(CARD).first().locator('p', { hasText: 'Three layers' });
        await expect(desc).toBeVisible();
        const size = await desc.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        const weight = await desc.evaluate((el) => getComputedStyle(el).fontWeight);
        expect(size).toBeGreaterThanOrEqual(13);
        expect(Number(weight)).toBeGreaterThanOrEqual(400);
    });

    test('the card grows for its content instead of clipping', async ({ page }) => {
        await gotoMenu(page);
        const offer = page.locator(`${CARD}[data-offer="true"]`).first();
        const plain = page.locator(`${CARD}[data-offer="false"]`).first();
        await expect(offer).toBeVisible();
        await expect(plain).toBeVisible();
        // boundingBox waits for a settled box; getBoundingClientRect during
        // hydration can read 0 and made this flaky.
        const offerH = (await offer.boundingBox())!.height;
        const plainH = (await plain.boundingBox())!.height;
        // The ribbon needs real vertical room; the old fixed 138px had none.
        expect(offerH).toBeGreaterThan(plainH);
    });

    test('does not scroll sideways on a small phone', async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 740 });
        await gotoMenu(page);
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
    });
});
