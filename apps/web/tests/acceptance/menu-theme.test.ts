import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Menu design themes — the acceptance contract.
 *
 * vsite ships THREE menu designs, not six. The PM decision (8 Sep 2026) splits
 * the request into a sales tool (a picker at onboarding), a settings screen
 * nobody has a job for, and a marketing campaign — and ships only the first.
 * Five decisions are frozen here, each with a reason that outlives the values:
 *
 *   1. A THEME IS CONFIG, NEVER CONTENT. It is a column on the site row.
 *      Switching must not touch a product row, the slug, or the QR secret.
 *      Get this wrong and every future design is a migration — and the printed
 *      standees on twenty tables become worthless.
 *
 *   2. CLASSIC IS BYTE-IDENTICAL TO WHAT SHIPPED. 56 live menus render it
 *      today. A theme system that quietly restyles them is a regression, not a
 *      feature, so Classic's values are asserted equal to the frozen tokens.
 *
 *   3. ONLY SEVEN KNOBS MOVE. Surface, card ground, card radius, card border,
 *      accent, font pair, density. The veg/non-veg marks are legally
 *      meaningful in India; the offer tint carries the entire offer signal;
 *      the sold-out ramp says "finished today", not "something broke". None of
 *      those may vary by theme, and none may be owner-settable.
 *
 *   4. MOTION IS NOT THE EIGHTH KNOB. "Smooth" is a baseline, not a brand
 *      attribute. Per-theme timings would triple the motion QA and undo the
 *      whole economic case for three designs over six.
 *
 *   5. NOTHING ON THE MENU IS HARDCODED. Every dish, price, category and name
 *      comes from what the owner uploaded. A theme may not smuggle in a
 *      literal.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');

const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments name values that were rejected, so match on shipped source. */
const shipped = (p: string) =>
    read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const THEMES = 'lib/menu/menuThemes.ts';
const TOKENS = 'components/templates/menuTokens.ts';
const TEMPLATE = 'components/templates/QRMenuTemplate.tsx';
const CARD = 'components/templates/MenuItemCard.tsx';
const SHOP_PAGE = 'app/shop/[slug]/page.tsx';
const SHOP_CLIENT = 'app/shop/[slug]/ShopPageClient.tsx';

// ─────────────────────────────────────────────────────────────────────────────
// 1. The theme registry
// ─────────────────────────────────────────────────────────────────────────────

