import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from '@playwright/test';
import ts from 'typescript';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Owner photo compression in REAL browsers: Chromium (Android Chrome), WebKit
 * (iPhone Safari) and Firefox. Canvas behaviour differs between engines —
 * WebP encoding, EXIF orientation, resampling — so a node-only test would
 * prove nothing about what an owner's phone actually uploads.
 *
 * The shipped modules are transpiled with TypeScript and served to a blank
 * page through request interception: no dev server, no bundler, no new
 * dependency. Engines that are not installed are skipped, not failed.
 */

const SRC = join(__dirname, '..', '..', 'src', 'lib', 'menu');
const MODULES = ['menuImages', 'menuPhoto', 'imageCompress'];
const ORIGIN = 'https://vsite.test';

function moduleJs(name: string): string {
    const path = join(SRC, `${name}.ts`);
    if (!existsSync(path)) return 'export {};';
    const js = ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    return js.replace(/from ['"]@\/lib\/menu\/(\w+)['"]/g, "from './$1.js'");
}

const PAGE = `<!doctype html><meta charset="utf-8">
<script>globalThis.process = { env: {} };</script>
<script type="module">
  import * as compress from './imageCompress.js';
  import * as photo from './menuPhoto.js';
  window.lib = { ...compress, ...photo };
  window.libReady = true;
</script>`;

/** Test-image factory, installed in the page before anything else runs. */
const FIXTURES = `
window.fx = {
  canvasBlob(c, type, q) { return new Promise(r => c.toBlob(r, type, q)); },
  async photo(w, h, type = 'image/jpeg', q = 0.92) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#7a3b12'); g.addColorStop(0.5, '#e8a33d'); g.addColorStop(1, '#2f6b2a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      x.fillStyle = 'hsl(' + (i * 37 % 360) + ',70%,' + (30 + i % 40) + '%)';
      x.beginPath(); x.arc((i * 997) % w, (i * 613) % h, 40 + (i * 53) % 220, 0, 7); x.fill();
    }
    const d = x.getImageData(0, 0, w, h), p = d.data;
    let s = 12345;
    for (let i = 0; i < p.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = (s % 21) - 10;
      p[i] += n; p[i + 1] += n; p[i + 2] += n;
    }
    x.putImageData(d, 0, 0);
    const b = await this.canvasBlob(c, type, q);
    return new File([b], type === 'image/png' ? 'dish.png' : 'dish.jpg', { type });
  },
  async stripes(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#000';
    for (let i = 0; i < w; i += 2) x.fillRect(i, 0, 1, h);
    return new File([await this.canvasBlob(c, 'image/png')], 'stripes.png', { type: 'image/png' });
  },
  async transparentPng(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.fillStyle = '#d0021b'; x.fillRect(w / 4, h / 4, w / 2, h / 2);
    return new File([await this.canvasBlob(c, 'image/png')], 'logo.png', { type: 'image/png' });
  },
  async withOrientation(file, o) {
    const b = new Uint8Array(await file.arrayBuffer());
    const tiff = [0x4D,0x4D,0x00,0x2A,0,0,0,8, 0,1, 0x01,0x12, 0,3, 0,0,0,1, 0,o, 0,0, 0,0,0,0];
    const payload = [0x45,0x78,0x69,0x66,0,0].concat(tiff);
    const len = payload.length + 2;
    const app1 = [0xFF,0xE1,(len >> 8) & 255,len & 255].concat(payload);
    const out = new Uint8Array(b.length + app1.length);
    out.set(b.subarray(0, 2), 0); out.set(app1, 2); out.set(b.subarray(2), 2 + app1.length);
    return new File([out], 'portrait.jpg', { type: 'image/jpeg' });
  },
  async hasExif(blob) {
    const b = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
    for (let i = 0; i < b.length - 4; i++)
      if (b[i] === 0x45 && b[i+1] === 0x78 && b[i+2] === 0x69 && b[i+3] === 0x66) return true;
    return false;
  },
  async read(blob) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
    return { width: bmp.width, height: bmp.height, ctx: x };
  },
  async describe(out, input) {
    const r = await this.read(out);
    return { type: out.type, size: out.size, width: r.width, height: r.height,
             same: out === input, name: out.name, inputSize: input && input.size };
  },
};`;

const SIMULATE_SAFARI = `
const orig = HTMLCanvasElement.prototype.toBlob;
HTMLCanvasElement.prototype.toBlob = function (cb, type, q) {
  return orig.call(this, cb, type === 'image/webp' ? 'image/png' : type, q);
};`;

async function openLab(browser: Browser, extraInit?: string): Promise<Page> {
    const page = await browser.newPage();
    await page.addInitScript(FIXTURES);
    if (extraInit) await page.addInitScript(extraInit);
    await page.route(`${ORIGIN}/**`, route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/') return route.fulfill({ contentType: 'text/html', body: PAGE });
        const m = /^\/(\w+)\.js$/.exec(path);
        if (m && MODULES.includes(m[1])) return route.fulfill({ contentType: 'text/javascript', body: moduleJs(m[1]) });
        return route.fulfill({ status: 404, body: '' });
    });
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction('window.libReady === true', undefined, { timeout: 15_000 });
    return page;
}

function installed(type: BrowserType): boolean {
    try { return existsSync(type.executablePath()); } catch { return false; }
}

const ENGINES: Array<[string, BrowserType]> = [['chromium', chromium], ['webkit', webkit], ['firefox', firefox]];

describe.each(ENGINES)('%s', (name, type) => {
    const available = installed(type);
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        if (!available) return;
        browser = await type.launch();
        page = await openLab(browser);
    }, 60_000);

    afterAll(async () => { await browser?.close(); });

    it.skipIf(!available)('shrinks a 12 MP camera photo to 1600 px, never PNG, at least 70% smaller', async () => {
        const r = await page.evaluate(async () => {
            const w = window as any;
            const input = await w.fx.photo(4000, 3000);
            const out = await w.lib.prepareMenuPhoto(input);
            return w.fx.describe(out, input);
        });
        expect([r.width, r.height]).toEqual([1600, 1200]);
        expect(['image/webp', 'image/jpeg']).toContain(r.type);
        expect(r.name).toMatch(r.type === 'image/webp' ? /\.webp$/ : /\.jpg$/);
        expect(r.size).toBeLessThan(r.inputSize * 0.3);
    }, 60_000);

    it.skipIf(!available)('turns a 9 MB-style PNG into a compact photo', async () => {
        const r = await page.evaluate(async () => {
            const w = window as any;
            const input = await w.fx.photo(2816, 1536, 'image/png');
            const out = await w.lib.prepareMenuPhoto(input);
            return w.fx.describe(out, input);
        });
        expect([r.width, r.height]).toEqual([1600, 873]);
        expect(r.type).not.toBe('image/png');
        expect(r.size).toBeLessThan(r.inputSize * 0.2);
    }, 60_000);

    it.skipIf(!available)('keeps a portrait photo upright (EXIF orientation) and strips the metadata', async () => {
        const r = await page.evaluate(async () => {
            const w = window as any;
            // Stored landscape, EXIF says "rotate 90°" — exactly how phones save portraits.
            const input = await w.fx.withOrientation(await w.fx.photo(2400, 1200), 6);
            const out = await w.lib.prepareMenuPhoto(input);
            return { ...(await w.fx.describe(out, input)), exif: await w.fx.hasExif(out) };
        });
        expect([r.width, r.height]).toEqual([800, 1600]);
        expect(r.exif).toBe(false);
    }, 60_000);

    it.skipIf(!available)('puts transparent PNG areas on white, not black', async () => {
        const px = await page.evaluate(async () => {
            const w = window as any;
            const out = await w.lib.prepareMenuPhoto(await w.fx.transparentPng(2000, 2000));
            const r = await w.fx.read(out);
            return Array.from(r.ctx.getImageData(5, 5, 1, 1).data);
        });
        expect(px[0]).toBeGreaterThan(240);
        expect(px[1]).toBeGreaterThan(240);
        expect(px[2]).toBeGreaterThan(240);
    }, 60_000);

    it.skipIf(!available)('downscales fine detail without moiré (step-down)', async () => {
        const stdDev = await page.evaluate(async () => {
            const w = window as any;
            const out = await w.lib.prepareMenuPhoto(await w.fx.stripes(4000, 3000));
            const r = await w.fx.read(out);
            const d = r.ctx.getImageData(r.width / 2 - 100, r.height / 2 - 100, 200, 200).data;
            let sum = 0, sq = 0, n = 0;
            for (let i = 0; i < d.length; i += 4) {
                const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                sum += l; sq += l * l; n++;
            }
            const mean = sum / n;
            return Math.sqrt(sq / n - mean * mean);
        });
        // 1 px black/white stripes must average to flat grey, not beat into bands.
        expect(stdDev).toBeLessThan(15);
    }, 60_000);

    it.skipIf(!available)('leaves an already-compact JPEG byte-for-byte untouched', async () => {
        const r = await page.evaluate(async () => {
            const w = window as any;
            const input = await w.fx.photo(1200, 900, 'image/jpeg', 0.8);
            const out = await w.lib.prepareMenuPhoto(input);
            return { same: out === input, size: input.size };
        });
        expect(r.size).toBeLessThan(500 * 1024);
        expect(r.same).toBe(true);
    }, 60_000);

    it.skipIf(!available)('rejects non-images, files over 25 MB and unreadable photos with a code', async () => {
        const codes = await page.evaluate(async () => {
            const w = window as any;
            const code = async (f: File) => {
                try { await w.lib.prepareMenuPhoto(f); return 'OK'; } catch (e: any) { return e.code ?? String(e); }
            };
            return {
                text: await code(new File(['hello'], 'notes.txt', { type: 'text/plain' })),
                big: await code(new File([new Uint8Array(26 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' })),
                junk: await code(new File([new Uint8Array([1, 2, 3, 4])], 'broken.jpg', { type: 'image/jpeg' })),
                heic: await code(new File([new Uint8Array([1, 2, 3, 4])], 'IMG_1.HEIC', { type: '' })),
            };
        });
        expect(codes.text).toBe('NOT_IMAGE');
        expect(codes.big).toBe('TOO_LARGE');
        expect(codes.junk).toBe('UNREADABLE');
        expect(codes.heic).toBe('HEIC_UNSUPPORTED');
    }, 60_000);

    it.skipIf(!available)('makes a 360 px square thumbnail from the prepared photo', async () => {
        const r = await page.evaluate(async () => {
            const w = window as any;
            const photo = await w.lib.prepareMenuPhoto(await w.fx.photo(4000, 3000));
            const thumb = await w.lib.makeMenuThumbnail(photo);
            return w.fx.describe(thumb, photo);
        });
        expect([r.width, r.height]).toEqual([360, 360]);
        expect(r.size).toBeLessThan(60 * 1024);
    }, 60_000);

    it.skipIf(!available)('falls back to JPEG when the browser cannot encode WebP (Safari)', async () => {
        const safari = await openLab(browser, SIMULATE_SAFARI);
        try {
            const r = await safari.evaluate(async () => {
                const w = window as any;
                const input = await w.fx.photo(4000, 3000);
                const out = await w.lib.prepareMenuPhoto(input);
                return { type: out.type, name: out.name };
            });
            expect(r.type).toBe('image/jpeg');
            expect(r.name).toMatch(/\.jpg$/);
        } finally {
            await safari.close();
        }
    }, 60_000);
});
