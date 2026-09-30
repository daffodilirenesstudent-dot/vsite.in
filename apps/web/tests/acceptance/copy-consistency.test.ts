import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as facts from '@/content/facts';
import { GUIDE } from '@/content/guide';

/**
 * Four owner decisions of 2026-09-30, turned into guards so the copy cannot
 * drift back:
 *   1. "About 3 minutes" is true, but only as: sign-up to a live menu link for
 *      a typical menu. The complete setup incl. the printed QR poster is 10-15.
 *   2. There is NO diner-side language toggle. A dish shows the name as the
 *      owner typed it (Tamil, English or both); no automatic translation.
 *   3. The NFC + QR sticker is optional and paid. The QR code itself is free.
 *   4. Nothing in the extractor treats handwriting specially, so no copy may
 *      claim handwritten menus are read well.
 *
 * Scans the same public surfaces as marketing-claims.test.ts (plus lib/seo,
 * where llms-full is built). If a hit is a genuine false positive, tell the
 * owner; do not loosen the pattern.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');
const EXCLUDED_APP_DIRS = new Set(['manage', 'onboarding', 'api', 'login', 'signup', 'auth', 'shop', 'tmp-preview']);

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const rel = relative(SRC, full).split(sep).join('/');
        if (statSync(full).isDirectory()) {
            if (rel.startsWith('app/') && EXCLUDED_APP_DIRS.has(rel.split('/')[1])) continue;
            walk(full, out);
        } else if (/\.(ts|tsx)$/.test(name)) {
            out.push(full);
        }
    }
    return out;
}

function stripComments(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function publicFiles(): { rel: string; text: string }[] {
    const roots = ['content', 'components/home', 'app', 'lib/seo'];
    const files: string[] = [];
    for (const r of roots) walk(join(SRC, r), files);
    return files
        .map((f) => ({ rel: relative(SRC, f).split(sep).join('/'), text: stripComments(readFileSync(f, 'utf8')) }))
        .filter((f) => f.rel !== 'content/roadmap.ts');
}

function hits(pattern: RegExp, files = publicFiles()): string[] {
    const found: string[] = [];
    for (const { rel, text } of files) {
        const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            found.push(`${rel}:${line} → ${m[0]}`);
        }
    }
    return found;
}

describe('there is no diner-side language toggle', () => {
    it('never claims one', () => {
        expect(
            hits(
                /switch(es|ed)? (the )?(menu )?(language )?(with|by) (one|a) tap|language toggle|toggle between (tamil|languages)|diner switches|customers? (can )?(toggle|switch)/i,
            ),
        ).toEqual([]);
    });
});

describe('the NFC + QR sticker is optional and paid', () => {
    it('never says an NFC card or sticker is included, free or shipped', () => {
        expect(
            hits(
                /nfc (card|sticker)s?[^.\n]{0,80}(included|free|no extra cost|at no (extra )?cost|shipped|posted)|(included|free|no extra cost)[^.\n]{0,60}nfc/i,
            ),
        ).toEqual([]);
    });

    it('never puts "Included" in a table row about NFC', () => {
        const bad: string[] = [];
        for (const { rel, text } of publicFiles()) {
            text.split('\n').forEach((line, i) => {
                if (/nfc/i.test(line) && /['"`]\s*Included\s*['"`]/i.test(line)) bad.push(`${rel}:${i + 1}`);
            });
        }
        expect(bad).toEqual([]);
    });
});

describe('setup time is defined once, precisely', () => {
    it('never says under 3 minutes, or 3 minutes to a QR on the table', () => {
        expect(hits(/under (3|three) min/i)).toEqual([]);
        expect(
            hits(/(three minutes|3 minutes|3 min)[^\n]{0,40}QR on the table|QR on the table[^\n]{0,40}(three minutes|3 minutes|3 min)/i),
        ).toEqual([]);
    });

    it('facts.ts holds the live-menu and complete-setup figures', () => {
        const f = facts as Record<string, unknown>;
        expect(f.LIVE_MENU_MINUTES).toBe(3);
        expect(f.COMPLETE_SETUP_MINUTES).toEqual({ min: 10, max: 15 });
        expect(f.SETUP_TIME_CLAIM_UNVERIFIED).toBeUndefined();
    });

    it('the guide hub and the cost-and-time page state both figures, from the constants', () => {
        const src = readFileSync(join(SRC, 'content/guide/pages.ts'), 'utf8');
        expect(src).toContain('LIVE_MENU_MINUTES');
        expect(src).toContain('COMPLETE_SETUP_MINUTES');
        for (const slug of ['digital-menu-setup', 'cost-and-time'] as const) {
            const all = JSON.stringify(GUIDE[slug].en);
            expect(all, slug).toContain(`${facts.LIVE_MENU_MINUTES} minutes`);
            expect(all, slug).toContain(`${facts.COMPLETE_SETUP_MINUTES.min} to ${facts.COMPLETE_SETUP_MINUTES.max} minutes`);
        }
    });
});

describe('handwritten menus', () => {
    it('are never claimed to work well', () => {
        expect(hits(/handwritten[^.\n]{0,80}(works?|perfect|accurate|reads? (well|any))/i)).toEqual([]);
    });
});
