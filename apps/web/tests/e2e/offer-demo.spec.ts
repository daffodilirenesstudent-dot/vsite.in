import { test, expect, type Page } from '@playwright/test';

/**
 * The offer demo in the "Offers, live in a minute" bento card.
 *
 * The card used to show a static gradient strip of an offer banner — a picture
 * of the feature. This is the feature: flip the switch and the diner's phone
 * beside it updates, so a visitor understands what "live in a minute" means
 * without signing up. It is the same argument the sold-out card above it makes,
 * and it is tested the same way: drive the control, assert the menu changed.
 */

const DEMO = '[data-testid="offer-demo"]';
const SWITCH = '[data-testid="offer-switch"]';
/**
 * The banner stays mounted so it can animate closed instead of snapping out;
 * its height is collapsed to 0 by the wrapper. Assert the wrapper's height
 * rather than the banner's presence — a clipped child still reports its own
 * natural bounding box, so both toHaveCount(0) and toBeVisible() would lie
 * here about what the visitor can actually see.
 */
const BANNER_SLOT = '[data-testid="offer-banner-slot"]';

async function slotHeight(page: Page): Promise<number> {
    return page.locator(BANNER_SLOT).evaluate((el) => el.getBoundingClientRect().height);
}
const BADGE = '[data-testid="offer-badge"]';

async function gotoDemo(page: Page) {
    await page.goto('/');
    await page.locator(DEMO).scrollIntoViewIfNeeded();
    await expect(page.locator(DEMO)).toBeVisible();
}

test.describe('offer demo', () => {
    test('starts off, with the diner phone showing no offer', async ({ page }) => {
        await gotoDemo(page);

        // Off by default: the visitor should get to cause the change themselves.
        // If it started on, there is nothing to discover.
        await expect(page.locator(SWITCH)).toHaveAttribute('aria-checked', 'false');
        expect(await slotHeight(page)).toBe(0);
        await expect(page.locator(BADGE)).toHaveCount(0);
    });

    test('turning it on puts the offer on the phone', async ({ page }) => {
        await gotoDemo(page);
        await page.locator(SWITCH).click();

        await expect(page.locator(SWITCH)).toHaveAttribute('aria-checked', 'true');
        await expect(page.locator(BADGE)).toBeVisible();
        await expect
            .poll(() => slotHeight(page), { message: 'offer banner should open' })
            .toBeGreaterThan(0);
    });

    test('turning it off takes the offer back down', async ({ page }) => {
        await gotoDemo(page);
        await page.locator(SWITCH).click();
        await expect.poll(() => slotHeight(page)).toBeGreaterThan(0);

        await page.locator(SWITCH).click();
        await expect(page.locator(SWITCH)).toHaveAttribute('aria-checked', 'false');
        await expect(page.locator(BADGE)).toHaveCount(0);
        await expect.poll(() => slotHeight(page), { message: 'banner should close' }).toBe(0);
    });

    test('is operable from the keyboard', async ({ page }) => {
        await gotoDemo(page);
        await page.locator(SWITCH).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator(SWITCH)).toHaveAttribute('aria-checked', 'true');
    });

    test('announces the change to assistive tech', async ({ page }) => {
        // The phone is decorative markup; without a live region a screen reader
        // user flips the switch and hears nothing at all.
        await gotoDemo(page);
        const status = page.locator(`${DEMO} [role="status"]`);
        await expect(status).toHaveCount(1);

        await page.locator(SWITCH).click();
        await expect(status).toContainText(/live|showing/i);
    });

    test('the phone sits beside the control on a laptop', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await gotoDemo(page);

        const control = page.locator('[data-testid="offer-control"]');
        const phone = page.locator('[data-testid="offer-phone"]');
        const c = await control.boundingBox();
        const p = await phone.boundingBox();
        if (!c || !p) throw new Error('offer demo did not lay out');

        // Side by side, not stacked.
        expect(p.x).toBeGreaterThan(c.x + c.width - 1);
    });

    test('stacks on a phone instead of overflowing', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await gotoDemo(page);

        const phone = page.locator('[data-testid="offer-phone"]');
        const box = await phone.boundingBox();
        if (!box) throw new Error('offer phone did not render');
        expect(box.x + box.width).toBeLessThanOrEqual(390);

        // And the page itself must not scroll sideways.
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
    });
});
