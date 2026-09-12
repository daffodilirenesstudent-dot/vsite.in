import { describe, it, expect } from 'vitest';
import {
    MENU_THEMES, FONT_PAIRS, THEMEABLE_KNOBS,
    DEFAULT_MENU_THEME, DEFAULT_FONT_PAIR,
    isMenuThemeId, isFontPairId, isHexColor,
    resolveTheme, resolveFontPair, resolveAccent, contrastOnWhite, themeCssVars,
} from '@/lib/menu/menuThemes';
import { T } from '@/components/templates/menuTokens';

/**
 * Unit contract for the theme layer.
 *
 * The acceptance suite asserts the PRODUCT decisions (three designs, seven
 * knobs, config not content). This file covers the maths and the guards those
 * decisions rest on — contrast, hex validation, and falling back rather than
 * throwing, because the menu is unauthenticated and a throw here is a blank
 * page for a diner holding a phone at a table.
 */

describe('resolveTheme / resolveFontPair', () => {
    it('falls back instead of throwing on anything unexpected', () => {
        for (const junk of [null, undefined, '', 'festival', 42, {}, [], 'CLASSIC']) {
            expect(resolveTheme(junk).id).toBe(DEFAULT_MENU_THEME);
        }
    });

    it('is case-sensitive — a theme id is a stored enum, not user text', () => {
        expect(isMenuThemeId('Classic')).toBe(false);
        expect(isMenuThemeId('classic')).toBe(true);
    });

    it('does not resolve inherited Object properties as themes', () => {
        // `value in MENU_THEMES` would answer true for 'toString'.
        expect(isMenuThemeId('toString')).toBe(false);
        expect(isMenuThemeId('constructor')).toBe(false);
        expect(isFontPairId('hasOwnProperty')).toBe(false);
    });

    it('gives every theme a font pair that exists', () => {
        for (const theme of Object.values(MENU_THEMES)) {
            expect(FONT_PAIRS[theme.fontPair]).toBeDefined();
        }
    });

    it('takes the theme pairing when no font is stored', () => {
        expect(resolveFontPair(null, MENU_THEMES.cafe).id).toBe(MENU_THEMES.cafe.fontPair);
        expect(resolveFontPair('sharp', MENU_THEMES.cafe).id).toBe('sharp');
    });

    it('defaults to a pair that exists', () => {
        expect(FONT_PAIRS[DEFAULT_FONT_PAIR]).toBeDefined();
    });
});

