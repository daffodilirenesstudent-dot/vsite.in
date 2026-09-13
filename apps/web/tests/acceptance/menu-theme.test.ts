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
        expect(src).toMatch(/#FFECEC/i);
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
            expect(json).not.toContain('#FFECEC');
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