describe('the theme registry', () => {
    it('ships exactly three designs', async () => {
        const { MENU_THEMES } = await import('@/lib/menu/menuThemes');
        expect(Object.keys(MENU_THEMES).sort()).toEqual(['cafe', 'classic', 'premium']);
    });

    it('defaults to classic, so an existing menu never changes', async () => {
        const { DEFAULT_MENU_THEME } = await import('@/lib/menu/menuThemes');
        expect(DEFAULT_MENU_THEME).toBe('classic');
    });

    it('rejects an unknown theme id rather than rendering a broken menu', async () => {
        const { isMenuThemeId } = await import('@/lib/menu/menuThemes');
        expect(isMenuThemeId('classic')).toBe(true);
        expect(isMenuThemeId('festival-pongal')).toBe(false);
        expect(isMenuThemeId('')).toBe(false);
        expect(isMenuThemeId(null)).toBe(false);
    });

    it('is client-safe — the public menu imports it', () => {
        expect(shipped(THEMES), 'menuThemes must never pull in server-only')
            .not.toMatch(/server-only|supabase-server/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Classic is byte-identical to what shipped
// ─────────────────────────────────────────────────────────────────────────────

describe('classic', () => {
    it('carries the exact shipped values', async () => {
        const { MENU_THEMES } = await import('@/lib/menu/menuThemes');
        const { T } = await import('@/components/templates/menuTokens');
        const classic = MENU_THEMES.classic;

        expect(classic.accent, 'the shipped accent is the vsite pink').toBe(T.pink);
        expect(classic.surface).toBe(T.cardBg);
        expect(classic.cardBg).toBe(T.white);
        expect(classic.cardRadius, 'the shipped card radius is 8, not 14').toBe(8);
    });

    it('leaves the frozen token object untouched', () => {
        // menu-card-system.test.ts reads these literals out of source. The
        // theme layer sits ON TOP of T; it does not rewrite it.
        const src = shipped(TOKENS);
        expect(src).toMatch(/#FAF5EC/i);
        expect(src).toMatch(/offerTint/);
        expect(src).toMatch(/#EF59A1/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Only seven knobs move
// ─────────────────────────────────────────────────────────────────────────────

describe('what a theme may change', () => {
    it('exposes seven knobs and no more', async () => {
        const { THEMEABLE_KNOBS } = await import('@/lib/menu/menuThemes');
        expect(THEMEABLE_KNOBS).toHaveLength(7);
    });

    it('never lets a theme restyle the veg or non-veg mark', async () => {
        const { MENU_THEMES } = await import('@/lib/menu/menuThemes');
        const { T } = await import('@/components/templates/menuTokens');
        for (const theme of Object.values(MENU_THEMES)) {
            const json = JSON.stringify(theme);
            expect(json, 'the veg green is a legal signal, not decoration')
                .not.toContain(T.vegGreen);
            expect(json, 'the non-veg red is a legal signal, not decoration')
                .not.toContain(T.nonvegRed);
        }
    });

    it('never lets a theme restyle the offer tint or the saving', async () => {
        const { MENU_THEMES } = await import('@/lib/menu/menuThemes');
        for (const theme of Object.values(MENU_THEMES)) {
            const json = JSON.stringify(theme);
            expect(json).not.toContain('#FAF5EC');
            expect(json).not.toContain('#13801C');
        }
    });

    it('never lets a theme restyle the sold-out ramp', async () => {
        const { MENU_THEMES } = await import('@/lib/menu/menuThemes');
        const { T } = await import('@/components/templates/menuTokens');
        for (const theme of Object.values(MENU_THEMES)) {
            const json = JSON.stringify(theme);
            expect(json).not.toContain(T.outName);
            expect(json).not.toContain(T.outTagBg);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. The owner's brand colour is untrusted input
// ─────────────────────────────────────────────────────────────────────────────

describe('brand colour', () => {
    it('accepts only a six-digit hex', async () => {
        const { isHexColor } = await import('@/lib/menu/menuThemes');
        expect(isHexColor('#EF59A1')).toBe(true);
        expect(isHexColor('#ef59a1')).toBe(true);
        expect(isHexColor('#FFF')).toBe(false);
        expect(isHexColor('red')).toBe(false);
        expect(isHexColor(null)).toBe(false);
    });

    it('refuses a value that would break out of a style block', async () => {
        const { isHexColor } = await import('@/lib/menu/menuThemes');
        // QRMenuTemplate builds its style block with dangerouslySetInnerHTML.
        // A colour that closes the rule is a CSS injection, not a colour.
        expect(isHexColor('red; } body { display: none } .x {')).toBe(false);
        expect(isHexColor('#EF59A1; } * { display: none }')).toBe(false);
        expect(isHexColor('</style><script>alert(1)</script>')).toBe(false);
        expect(isHexColor('url(javascript:alert(1))')).toBe(false);
    });

    it('darkens a pale brand colour so the price stays readable', async () => {
        const { resolveAccent, contrastOnWhite } = await import('@/lib/menu/menuThemes');
        // The accent is drawn as TEXT on a light ground — price, shop name,
        // active chip. A pale yellow at 1.07:1 is an unreadable price.
        expect(contrastOnWhite('#FFEB3B')).toBeLessThan(4.5);
        expect(contrastOnWhite(resolveAccent('#FFEB3B'))).toBeGreaterThanOrEqual(4.5);
    });

    it('leaves an already-readable colour alone', async () => {
        const { resolveAccent } = await import('@/lib/menu/menuThemes');
        expect(resolveAccent('#191919')).toBe('#191919');
    });

    it('falls back to the theme accent when the stored value is junk', async () => {
        const { resolveAccent, MENU_THEMES } = await import('@/lib/menu/menuThemes');
        expect(resolveAccent(null, 'cafe')).toBe(MENU_THEMES.cafe.accent);
        expect(resolveAccent('nonsense', 'cafe')).toBe(MENU_THEMES.cafe.accent);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. A theme is config, not content
// ─────────────────────────────────────────────────────────────────────────────

describe('a theme is config, never content', () => {
    it('is read from the site row on the public menu', () => {
        expect(shipped(SHOP_PAGE), 'the shop page must select the theme columns')
            .toMatch(/menu_theme/);
        expect(shipped(SHOP_PAGE)).toMatch(/primary_color/);
        // show_logo was asserted here until 054 dropped it. The toggle existed
        // only to hide sites.image_url, and image_url is gone — see
        // tests/acceptance/store-details.test.ts, which now asserts the
        // ABSENCE of all three.
    });

    /**
     * The custom properties must cover the OVERLAYS, not just the shell.
     *
     * `themeVars` sat on `.qr-wrap.qr-shell`, and every overlay — search, the
     * detail sheet, and the seven frozen ordering screens — is a SIBLING of
     * that element, not a child. Custom properties inherit through the DOM, so
     * none of them reached the overlays: every `TV.*` silently fell back to its
     * Classic default. A store branded black rendered a black main list and a
     * pink search overlay, from the very same MenuItemCard.
     *
     * This is why fixing the chips to use TV.accent appeared to do nothing.
     * The colour was never the bug; the scope of the variables was.
     *
     * The wrapper carries ONLY custom properties (themeCssVars returns nothing
     * else), so it is visually inert — and it fixes every current overlay plus
     * every one added later, which passing the vars to each would not.
     */
    it('scopes the theme variables above every overlay', () => {
        const src = shipped(TEMPLATE);
        const root = src.slice(src.lastIndexOf('return (', src.indexOf('qr-wrap qr-shell')));
        expect(
            root.slice(0, 200),
            'the returned root must carry themeVars, or overlays fall back to Classic',
        ).toMatch(/<div style=\{themeVars\}>/);
    });

    it('keeps the overlays inside that root', () => {
        // If an overlay ever moves above the wrapper it silently goes pink
        // again, with no error anywhere.
        const src = shipped(TEMPLATE);
        const rootStart = src.indexOf('<div style={themeVars}>');
        expect(rootStart, 'no themed root found').toBeGreaterThan(-1);
        for (const overlay of ['<SearchOverlay', '<ProductDetailSheet']) {
            expect(src.indexOf(overlay), `${overlay} renders outside the themed root`)
                .toBeGreaterThan(rootStart);
        }
    });

    /**
     * The brand colour has to reach every SELECTED state, not most of them.
     *
     * Three surfaces on the visible menu were written before the theme system
     * and kept painting the frozen Classic pink (#EF59A1) regardless of what
     * the owner chose: the search overlay's category chips, the variant radio
     * in the detail sheet, and the card focus ring. A store branded black got
     * black chips on the main row and pink ones inside search — which reads as
     * a bug in the menu, not a style choice.
     *
     * Scope note: T.pink is still correct in the qty stepper, add-to-cart,
     * cart badge and order-id blocks. Those are the ORDERING flow, frozen
     * behind ORDERING_FROZEN and not on screen. They get migrated when
     * ordering unfreezes; widening this test to them now would mean editing
     * frozen surfaces for no visible gain.
     */
    describe('selected states follow the owner brand colour', () => {
        const body = (fnName: string) => {
            const src = shipped(TEMPLATE);
            const start = src.indexOf(`function ${fnName}(`);
            expect(start, `${fnName} not found`).toBeGreaterThan(-1);
            const next = src.indexOf('\nfunction ', start + 1);
            return src.slice(start, next === -1 ? undefined : next);
        };

        it('paints the variant radio with the accent', () => {
            const radio = body('RadioCircle');
            expect(radio).toMatch(/TV\.accent/);
            expect(radio, 'RadioCircle still hardcodes the Classic pink').not.toMatch(/#EF59A1/);
        });

        it('paints the search chips with the accent', () => {
            const overlay = body('SearchOverlay');
            expect(overlay).toMatch(/TV\.accent/);
            expect(overlay, 'search chips still hardcode the Classic pink').not.toMatch(/T\.pink|#FFF0F8/);
        });

        it('matches the main chip row instead of inventing a second style', () => {
            // The shipped active chip is a SOLID accent fill with white text.
            // A tinted variant would need a derived colour (color-mix), which
            // is one more thing to get wrong on an old Android browser — and
            // a pale tint of a dark brand colour is invisible anyway.
            const overlay = body('SearchOverlay');
            expect(overlay).toMatch(/background:[^,;]*TV\.accent/);
        });

        it('leaves the focus ring on the frozen Classic pink, deliberately', () => {
            // This one selected state does NOT follow the brand colour, and
            // that is the correct trade.
            //
            // The ring lives in the dangerouslySetInnerHTML stylesheet, and
            // brandColorInjection.test.ts forbids the brand colour appearing
            // inside that block under ANY name — a defence-in-depth rule that
            // also catches the literal `var(--qr-accent, …)`, since the custom
            // property's own name contains it. The colour is only ever allowed
            // in through the style prop, which React escapes.
            //
            // Themeing a focus ring is not worth weakening that. T.pink is a
            // frozen module constant with no owner input in it, and the ring
            // stays clearly visible on every shipped surface.
            expect(shipped(TEMPLATE)).toMatch(/focus-visible \{ outline:2px solid \$\{T\.pink\}/);
        });
    });

    it('is applied as CSS variables, not by branching on the name', () => {
        // shop/CLAUDE.md: "Never branch on template name inside a component."
        const src = shipped(TEMPLATE);
        expect(src, 'the shell must carry the theme variables')
            .toMatch(/themeCssVars/);
        expect(src, 'no component may switch on a theme id')
            .not.toMatch(/=== 'cafe'|=== 'premium'|=== "cafe"|=== "premium"/);
        expect(shipped(CARD))
            .not.toMatch(/=== 'cafe'|=== 'premium'|=== "cafe"|=== "premium"/);
    });

    it('keeps the Classic literal as the variable fallback', () => {
        // A themed value must still paint if the variable never lands.
        expect(shipped(TOKENS), 'TV must supply var() fallbacks')
            .toMatch(/var\(--qr-accent,\s*#EF59A1\)/i);
    });

    it('never writes to a product row, the slug or the QR secret', () => {
        const src = shipped('app/api/manage/sites/[siteId]/menu-theme/route.ts');
        expect(src, 'a theme change must not touch menu data')
            .not.toMatch(/from\('products'\)/);
        expect(src, 'a theme change must not touch the slug — the printed QR resolves through it')
            .not.toMatch(/slug:/);
        expect(src).not.toMatch(/qr_secret/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Motion is not the eighth knob
// ─────────────────────────────────────────────────────────────────────────────

describe('motion', () => {
    it('is defined once, not per theme', async () => {
        const { MENU_THEMES } = await import('@/lib/menu/menuThemes');
        for (const theme of Object.values(MENU_THEMES)) {
            const json = JSON.stringify(theme);
            expect(json, 'a theme must not carry its own timings')
                .not.toMatch(/duration|easing|cubic-bezier|stagger/i);
        }
    });

    it('never uses an overshoot curve on the menu', () => {
        // menu-card-system.test.ts already forbids this on the detail sheet:
        // "the bouncing curve makes a photo panel look cheap". The same holds
        // for the list — a menu settles, it does not bounce.
        expect(shipped(TEMPLATE)).not.toMatch(/cubic-bezier\(0\.34,\s*1\.2/);
        expect(shipped('lib/menu/menuMotion.ts')).not.toMatch(/cubic-bezier\(0\.34,\s*1\.2/);
    });

    it('animates transform and opacity only', () => {
        const src = shipped('lib/menu/menuMotion.ts');
        expect(src, 'animating layout relayouts the list every frame on a cheap Android')
            .not.toMatch(/animation:[^;]*\b(height|width|top|left|margin)\b/);
    });

    it('stands down for a reader who asked for less motion', () => {
        expect(shipped('lib/menu/menuMotion.ts')).toMatch(/prefers-reduced-motion/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Nothing on the menu is hardcoded
// ─────────────────────────────────────────────────────────────────────────────

describe('every value comes from the database', () => {
    it('smuggles no sample menu into the theme layer', () => {
        for (const file of [THEMES, 'lib/menu/menuMotion.ts', TOKENS]) {
            const src = shipped(file);
            expect(src, `${file} must not carry sample menu content`)
                .not.toMatch(/SAMPLE_|MOCK_|DEMO_ITEMS|Cream Story/);
        }
    });

    it('keeps the live menu free of hardcoded dishes', () => {
        for (const file of [SHOP_PAGE, SHOP_CLIENT]) {
            expect(shipped(file), `${file} must render only what the owner uploaded`)
                .not.toMatch(/SAMPLE_PRODUCTS|selling_price:\s*\d/);
        }
    });

    it('previews the owner\'s own menu, not a sample shop', () => {
        // The whole sales case is that the owner sees HIS menu. A picker that
        // previews someone else's cake shop is worse than no picker.
        const src = shipped('app/shop/preview/page.tsx');
        expect(src, 'preview must accept real products').toMatch(/menu_theme|themeParam|theme=/);
    });
});
