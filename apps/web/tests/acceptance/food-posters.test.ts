import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Food posters — pass 2 of the QR page work.
 *
 * A QR code looks the same whatever it opens; the design around it says what
 * it is for. In India the QR a diner sees most is a UPI payment standee, so a
 * menu QR that looks like one gets mistaken for one. Food around the code
 * answers "what is this?" before a word is read.
 *
 * Designs approved by the owner on 2026-09-25 from the design canvas
 * (https://claude.ai/artifact/DXtymTvPcXZHveidT7aspQ): restaurant Feast ring
 * and Table edge, café Floating and Counter. Headline "Scan and see menu".
 * No Tamil on posters — the owner's call, recorded in memory.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');
const read = (p: string) => (existsSync(join(SRC, p)) ? readFileSync(join(SRC, p), 'utf8') : '');
const shipped = (p: string) => read(p).replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/\/\/[^\n]*/g, '');

const DESIGNS = 'lib/qr/posterDesigns.ts';
const DATA = 'lib/qr/posterDesignData.ts';
const RENDER = 'lib/qr/designRender.ts';
const PANEL = 'components/manage/MenuQrPanel.tsx';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

const mod = () => import('@/lib/qr/posterDesigns');

describe('AC1: flag', () => {
    it('is OFF when the env var is missing', async () => {
        vi.stubEnv('NEXT_PUBLIC_FOOD_POSTERS', '');
        expect((await mod()).FOOD_POSTERS).toBe(false);
    });

    it('is ON only for "true"', async () => {
        vi.stubEnv('NEXT_PUBLIC_FOOD_POSTERS', '1');
        expect((await mod()).FOOD_POSTERS).toBe(false);
        vi.resetModules();
        vi.stubEnv('NEXT_PUBLIC_FOOD_POSTERS', 'true');
        expect((await mod()).FOOD_POSTERS).toBe(true);
    });
});

