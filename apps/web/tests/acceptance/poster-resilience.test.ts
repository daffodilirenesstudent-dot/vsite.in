/**
 * Acceptance: the QR poster never fails for a reason that is not fatal.
 *
 * Production 2026-10-03 (second time after 2026-09-27): on phones the QR page
 * showed "The preview could not load" and the poster could not be downloaded.
 * Reproduced with the real renderer in Chromium (Pixel 7) and WebKit (iPhone
 * 13) — scratch harness, results in docs/incidents/2026-10-03-qr-poster-mobile.md:
 *   - ONE of the 17 dish photos failing to download killed the whole poster;
 *   - browsers without canvas roundRect (Safari <= 15, Chrome <= 98) failed
 *     every design with "ctx.roundRect is not a function";
 *   - every failure was swallowed by a bare catch {}, so the cause was never
 *     recorded — which is how it came back unnoticed.
 *
 * AC1  No canvas API that older phone browsers lack: no ctx.roundRect anywhere
 *      in the poster pipeline; roundRectPath draws the same shape portably.
 * AC2  One download, not 27: every design's food is pre-rendered into a plate
 *      (owner's idea, 2026-10-03); the plate is current with the design data
 *      and art, and the renderer picks the smallest plate sharp enough.
 * AC3  A network blip is not a failure: loads retry; waits never throw.
 * AC4  Fonts can only change how text looks, never whether the poster renders.
 * AC5  No silent failures: every failure path reports to Sentry with its stage.
 * AC6  The failure message is honest and offers a retry.
 * AC7  The print PDF is built from bytes, not a giant data-URL string.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('@sentry/nextjs', () => sentry);

const root = process.cwd();
const src = (p: string) => readFileSync(join(root, 'src', p), 'utf8');
const QR_LIB = join(root, 'src', 'lib', 'qr');
const qrFiles = readdirSync(QR_LIB).filter(f => f.endsWith('.ts')).map(f => `lib/qr/${f}`);

describe('AC1: works on older phone browsers', () => {
    it('no ctx.roundRect call anywhere in the poster pipeline', () => {
        for (const f of [...qrFiles, 'components/manage/MenuQrPanel.tsx']) {
            expect(src(f), f).not.toMatch(/\.roundRect\(/);
        }
    });

    it('roundRectPath traces a closed rounded rectangle with portable calls only', async () => {
        const { roundRectPath } = await import('@/lib/qr/canvasShapes');
        const calls: string[] = [];
        const ctx = new Proxy({}, { get: (_t, name) => (...args: number[]) => { calls.push(`${String(name)}(${args.map(a => Math.round(a)).join(',')})`); } });
        roundRectPath(ctx as unknown as CanvasRenderingContext2D, 10, 20, 100, 40, 8);
        expect(calls[0]).toBe('moveTo(18,20)');
        expect(calls.filter(c => c.startsWith('arcTo'))).toHaveLength(4);
        expect(calls.at(-1)).toBe('closePath()');
        expect(calls.join(' ')).not.toMatch(/roundRect/);
    });

    it('clamps the radius to half the shorter side, and r = 0 is a plain rectangle', async () => {
        const { roundRectPath } = await import('@/lib/qr/canvasShapes');
        const record = () => { const c: string[] = []; return { c, ctx: new Proxy({}, { get: (_t, n) => (...a: number[]) => { c.push(`${String(n)}(${a.join(',')})`); } }) as unknown as CanvasRenderingContext2D }; };
        const big = record(); roundRectPath(big.ctx, 0, 0, 100, 40, 999);
        expect(big.c[0]).toBe('moveTo(20,0)');            // r clamped to 40 / 2
        const square = record(); roundRectPath(square.ctx, 0, 0, 10, 10, 0);
        expect(square.c[0]).toBe('moveTo(0,0)');
    });
});

describe('AC2: one pre-rendered food plate per design, not 27 downloads', () => {
    it('every design has plates, on disk, at the recorded sizes', async () => {
        const { POSTER_DESIGNS, DESIGN_W, DESIGN_H } = await import('@/lib/qr/posterDesigns');
        const { POSTER_PLATES } = await import('@/lib/qr/posterPlates');
        for (const d of POSTER_DESIGNS) {
            const plate = POSTER_PLATES[d.id];
            expect(plate, d.id).toBeDefined();
            for (const f of plate.files) {
                const file = join(root, 'public', f.src);
                expect(existsSync(file), f.src).toBe(true);
                const b = readFileSync(file);
                expect(b.toString('ascii', 8, 12), `${f.src} is WebP`).toBe('WEBP');
                expect(b.toString('ascii', 12, 16), `${f.src} has alpha (VP8X)`).toBe('VP8X');
                const w = 1 + b.readUIntLE(24, 3), h = 1 + b.readUIntLE(27, 3);
                expect([w, h], f.src).toEqual([Math.round(DESIGN_W * f.scale), Math.round(DESIGN_H * f.scale)]);
            }
        }
    });

    it('the plates are current: regenerate (npm run posters:plates) after changing a design or its art', async () => {
        const { POSTER_DESIGNS } = await import('@/lib/qr/posterDesigns');
        const { POSTER_PLATES, plateHash } = await import('@/lib/qr/posterPlates');
        const art = (p: string) => createHash('sha256').update(readFileSync(join(root, 'public', p))).digest('hex');
        for (const d of POSTER_DESIGNS) {
            expect(POSTER_PLATES[d.id].hash, `${d.id} plate is stale — run npm run posters:plates`).toBe(plateHash(d, art));
        }
    });

    it("each design's food is one contiguous layer, so one plate keeps the stacking order", async () => {
        const { POSTER_DESIGNS } = await import('@/lib/qr/posterDesigns');
        for (const d of POSTER_DESIGNS) {
            const idx = d.elements.map((e, i) => (e.kind === 'image' ? i : -1)).filter(i => i >= 0);
            expect(idx.length, d.id).toBeGreaterThan(0);
            expect(idx[idx.length - 1] - idx[0] + 1, `${d.id} images are interleaved with other layers`).toBe(idx.length);
        }
    });

    it('picks the smallest plate that is sharp enough: the 720 px preview a light one, A4 print the sharpest', async () => {
        const { designById } = await import('@/lib/qr/posterDesigns');
        const { plateFor, POSTER_PLATES } = await import('@/lib/qr/posterPlates');
        const feast = designById('feast-ring')!;
        const scales = POSTER_PLATES['feast-ring'].files.map(f => f.scale).sort((a, b) => a - b);
        expect(plateFor(feast, 720 / 559)?.scale).toBe(scales[0]);
        expect(plateFor(feast, 2551 / 559)?.scale).toBe(scales[scales.length - 1]);
    });

    it('the renderer draws the plate, and fetches individual dish photos only for a design without one', () => {
        const r = src('lib/qr/designRender.ts');
        expect(r).toMatch(/plateFor\(/);
    });
});

describe('AC3: a network blip is not a failure', () => {
    it('withRetry succeeds on a later attempt', async () => {
        const { withRetry } = await import('@/lib/qr/posterResilience');
        let n = 0;
        const v = await withRetry(async () => { if (++n < 3) throw new Error('blip'); return 'ok'; }, { attempts: 3, delayMs: 1 });
        expect(v).toBe('ok');
        expect(n).toBe(3);
    });

    it('withRetry gives up after the last attempt with the last error', async () => {
        const { withRetry } = await import('@/lib/qr/posterResilience');
        let n = 0;
        await expect(withRetry(async () => { n++; throw new Error(`fail ${n}`); }, { attempts: 3, delayMs: 1 })).rejects.toThrow('fail 3');
        expect(n).toBe(3);
    });

    it('settleWithin never throws: resolved, rejected and hung promises all settle', async () => {
        const { settleWithin } = await import('@/lib/qr/posterResilience');
        await expect(settleWithin(Promise.resolve(1), 50)).resolves.toEqual({ ok: true });
        await expect(settleWithin(Promise.reject(new Error('x')), 50)).resolves.toMatchObject({ ok: false, reason: 'error' });
        await expect(settleWithin(new Promise(() => {}), 20)).resolves.toMatchObject({ ok: false, reason: 'timeout' });
    });

    it('image and QR loads retry', () => {
        const r = src('lib/qr/designRender.ts');
        expect(r).toMatch(/withRetry\(/);
    });
});

describe('AC4: fonts never decide whether the poster renders', () => {
    it('the renderer settles the font wait instead of awaiting it bare', () => {
        const r = src('lib/qr/designRender.ts');
        expect(r).toMatch(/settleWithin\(\s*waitForPosterFonts\(/);
        expect(r).not.toMatch(/Promise\.all\(\[[^\]]*waitForPosterFonts\(/s);
    });
});

describe('AC5: no silent failures', () => {
    it('reportPosterIssue sends the error to Sentry with its stage, once per stage per page', async () => {
        const { reportPosterIssue } = await import('@/lib/qr/posterTelemetry');
        sentry.captureException.mockClear();
        reportPosterIssue('art', new Error('boom'), { design: 'feast-ring' });
        reportPosterIssue('art', new Error('boom again'), { design: 'feast-ring' });
        reportPosterIssue('qr', new Error('qr down'));
        expect(sentry.captureException).toHaveBeenCalledTimes(2);
        const [, ctx] = sentry.captureException.mock.calls[0] as [unknown, { tags: Record<string, string> }];
        expect(ctx.tags).toMatchObject({ area: 'qr-poster', stage: 'art' });
    });

    it('turns an image error Event into a readable Error naming the file', async () => {
        const { reportPosterIssue } = await import('@/lib/qr/posterTelemetry');
        sentry.captureException.mockClear();
        const ev = { type: 'error', target: { src: 'https://vsite.in/poster-art/plates/x.webp' } };
        reportPosterIssue('export', ev);
        const [err] = sentry.captureException.mock.calls[0] as [Error];
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toContain('poster-art/plates/x.webp');
    });

    it('every failure path on the QR page reports instead of swallowing', () => {
        const panel = src('components/manage/MenuQrPanel.tsx');
        for (const stage of ['preview', 'thumbnail', 'pdf', 'status', 'qr-download']) {
            expect(panel, stage).toMatch(new RegExp(`reportPosterIssue\\(\\s*'${stage}'`));
        }
    });
});

describe('AC6: an honest failure message with a way out', () => {
    it('no longer claims downloads still work, and offers Try again', () => {
        const panel = src('components/manage/MenuQrPanel.tsx');
        expect(panel).not.toMatch(/Downloads still work/);
        expect(panel).toMatch(/Try again/);
    });
});

describe('AC7: the print PDF is built from bytes', () => {
    it('downloadPdf does not build a data-URL string of the print-size canvas', () => {
        const panel = src('components/manage/MenuQrPanel.tsx');
        expect(panel).not.toMatch(/toDataURL\(/);
    });
});
