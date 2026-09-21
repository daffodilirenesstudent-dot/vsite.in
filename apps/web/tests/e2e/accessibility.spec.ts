/**
 * Accessibility regression guard — WCAG 2.1 AA, the subset that bites hardest.
 *
 * QA 2026-09-20 found form fields across the funnel identified ONLY by
 * placeholder text. A placeholder is not an accessible name: screen readers
 * announce nothing, and the hint disappears the moment the user types — so a
 * distracted owner mid-form has no way back to what the field wanted.
 *
 * vsite's users are restaurant and café owners in Tamil Nadu, explicitly
 * assumed in CLAUDE.md to have low digital literacy. Unlabelled fields are a
 * conversion problem here before they are a compliance one: /signup is the
 * very first screen a paying customer meets.
 *
 * Written with plain Playwright rather than axe-core so it needs no new
 * dependency. It computes the accessible name the way a screen reader
 * resolves it: aria-label → <label for> → wrapping <label> → aria-labelledby
 * → title. Placeholder is deliberately NOT in that chain.
 */

import { test, expect, type Page } from '@playwright/test';

/** Visible form controls that should expose an accessible name. */
async function unlabelledControls(page: Page): Promise<string[]> {
    return page.evaluate(() => {
        const visible = (el: Element) => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
        };
        const accessibleName = (el: HTMLElement): string => {
            const aria = el.getAttribute('aria-label');
            if (aria?.trim()) return aria.trim();

            const id = el.getAttribute('id');
            if (id) {
                const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
                if (forLabel?.textContent?.trim()) return forLabel.textContent.trim();
            }
            const wrapping = el.closest('label');
            if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();

            const labelledBy = el.getAttribute('aria-labelledby');
            if (labelledBy) {
                const t = labelledBy.split(/\s+/)
                    .map(x => document.getElementById(x)?.textContent?.trim() ?? '')
                    .join(' ').trim();
                if (t) return t;
            }
            return el.getAttribute('title')?.trim() ?? '';
        };

        return [...document.querySelectorAll<HTMLElement>('input, select, textarea')]
            .filter(visible)
            .filter(el => !['hidden', 'submit', 'button', 'image'].includes(
                (el as HTMLInputElement).type ?? ''))
            .filter(el => !accessibleName(el))
            .map(el => {
                const tag = el.tagName.toLowerCase();
                const type = (el as HTMLInputElement).type ?? '';
                const ph = (el as HTMLInputElement).placeholder ?? '';
                return `${tag}[type=${type}]${ph ? ` placeholder="${ph}"` : ''}`;
            });
    });
}

test.describe('Every form control has an accessible name', () => {
    test('signup — the first screen a paying customer meets', async ({ page }) => {
        await page.goto('/signup');
        await page.waitForSelector('input[type="tel"]', { timeout: 15000 });
        expect(await unlabelledControls(page)).toEqual([]);
    });

    test('login — the screen every returning owner uses', async ({ page }) => {
        await page.goto('/login');
        await page.waitForSelector('input[type="tel"]', { timeout: 15000 });
        expect(await unlabelledControls(page)).toEqual([]);
    });
});

test.describe('Every page has exactly one h1', () => {
    for (const path of ['/', '/pricing', '/signup', '/shop/preview']) {
        test(`${path} has a single top-level heading`, async ({ page }) => {
            await page.goto(path);
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(1500);
            expect(await page.locator('h1').count()).toBe(1);
        });
    }
});