describe('AC2: the approved designs', () => {
    it('has two restaurant and two café designs, in the approved order', async () => {
        const { POSTER_DESIGNS } = await mod();
        expect(POSTER_DESIGNS.map(d => [d.id, d.family])).toEqual([
            ['feast-ring', 'restaurant'], ['table-edge', 'restaurant'],
            ['cafe-floating', 'cafe'], ['cafe-counter', 'cafe'],
        ]);
    });

    it('keeps the store\'s current poster as a choice', async () => {
        const { CLASSIC_DESIGN_ID, POSTER_DESIGNS } = await mod();
        expect(CLASSIC_DESIGN_ID).toBe('classic');
        expect(POSTER_DESIGNS.map(d => d.id)).not.toContain('classic');
    });

    it('each design has a default colour and a few to choose from', async () => {
        const { POSTER_DESIGNS } = await mod();
        for (const d of POSTER_DESIGNS) {
            expect(d.accentOptions[0]).toBe(d.accent);
            expect(d.accentOptions.length).toBeGreaterThanOrEqual(3);
            for (const c of d.accentOptions) expect(c).toMatch(/^#[0-9A-F]{6}$/i);
        }
    });
});

describe('AC3: business type picks the family', () => {
    it('maps the five business types, and unset to restaurant', async () => {
        const { posterFamily } = await mod();
        expect(posterFamily('restaurant')).toBe('restaurant');
        expect(posterFamily('mess')).toBe('restaurant');
        expect(posterFamily('cafe')).toBe('cafe');
        expect(posterFamily('takeaway')).toBe('cafe');
        expect(posterFamily('tea_shop')).toBe('cafe');
        expect(posterFamily(null)).toBe('restaurant');
        expect(posterFamily('something-new')).toBe('restaurant');
    });
});

describe('AC4: the words on every poster', () => {
    it('the headline is "Scan and see menu"', async () => {
        const { HEADLINE, headlineText } = await mod();
        expect(HEADLINE).toBe('Scan and see menu');
        expect(`${headlineText('headline-top')} ${headlineText('headline-bottom')}`).toBe(HEADLINE);
        expect(headlineText('headline')).toBe(HEADLINE);
        expect(headlineText('credit')).toBe('Menu by vsite');
    });

    it('every design shows the headline, the store name and the credit', async () => {
        const { POSTER_DESIGNS } = await mod();
        for (const d of POSTER_DESIGNS) {
            const roles = d.elements.filter(e => e.kind === 'text').map(e => (e as { role: string }).role);
            expect(roles, d.id).toContain('store');
            expect(roles, d.id).toContain('credit');
            const hasHeadline = roles.includes('headline') || (roles.includes('headline-top') && roles.includes('headline-bottom'));
            expect(hasHeadline, d.id).toBe(true);
        }
    });

    it('has no Tamil anywhere in the poster code', () => {
        for (const f of [DESIGNS, DATA, RENDER]) {
            expect(read(f), f).not.toMatch(/[஀-௿]/);
        }
    });
});

type Box = { x: number; y: number; w: number; h: number };
const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** The axis-aligned box a rotated image actually covers. */
function rotatedBox(e: { x: number; y: number; w: number; h: number; rotate?: number }): Box {
    const t = ((e.rotate ?? 0) * Math.PI) / 180;
    const w = Math.abs(e.w * Math.cos(t)) + Math.abs(e.h * Math.sin(t));
    const h = Math.abs(e.w * Math.sin(t)) + Math.abs(e.h * Math.cos(t));
    return { x: e.x + e.w / 2 - w / 2, y: e.y + e.h / 2 - h / 2, w, h };
}

describe('AC5: the QR is protected on every design', () => {
    it('no food image touches the QR card or its corner brackets', async () => {
        const { POSTER_DESIGNS, qrCardOf, BRACKET_REACH } = await mod();
        for (const d of POSTER_DESIGNS) {
            const q = qrCardOf(d);
            const reach = q.corners ? BRACKET_REACH : 0;
            const guard = { x: q.x - reach, y: q.y - reach, w: q.size + 2 * reach, h: q.size + 2 * reach };
            for (const e of d.elements) {
                if (e.kind !== 'image') continue;
                expect(intersects(rotatedBox(e), guard), `${d.id}: ${e.src}`).toBe(false);
            }
        }
    });

    it('the card keeps a clear border around the code', async () => {
        const { POSTER_DESIGNS, qrCardOf } = await mod();
        for (const d of POSTER_DESIGNS) {
            const q = qrCardOf(d);
            expect(q.pad / q.size, d.id).toBeGreaterThanOrEqual(0.08);
        }
    });

    it('the QR card sits in the middle of the poster', async () => {
        const { POSTER_DESIGNS, qrCardOf, DESIGN_W } = await mod();
        for (const d of POSTER_DESIGNS) {
            const q = qrCardOf(d);
            expect(Math.abs(q.x + q.size / 2 - DESIGN_W / 2), d.id).toBeLessThan(1);
        }
    });
});

describe('AC6: the food art ships with the app', () => {
    it('every image a design names is in public/poster-art', async () => {
        const { POSTER_DESIGNS } = await mod();
        for (const d of POSTER_DESIGNS) {
            for (const e of d.elements) {
                if (e.kind !== 'image') continue;
                expect(e.src, d.id).toMatch(/^\/poster-art\/(restaurant|cafe)\/[a-z0-9-]+\.webp$/);
                expect(existsSync(join(WEB, 'public', e.src)), e.src).toBe(true);
            }
        }
    });
});

describe('AC7: any print card, any store name', () => {
    it('covers the card and keeps the design centred', async () => {
        const { designCover, DESIGN_W, DESIGN_H } = await mod();
        for (const [w, h] of [[1311, 1819], [1169, 1648], [2551, 3579], [720, 1023]]) {
            const c = designCover(w, h);
            expect(DESIGN_W * c.scale).toBeGreaterThanOrEqual(w - 1e-6);
            expect(DESIGN_H * c.scale).toBeGreaterThanOrEqual(h - 1e-6);
            expect(c.dx * 2 + DESIGN_W * c.scale).toBeCloseTo(w, 6);
            expect(c.dy * 2 + DESIGN_H * c.scale).toBeCloseTo(h, 6);
        }
    });

    it('shrinks a long name to fit, but not below the floor', async () => {
        const { fitFontSize } = await mod();
        const measure = (chars: number) => (size: number) => chars * size * 0.6;
        expect(fitFontSize(measure(11), 400, 30, 14)).toBe(30);          // "Cream Story" fits
        const s = fitFontSize(measure(40), 400, 30, 14);                  // a long name
        expect(s).toBeLessThan(30);
        expect(measure(40)(s)).toBeLessThanOrEqual(400);
        expect(fitFontSize(measure(200), 400, 30, 14)).toBe(14);         // absurdly long: floor
    });
});

describe('AC8 / AC9: the print kit uses the chosen design', () => {
    it('renders preview, PDF and Status image through the design renderer when the flag is on', () => {
        const panel = shipped(PANEL);
        expect(panel).toMatch(/FOOD_POSTERS/);
        expect(panel).toMatch(/renderDesignPoster\(/);
        expect(panel).toMatch(/designStorageKey\(/);
    });

    it('remembers the choice per store without trusting storage', async () => {
        const { designStorageKey } = await mod();
        expect(designStorageKey('site-1')).not.toBe(designStorageKey('site-2'));
        const panel = shipped(PANEL);
        expect(panel).toMatch(/try\s*\{[^}]*localStorage/);
    });

    it('offers the designs as keyboard-reachable choices', () => {
        const panel = shipped(PANEL);
        expect(panel).toMatch(/aria-label="Poster design"/);
    });
});
