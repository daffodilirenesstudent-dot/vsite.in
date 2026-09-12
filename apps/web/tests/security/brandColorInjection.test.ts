import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isHexColor, themeCssVars, MENU_THEMES, FONT_PAIRS } from '@/lib/menu/menuThemes';

/**
 * The owner's brand colour is untrusted input rendered into a stylesheet.
 *
 * `QRMenuTemplate` ships its CSS through `dangerouslySetInnerHTML` — correctly,
 * for a hydration reason documented at the call site. That makes any value
 * concatenated into that string a CSS injection vector, and the blast radius is
 * not the owner: it is every diner who scans that restaurant's QR code.
 *
 * A stored `primary_color` of `red; } body { display: none } .x {` would close
 * the rule and open a new one. What it cannot do is run script — CSS injection
 * here is defacement and exfiltration-by-selector, not XSS — but a menu that
 * renders blank to every customer is a restaurant losing service, so it is
 * treated as a security boundary rather than a validation nicety.
 *
 * Three independent layers, because any one of them can be bypassed by a future
 * edit that forgets the other two:
 *
 *   1. `isHexColor` at the API, before the value is stored.
 *   2. `themeCssVars` at render, before it reaches the page.
 *   3. A CHECK constraint in migration 052, at rest.
 *
 * This suite proves 1 and 2, and proves the value never travels as string
 * concatenation in the first place.
 */

const SRC = join(__dirname, '..', '..', 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const shipped = (p: string) =>
    read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const ATTACKS = [
    'red; } body { display: none } .x {',
    '#EF59A1; } * { visibility: hidden } .y {',
    '</style><script>alert(1)</script>',
    '#EF59A1"><script>alert(1)</script>',
    'url(javascript:alert(1))',
    'expression(alert(1))',
    '#EF59A1/**/;background-image:url(//attacker.example/x)',
    '#EF59A1\n}\n.qr-card{display:none}\n.z{',
    '#EF59A1;}@import url(//attacker.example/x);.z{',
    'var(--anything)',
    '#EF59A1 !important',
    'transparent',
];

describe('a hostile brand colour never reaches the page', () => {
    it('is rejected by the validator', () => {
        for (const attack of ATTACKS) {
            expect(isHexColor(attack), attack).toBe(false);
        }
    });

    it('is replaced by the theme default at render', () => {
        for (const attack of ATTACKS) {
            const vars = themeCssVars(
                MENU_THEMES.classic,
                attack,
                FONT_PAIRS.classic,
            );
            expect(vars['--qr-accent'], attack).toBe(MENU_THEMES.classic.accent);

            // Nothing recognisable from the payload survives anywhere in the
            // variable set — not just in the accent slot.
            const serialised = JSON.stringify(vars);
            for (const marker of ['display: none', '<script', 'javascript:', '@import', 'expression(']) {
                expect(serialised, `${attack} -> ${marker}`).not.toContain(marker);
            }
        }
    });

    it('emits a value that cannot close a CSS declaration', () => {
        const vars = themeCssVars(MENU_THEMES.premium, '#1F3A5F', FONT_PAIRS.sharp);
        for (const value of Object.values(vars)) {
            expect(value).not.toContain('}');
            expect(value).not.toContain(';');
            expect(value).not.toContain('<');
        }
    });
});

describe('the colour never travels as string concatenation', () => {
    it('is delivered as a CSS custom property, not interpolated into the style block', () => {
        const tpl = shipped('components/templates/QRMenuTemplate.tsx');

        // The style block is a single template literal. The brand colour must
        // not appear inside it under any name — it arrives via the shell's
        // style attribute instead, which React escapes.
        const styleBlock = tpl.slice(
            tpl.indexOf('dangerouslySetInnerHTML'),
            tpl.indexOf('qr-wrap qr-shell'),
        );
        expect(styleBlock.length).toBeGreaterThan(100);
        for (const forbidden of ['brandColor', 'primary_color', 'themeVars', 'accent']) {
            expect(styleBlock, `${forbidden} must not be interpolated into the stylesheet`)
                .not.toContain(forbidden);
        }
    });

    it('applies the variables through a style prop React will escape', () => {
        expect(shipped('components/templates/QRMenuTemplate.tsx'))
            .toMatch(/qr-wrap qr-shell" style=\{themeVars\}/);
    });

    it('interpolates only module constants into the motion stylesheet', () => {
        // MENU_MOTION_CSS is a template literal too. Everything it interpolates
        // must be a constant defined in that file, never a prop or a DB value.
        const motion = shipped('lib/menu/menuMotion.ts');
        const holes = motion.match(/\$\{[^}]+\}/g) ?? [];
        for (const hole of holes) {
            expect(hole, 'motion CSS must interpolate constants only')
                .toMatch(/\$\{(REVEAL_MS|SETTLE|PRESS_CARD|PRESS_CHIP|STAGGER_MS)\}/);
        }
    });
});

describe('the database is the last line', () => {
    it('constrains primary_color to a six-digit hex at rest', () => {
        const sql = readFileSync(
            join(__dirname, '..', '..', 'supabase', 'migrations', '052_menu_theme.sql'),
            'utf8',
        );
        expect(sql).toMatch(/sites_primary_color_hex/);
        expect(sql).toMatch(/\^#\[0-9A-Fa-f\]\{6\}\$/);
    });

    it('constrains the theme and font columns to the shipped sets', () => {
        const sql = readFileSync(
            join(__dirname, '..', '..', 'supabase', 'migrations', '052_menu_theme.sql'),
            'utf8',
        );
        expect(sql).toMatch(/menu_theme IN \('classic', 'cafe', 'premium'\)/);
        expect(sql).toMatch(/menu_font IN \('classic', 'warm', 'sharp'\)/);
    });
});