describe('every font pair covers Tamil', () => {
    // The root layout loads latin-only subsets. A pair without a Tamil face
    // means Tamil dish names render in an uncontrolled system fallback — in a
    // product sold into Tamil Nadu.
    it('names a Tamil face in the display and body stacks', () => {
        for (const pair of Object.values(FONT_PAIRS)) {
            expect(pair.display, `${pair.id} display`).toMatch(/tamil|malar/i);
            expect(pair.body, `${pair.id} body`).toMatch(/tamil|malar/i);
            expect(pair.tamil, `${pair.id} tamil`).toMatch(/tamil|malar/i);
        }
    });

    it('uses next/font variables, never literal family names', () => {
        // `'Newsreader'` would silently resolve to nothing — the loader
        // generates a hashed family per face.
        for (const pair of Object.values(FONT_PAIRS)) {
            expect(pair.display).toMatch(/var\(--font-/);
            expect(pair.body).toMatch(/var\(--font-/);
        }
    });
});

describe('isHexColor', () => {
    it('accepts a six-digit hex in either case', () => {
        expect(isHexColor('#AABBCC')).toBe(true);
        expect(isHexColor('#aabbcc')).toBe(true);
    });

    it('rejects everything else', () => {
        for (const bad of [
            '#FFF', '#ABCD', '#GGGGGG', 'AABBCC', 'red', 'rgb(1,2,3)',
            '', ' #AABBCC', '#AABBCC ', null, undefined, 123, {}, ['#AABBCC'],
        ]) {
            expect(isHexColor(bad as unknown), String(bad)).toBe(false);
        }
    });

    it('rejects payloads that would escape a style block', () => {
        // The menu builds its style block with dangerouslySetInnerHTML, so this
        // predicate is a security boundary, not a formatting nicety.
        for (const attack of [
            '#EF59A1; } body { display: none } .x {',
            'red; } * { visibility: hidden }',
            '</style><script>alert(1)</script>',
            'url(javascript:alert(1))',
            'expression(alert(1))',
            '#EF59A1/**/;background:url(//evil)',
            '#EF59A1\n}\n.qr-card{display:none',
        ]) {
            expect(isHexColor(attack), attack).toBe(false);
        }
    });
});

describe('contrast', () => {
    it('measures white and black correctly', () => {
        expect(contrastOnWhite('#FFFFFF')).toBeCloseTo(1, 1);
        expect(contrastOnWhite('#000000')).toBeCloseTo(21, 0);
    });

    it('returns the worst case for a value it cannot read', () => {
        expect(contrastOnWhite('not-a-colour')).toBe(1);
    });
});

describe('resolveAccent', () => {
    it('darkens any owner colour until a price is readable', () => {
        for (const pale of ['#FFEB3B', '#FFFFFF', '#B2FF59', '#FFD1DC', '#00E5FF']) {
            const out = resolveAccent(pale, 'classic');
            expect(isHexColor(out), `${pale} -> ${out}`).toBe(true);
            expect(contrastOnWhite(out), `${pale} -> ${out}`).toBeGreaterThanOrEqual(4.5);
        }
    });

    it('leaves a colour that already reads alone', () => {
        for (const dark of ['#191919', '#1F3A5F', '#8A5B06']) {
            expect(resolveAccent(dark, 'classic')).toBe(dark);
        }
    });

    it('returns the theme default for junk, including injection attempts', () => {
        for (const junk of [null, undefined, '', 'red', '#FFF', 'x; } body {']) {
            expect(resolveAccent(junk, 'premium')).toBe(MENU_THEMES.premium.accent);
        }
    });

    it('passes the theme default through unclamped', () => {
        // The shipped pink is 3.2:1 and has been on every live menu since March.
        // Clamping it would silently restyle every existing menu and break the
        // promise that Classic is byte-identical. Design-reviewed values are
        // exempt; unvetted owner input is not.
        expect(contrastOnWhite(T.pink)).toBeLessThan(4.5);
        expect(resolveAccent(null, 'classic')).toBe(T.pink);
        expect(resolveAccent(T.pink, 'classic')).toBe(T.pink);
        expect(resolveAccent(T.pink.toLowerCase(), 'classic')).toBe(T.pink);
    });

    it('falls back to Classic when the theme id is junk too', () => {
        expect(resolveAccent(null, 'nonsense' as never)).toBe(MENU_THEMES.classic.accent);
    });
});

describe('themeCssVars', () => {
    const vars = (id: keyof typeof MENU_THEMES, accent: string) =>
        themeCssVars(MENU_THEMES[id], accent, FONT_PAIRS[MENU_THEMES[id].fontPair]);

    it('emits every knob as a --qr- custom property', () => {
        const v = vars('cafe', '#C2603F');
        for (const key of Object.keys(v)) expect(key.startsWith('--qr-')).toBe(true);
        expect(v['--qr-accent']).toBe('#C2603F');
        expect(v['--qr-surface']).toBe(MENU_THEMES.cafe.surface);
        expect(v['--qr-card-radius']).toBe('16px');
    });

    it('applies one corner shape to card, chip and thumb', () => {
        // A squared card beside a 40px pill chip reads as an accident.
        const v = vars('premium', '#101010');
        expect(v['--qr-card-radius']).toBe('2px');
        expect(v['--qr-chip-radius']).toBe('2px');
        expect(v['--qr-thumb-radius']).toBe('2px');
    });

    it('refuses to place an unvalidated colour into a style block', () => {
        const v = vars('classic', 'red; } body { display: none } .x {');
        expect(v['--qr-accent']).toBe(MENU_THEMES.classic.accent);
        expect(JSON.stringify(v)).not.toContain('display: none');
    });

    it('reproduces the shipped Classic values exactly', () => {
        const v = vars('classic', MENU_THEMES.classic.accent);
        expect(v['--qr-accent']).toBe(T.pink);
        expect(v['--qr-surface']).toBe(T.cardBg);
        expect(v['--qr-card-bg']).toBe(T.white);
        expect(v['--qr-card-radius']).toBe('8px');
        expect(v['--qr-chip-radius']).toBe('40px');
        expect(v['--qr-thumb-radius']).toBe('10px');
    });
});

describe('the knob budget', () => {
    it('is seven, and every theme fills all of them', () => {
        expect(THEMEABLE_KNOBS).toHaveLength(7);
        for (const theme of Object.values(MENU_THEMES)) {
            expect(theme.surface).toBeTruthy();
            expect(theme.cardBg).toBeTruthy();
            expect(theme.accent).toBeTruthy();
            expect(theme.cardEdge.border).toBeTruthy();
            expect(typeof theme.cardRadius).toBe('number');
            expect(typeof theme.chipRadius).toBe('number');
            expect(typeof theme.thumbRadius).toBe('number');
            expect(theme.density.cardPadding).toBeGreaterThan(0);
        }
    });

    it('gives each design a label and a blurb an owner can choose from', () => {
        for (const theme of Object.values(MENU_THEMES)) {
            expect(theme.label.length).toBeGreaterThan(0);
            expect(theme.blurb.length).toBeGreaterThan(10);
        }
    });
});
