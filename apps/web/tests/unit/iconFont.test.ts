import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ICON_NAMES, ICON_FONT_URL } from '@/lib/ui/iconFont';

/**
 * Material Symbols is a LIGATURE font: an icon is the text "home" drawn as a
 * glyph. Until the font arrives, the browser draws the text.
 *
 * Owner report, 2026-09-21: after login every icon showed as its name —
 * "home", "analytics" — for 1–3 seconds. Three causes compounded:
 *   1. the stylesheet was injected by an afterInteractive <Script>, so the font
 *      was not even requested until React had hydrated;
 *   2. `display=swap` told the browser to paint that text meanwhile;
 *   3. the URL requested all four variable axes for all ~4,300 icons: 3.8 MB.
 *
 * The fix loads a subset of exactly the icons the app uses (≈46 KB), from the
 * <head>, with font-display: block. The subset is what makes this suite
 * necessary: an icon that is used but missing from ICON_NAMES renders as its
 * name FOREVER. The first test below is the guard for every future icon.
 */

const SRC = resolve(__dirname, '../../src');
const NAME = '[a-z][a-z0-9_]*';

/**
 * `icon:` values that are NOT font icons. MenuItemCard keys its own inline SVGs
 * with `icon: 'sizes' | 'combo'`. Add here only a name you have confirmed is
 * never rendered inside a .material-symbols-outlined element.
 */
const NOT_FONT_ICONS = new Set(['combo', 'sizes']);

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) return sourceFiles(p);
        return /\.(tsx?|jsx?)$/.test(p) ? [p] : [];
    });
}

/**
 * Every icon name the source can render. Catches the four shapes in use:
 *   <span className="material-symbols-outlined">home</span>
 *   <span className="material-symbols-outlined">{ok ? 'check' : 'close'}</span>
 *   { icon: 'verified', ... }      — lookup maps rendered as {item.icon}
 *   <Stat icon="trending_up" />    — props forwarded into an icon element
 * Ternary CONDITIONS (`role === 'kot' ? …`) are deliberately not collected;
 * only the branches after `?` and `:` are.
 */
function usedIcons(): Map<string, string> {
    const found = new Map<string, string>();
    const add = (name: string, file: string) => {
        if (!NOT_FONT_ICONS.has(name) && !found.has(name)) found.set(name, relative(SRC, file));
    };
    for (const file of sourceFiles(SRC)) {
        const s = readFileSync(file, 'utf8');
        for (const m of s.matchAll(/material-symbols-outlined[^>]*>([\s\S]*?)<\//g)) {
            const body = m[1].trim();
            if (new RegExp(`^${NAME}$`).test(body)) add(body, file);
            for (const b of body.matchAll(new RegExp(`[?:]\s*['"](${NAME})['"]`, 'g'))) add(b[1], file);
        }
        for (const m of s.matchAll(new RegExp(`\bicon\s*[:=]\s*\{?\s*['"](${NAME})['"]`, 'g'))) add(m[1], file);
    }
    return found;
}

describe('icon font subset', () => {
    it('includes every icon the app renders — otherwise that icon shows as a word, permanently', () => {
        const registered = new Set<string>(ICON_NAMES);
        const missing = Array.from(usedIcons()).filter(([name]) => !registered.has(name));
        // To fix: add the name to ICON_NAMES in src/lib/ui/iconFont.ts, keeping
        // the list alphabetical. Check the name exists at fonts.google.com/icons.
        expect(missing.map(([name, file]) => `${name}  (${file})`)).toEqual([]);
    });

    it('is sorted and unique, which the Google Fonts icon_names parameter requires', () => {
        expect([...ICON_NAMES]).toEqual([...new Set(ICON_NAMES)].sort());
    });

    it('asks only for the axes the app varies, and paints nothing until the font is ready', () => {
        const url = new URL(ICON_FONT_URL);
        expect(url.searchParams.get('family')).toBe('Material Symbols Outlined:wght,FILL@400..700,0..1');
        expect(url.searchParams.get('icon_names')).toBe(ICON_NAMES.join(','));
        expect(url.searchParams.get('display')).toBe('block');
    });
});

describe('icon font loading', () => {
    const layout = readFileSync(join(SRC, 'app/layout.tsx'), 'utf8');

    it('is requested from the document head, not after hydration', () => {
        expect(layout).toMatch(/<link\s+rel="stylesheet"\s+href=\{ICON_FONT_URL\}/);
        expect(layout).not.toMatch(/id="material-symbols"/);
        expect(layout).not.toContain('Material+Symbols+Outlined');
    });

    it('clips an icon to its own square, so a late font can never spill a word into the layout', () => {
        const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8');
        const rule = css.match(/\.material-symbols-outlined\s*\{[^}]*\}/)?.[0] ?? '';
        expect(rule).toMatch(/width:\s*1em/);
        expect(rule).toMatch(/overflow:\s*hidden/);
    });
});
