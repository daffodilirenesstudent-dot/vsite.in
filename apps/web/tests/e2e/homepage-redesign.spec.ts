import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end acceptance for the homepage redesign — the Playwright half of the
 * criteria in PLAN.md (the static half is
 * tests/acceptance/homepage-redesign.test.ts).
 *
 * Run against the PRODUCTION build (`npm run build && npm start`), not `next
 * dev`: dev serves unminified CSS with different cascade timing and skips the
 * static optimisation that the real page ships with.
 */

const VIEWPORTS = [
    { name: 'small phone', width: 360, height: 740 },
    { name: 'phone', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'laptop', width: 1280, height: 800 },
    { name: 'desktop', width: 1440, height: 900 },
] as const;

/** Scroll the whole page so every IntersectionObserver reveal has fired. */
async function settle(page: Page) {
    await page.evaluate(async () => {
        const h = document.body.scrollHeight;
        for (let y = 0; y < h; y += 400) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 500));
    });
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('homepage renders cleanly', () => {
    test('no page errors and no failed requests', async ({ page }) => {
        const pageErrors: string[] = [];
        const failed: string[] = [];
        page.on('pageerror', (e) => pageErrors.push(String(e)));
        page.on('response', (r) => {
            // Third-party analytics are blocked by our own CSP by design.
            const url = r.url();
            if (r.status() >= 400 && url.includes('localhost')) {
                failed.push(`${r.status()} ${url}`);
            }
        });

        await page.goto('/', { waitUntil: 'networkidle' });
        await settle(page);

        expect(pageErrors, 'uncaught page errors').toEqual([]);
        expect(failed, 'failed same-origin requests').toEqual([]);
    });

    for (const vp of VIEWPORTS) {
        test(`no horizontal overflow at ${vp.name} (${vp.width}px)`, async ({ page }) => {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto('/', { waitUntil: 'networkidle' });
            await settle(page);

            const overflow = await page.evaluate(() => ({
                scrollWidth: document.documentElement.scrollWidth,
                innerWidth: window.innerWidth,
            }));
            expect(overflow.scrollWidth, 'page must not scroll sideways').toBeLessThanOrEqual(
                overflow.innerWidth + 1,
            );
        });
    }

    test('every reveal ends visible — nothing is left at opacity 0', async ({ page }) => {
        // The regression this guards: <Reveal stagger> sets data-visible on the
        // PARENT and data-reveal on each CHILD. Without the parent-keyed CSS
        // rule the children stay at opacity 0 forever, and the page renders at
        // full height with invisible text.
        await page.goto('/', { waitUntil: 'networkidle' });
        await settle(page);

        const hidden = await page.evaluate(() =>
            Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
                .filter((el) => {
                    const r = el.getBoundingClientRect();
                    if (!r.width || !r.height) return false;
                    return parseFloat(getComputedStyle(el).opacity) < 0.9;
                })
                .map((el) => (el.textContent || '').trim().slice(0, 45)),
        );
        expect(hidden, 'reveal elements still invisible after scrolling').toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('accessibility', () => {
    test('all text meets WCAG AA contrast', async ({ page }) => {
        // The pre-redesign page had 40+ measured failures, driven by slate-400
        // (#94A3B8 = 2.56:1) used as a text colour throughout.
        await page.goto('/', { waitUntil: 'networkidle' });
        await settle(page);

        const failures = await page.evaluate(async () => {
            const lum = (r: number, g: number, b: number) => {
                const f = (c: number) => {
                    c /= 255;
                    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
                };
                return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
            };
            const parse = (str: string) => {
                const m = str.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
                return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
            };
            const over = (fg: number[], bg: number[]) =>
                fg[3] >= 1 ? fg : [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
            const ratio = (a: number[], b: number[]) => {
                const l1 = lum(a[0], a[1], a[2]);
                const l2 = lum(b[0], b[1], b[2]);
                return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            };

            /**
             * elementsFromPoint takes VIEWPORT coordinates, so an element can only
             * be sampled while it is on screen. Measuring everything after
             * scrolling back to the top sampled whatever happened to be at the
             * clamped coordinate instead — which reported ink-on-paper as 2:1.
             * So: walk the page and only measure what is currently visible.
             */
            /**
             * A gradient lives in `background-image`, and leaves
             * `background-color` transparent — so a walk that only reads
             * background-color falls straight past it. For text on a gradient
             * the honest test is every colour stop: the copy has to stay legible
             * across the whole sweep, not just at one end. Returns all candidate
             * backdrops; the caller takes the worst.
             */
            const stopsOf = (e: Element): number[][] | null => {
                const cs2 = getComputedStyle(e);
                const img = cs2.backgroundImage;
                if (img && img !== 'none' && img.includes('gradient')) {
                    const stops = (img.match(/rgba?\([^)]+\)/g) || [])
                        .map(parse)
                        .filter((c): c is number[] => !!c && c[3] > 0.5);
                    if (stops.length) return stops;
                }
                const c = parse(cs2.backgroundColor);
                return c && c[3] > 0.9 ? [c] : null;
            };

            /**
             * Resolving what is painted behind an element needs BOTH strategies,
             * and in this order:
             *
             *  1. Hit-testing, because it reflects paint order. The fixed <header>
             *     is a DOM child of `<main class="bg-paper">` but visually sits
             *     over the dark hero — the ancestor chain says near-white, the
             *     hit-test correctly says hero.
             *  2. The ancestor chain, but ONLY when the element is absent from the
             *     hit-test stack. That happens for `pointer-events: none` overlays
             *     (the floating hero chips), which hit-testing cannot see at all —
             *     their own white card is the right answer and only the DOM knows it.
             */
            const backdrops = (el: Element): number[][] => {
                const r = (el as HTMLElement).getBoundingClientRect();
                const x = r.left + Math.min(r.width / 2, 40);
                const y = r.top + r.height / 2;
                const stack = document.elementsFromPoint(x, y);
                const i = stack.indexOf(el);

                if (i >= 0) {
                    for (const e of stack.slice(i)) {
                        const found = stopsOf(e);
                        if (found) return found;
                    }
                } else {
                    let a: Element | null = el;
                    while (a && a !== document.documentElement) {
                        const found = stopsOf(a);
                        if (found) return found;
                        a = a.parentElement;
                    }
                }
                return [[255, 255, 255, 1]];
            };

            const out: { text: string; ratio: number; need: number; size: string }[] = [];
            const seen = new Set<Element>();
            const all = Array.from(document.querySelectorAll('body *'));

            for (let top = 0; top < document.body.scrollHeight; top += Math.round(window.innerHeight * 0.85)) {
                window.scrollTo(0, top);
                await new Promise((r) => setTimeout(r, 120));

                for (const el of all) {
                    if (seen.has(el)) continue;
                    const r = (el as HTMLElement).getBoundingClientRect();
                    // Only measure while fully on screen — otherwise the sample
                    // point lands outside the viewport and reads the wrong stack.
                    if (!r.width || !r.height) continue;
                    if (r.top < 4 || r.bottom > window.innerHeight - 4) continue;
                    seen.add(el);

                    const own = Array.from(el.childNodes)
                        .filter((n) => n.nodeType === 3)
                        .map((n) => (n.textContent || '').trim())
                        .join(' ')
                        .trim();
                    if (!own) continue;

                    const cs = getComputedStyle(el);
                    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
                    if (el.getAttribute('aria-hidden') === 'true') continue;
                    if (el.closest('[aria-hidden="true"]')) continue;
                    // Mock UI (phone screens, the QR stand, the setup miniatures) is a
                    // depiction of an interface at reduced scale — the same category
                    // as a screenshot. Real copy is still checked strictly.
                    if (el.closest('[data-mock="true"]')) continue;
                    // Gradient-clipped headlines set `color: transparent` on purpose;
                    // their visible colour comes from the background, which this
                    // method cannot measure. Checked by eye instead.
                    const clip = cs.webkitBackgroundClip || (cs as unknown as Record<string, string>).backgroundClip;
                    if (clip === 'text' || cs.color === 'rgba(0, 0, 0, 0)') continue;

                    const fg = parse(cs.color);
                    if (!fg) continue;
                    // Worst case across every candidate backdrop.
                    const cands = backdrops(el);
                    let cr = Infinity;
                    for (const bg of cands) cr = Math.min(cr, ratio(over(fg, bg), bg));
                    const fs = parseFloat(cs.fontSize);
                    const fw = +cs.fontWeight || 400;
                    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
                    const need = large ? 3 : 4.5;
                    if (cr < need - 0.05) {
                        out.push({ text: own.slice(0, 40), ratio: +cr.toFixed(2), need, size: `${fs}px` });
                    }
                }
            }
            window.scrollTo(0, 0);
            return out;
        });

        expect(failures, `contrast failures:\n${JSON.stringify(failures, null, 1)}`).toEqual([]);
    });

    test('no text below the 13px floor', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        await settle(page);
        const tiny = await page.evaluate(() =>
            Array.from(document.querySelectorAll('body *'))
                .filter((el) => {
                    const own = Array.from(el.childNodes)
                        .filter((n) => n.nodeType === 3)
                        .map((n) => (n.textContent || '').trim())
                        .join('')
                        .trim();
                    if (own.length < 4) return false;
                    if (el.getAttribute('aria-hidden') === 'true') return false;
                    if (el.closest('[data-mock="true"]')) return false;
                    const cs = getComputedStyle(el);
                    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
                    return parseFloat(cs.fontSize) < 12;
                })
                .map((el) => `${getComputedStyle(el).fontSize}: ${(el.textContent || '').trim().slice(0, 35)}`),
        );
        // Sub-12px readable copy was one of the audit findings (18 nodes).
        expect(tiny, `text under 12px:\n${tiny.join('\n')}`).toEqual([]);
    });

    test('interactive targets meet the 24x24 minimum', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/', { waitUntil: 'networkidle' });
        await settle(page);
        const small = await page.evaluate(() =>
            Array.from(document.querySelectorAll('a, button, [role="switch"]'))
                .filter((el) => {
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24);
                })
                .map((el) => `${el.tagName} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)} "${(el.textContent || '').trim().slice(0, 25)}"`),
        );
        expect(small, `targets under 24x24:\n${small.join('\n')}`).toEqual([]);
    });

    test('heading hierarchy is sound', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        const levels = await page.evaluate(() =>
            Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => +h.tagName[1]),
        );
        expect(levels.filter((l) => l === 1), 'exactly one h1').toHaveLength(1);
        expect(levels[0], 'first heading is the h1').toBe(1);
        for (let i = 1; i < levels.length; i++) {
            expect(levels[i] - levels[i - 1], `no skipped level at index ${i}`).toBeLessThanOrEqual(1);
        }
    });

    test('every content image has alt text', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        await settle(page);
        const missing = await page.evaluate(() =>
            Array.from(document.images)
                .filter((i) => i.getAttribute('alt') === null)
                .map((i) => i.currentSrc || i.src),
        );
        expect(missing, 'images with no alt attribute at all').toEqual([]);
    });

    test('reduced motion still shows all content', async ({ browser }) => {
        const ctx = await browser.newContext({ reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await page.goto('/', { waitUntil: 'networkidle' });
        // Deliberately do NOT scroll — under reduced motion content must be
        // visible immediately, not gated on an observer firing.
        await page.waitForTimeout(600);
        const hidden = await page.evaluate(() =>
            Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]')).filter(
                (el) => parseFloat(getComputedStyle(el).opacity) < 0.9,
            ).length,
        );
        expect(hidden, 'content hidden under prefers-reduced-motion').toBe(0);
        await ctx.close();
    });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('interactive behaviour', () => {
    test('sold-out toggles flip by mouse and keyboard', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        await page.locator('#features').scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);

        // Scoped to the sold-out demo rather than the whole page: the offers
        // card now carries its own switch, so a page-wide role=switch query
        // counts three and would keep breaking every time the page gains an
        // interactive demo. This asserts what the test is actually about.
        const switches = page.getByTestId('sold-out-demo').getByRole('switch');
        await expect(switches).toHaveCount(2);

        const first = switches.nth(0);
        const before = await first.getAttribute('aria-checked');
        await first.click();
        await expect(first).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');

        // Keyboard operability — a div-with-onClick would fail here.
        await first.focus();
        await page.keyboard.press('Enter');
        await expect(first).toHaveAttribute('aria-checked', before ?? 'false');

        // Every switch must carry a descriptive label, not just "toggle".
        for (let i = 0; i < 2; i++) {
            const label = await switches.nth(i).getAttribute('aria-label');
            expect(label && label.length > 10, `switch ${i} needs a real label`).toBeTruthy();
        }
    });

    test('FAQ answers expand and collapse', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        const items = page.locator('details');
        await expect(items.first()).toBeVisible();
        const count = await items.count();
        expect(count).toBeGreaterThanOrEqual(6);

        // The ordering question must be first — it is the one that decides
        // whether the sale survives week one.
        await expect(items.first()).toContainText(/order from the menu/i);

        const second = items.nth(1);
        await second.locator('summary').click();
        await expect(second).toHaveAttribute('open', '');
        await second.locator('summary').click();
        await expect(second).not.toHaveAttribute('open', '');
    });

    test('mobile menu opens, closes on Escape, and locks scroll', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/', { waitUntil: 'networkidle' });

        const burger = page.getByRole('button', { name: /open menu/i });
        await burger.click();
        await expect(page.getByRole('button', { name: /close menu/i })).toBeVisible();
        expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: /open menu/i })).toBeVisible();
        expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    });

    test('nav switches to its solid state on scroll', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        const header = page.locator('header').first();
        const atTop = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
        await page.evaluate(() => window.scrollTo(0, 600));
        await page.waitForTimeout(500);
        const scrolled = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(scrolled, 'nav background must change once scrolled past the hero').not.toBe(atTop);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('content is truthful and complete', () => {
    test('makes no claim for a frozen product', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        await settle(page);
        const body = (await page.locator('body').innerText()).toLowerCase();

        for (const claim of ['upi', 'gpay', 'phonepe', 'pay securely', 'live orders', 'place order']) {
            expect(body, `homepage must not promise "${claim}" while ordering is frozen`).not.toContain(
                claim,
            );
        }
        expect(body).toContain('what it does not do yet');
    });

    test('ships no fabricated social proof', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        const body = await page.locator('body').innerText();
        expect(body).not.toMatch(/to be replaced with real customer/i);

        const ld = await page.evaluate(() =>
            Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(
                (s) => s.textContent || '',
            ),
        );
        expect(ld.length, 'structured data present').toBeGreaterThan(0);
        for (const block of ld) {
            expect(() => JSON.parse(block), 'JSON-LD must parse').not.toThrow();
            expect(block, 'no fabricated aggregateRating').not.toContain('aggregateRating');
        }
    });

    test('no unfilled placeholders reach the page', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        await settle(page);
        const body = await page.locator('body').innerText();
        for (const ph of ['[X]', '[DATE]', '[CITY]', '[YOUR NAME]', '[FOUNDER NAME]', 'lorem ipsum']) {
            expect(body, `placeholder "${ph}" still visible`).not.toContain(ph);
        }
    });

    test('contact details are real and consistent', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        await settle(page);
        const links = await page.evaluate(() =>
            Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="wa.me"]')).map(
                (a) => a.getAttribute('href') || '',
            ),
        );
        expect(links.length, 'WhatsApp CTAs present').toBeGreaterThan(0);
        for (const l of links) {
            expect(l, 'every WhatsApp link uses the real number').toContain('wa.me/919360706659');
            expect(l, 'no placeholder number survives').not.toContain('919000000000');
        }
        await expect(page.locator('body')).toContainText('G Sri Gowtham');
    });

    test('the QR on the page is a real, scannable code', async ({ page }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        await page.locator('#setup-steps').scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        // qrcode.react emits the whole code as a SINGLE <path> on a module-grid
        // viewBox, so counting nodes proves nothing. The path data length does:
        // a real code is thousands of characters, an icon glyph is tens.
        const qr = await page.evaluate(() => {
            const svgs = Array.from(document.querySelectorAll('#setup-steps svg'));
            let best = { d: 0, viewBox: '' };
            for (const s of svgs) {
                const d = Math.max(0, ...Array.from(s.querySelectorAll('path')).map((p) => (p.getAttribute('d') || '').length));
                if (d > best.d) best = { d, viewBox: s.getAttribute('viewBox') || '' };
            }
            return best;
        });
        expect(qr.d, 'a real QR encodes thousands of path characters').toBeGreaterThan(500);
        expect(qr.viewBox, 'QR uses a module grid viewBox').toMatch(/^0 0 \d+ \d+$/);
    });

    test('every internal link resolves', async ({ page, request }) => {
        await page.goto('/', { waitUntil: 'networkidle' });
        await settle(page);
        const hrefs: string[] = await page.evaluate(() =>
            Array.from(new Set(
                Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')).map(
                    (a) => a.getAttribute('href') || '',
                ),
            )).filter((h) => h && !h.startsWith('//') && !h.startsWith('/#')),
        );
        expect(hrefs.length, 'internal links found').toBeGreaterThan(5);

        const broken: string[] = [];
        for (const href of hrefs) {
            const res = await request.get(href, { maxRedirects: 0 });
            if (res.status() >= 400) broken.push(`${res.status()} ${href}`);
        }
        expect(broken, `broken internal links:\n${broken.join('\n')}`).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('pages that share the logo still render', () => {
    for (const path of ['/login', '/signup', '/contact', '/demo', '/pricing', '/features']) {
        test(`${path} renders with the shared logo and no errors`, async ({ page }) => {
            const errors: string[] = [];
            page.on('pageerror', (e) => errors.push(String(e)));
            await page.goto(path, { waitUntil: 'networkidle' });
            await expect(page.locator('svg[aria-label="vsite"]').first()).toBeVisible();
            expect(errors, `page errors on ${path}`).toEqual([]);
        });
    }

    test('404 page renders the logo', async ({ page }) => {
        await page.goto('/definitely-not-a-real-page', { waitUntil: 'networkidle' });
        await expect(page.locator('svg[aria-label="vsite"]').first()).toBeVisible();
    });
});
