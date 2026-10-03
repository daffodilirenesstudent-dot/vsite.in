#!/usr/bin/env node
// Proves every QR poster renders on a phone, whatever the network does.
//
//   npm run build && npm run posters:check
//
// Runs the real poster pipeline (src/lib/qr) in Chromium as a Pixel 7 and in
// WebKit as an iPhone 13, one injected fault per scenario, a fresh browser
// per poster and a 20 s limit (a hang is a failure). Exit 1 if any poster
// fails. Needs a `next build` for the real next/font CSS.
// Why: docs/incidents/2026-10-03-qr-poster-mobile.md
import http from 'node:http';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, '..', '..');
const require = createRequire(path.join(web, 'package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const { chromium, webkit, devices } = require('@playwright/test');

// The QR layout's next/font CSS: the stylesheet that defines --poster-poppins.
const cssDir = path.join(web, '.next', 'static', 'css');
if (!existsSync(cssDir)) { console.error('No .next build — run `npm run build` first.'); process.exit(2); }
const cssFile = readdirSync(cssDir).find(f => readFileSync(path.join(cssDir, f), 'utf8').includes('--poster-poppins'));
if (!cssFile) { console.error('No stylesheet defines --poster-poppins in .next/static/css.'); process.exit(2); }
const css = readFileSync(path.join(cssDir, cssFile), 'utf8');
const fontClasses = [...css.matchAll(/\.(__variable_[a-z0-9]+)\{--poster-[a-z]+:/g)].map(m => m[1]).join(' ');
const fontCss = `/_next/static/css/${cssFile}`;

// Bundle the browser side: the renderer exactly as the app ships it.
const out = path.join(tmpdir(), `vsite-poster-check-${process.pid}`);
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'sentry-stub.js'), 'export function captureException() {}\n');
writeFileSync(path.join(out, 'entry.ts'), `
import { renderDesignPoster, posterFontsFrom } from '@/lib/qr/designRender';
import { POSTER_DESIGNS, designById, DESIGN_W, DESIGN_H } from '@/lib/qr/posterDesigns';
import { getStyledQRBlob } from '@/lib/qr/styledQr';
(window as any).designIds = POSTER_DESIGNS.map(d => d.id);
(window as any).renderPoster = async (id: string, width: number) => {
    const t0 = performance.now();
    try {
        const design = designById(id)!;
        const canvas = await renderDesignPoster({
            design, accent: design.accent, storeName: 'Anna Cafe',
            qrBlobFor: px => getStyledQRBlob('https://vsite.in/shop/anna-cafe', undefined, px),
            widthPx: width, heightPx: Math.round(width * DESIGN_H / DESIGN_W),
            fonts: posterFontsFrom(document.getElementById('root') as Element),
        });
        const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
        if (!blob) throw new Error('Canvas export failed');
        return { ok: true, ms: Math.round(performance.now() - t0) };
    } catch (e: any) {
        return { ok: false, ms: Math.round(performance.now() - t0), error: e instanceof Error ? e.message : String(e?.type ?? e) };
    }
};
`);
await build({
    configFile: false, logLevel: 'error', root: out,
    resolve: { alias: [{ find: /^@sentry\/nextjs$/, replacement: path.join(out, 'sentry-stub.js') }, { find: /^@\//, replacement: path.join(web, 'src') + '/' }] },
    define: { 'process.env.NEXT_PUBLIC_FOOD_POSTERS': '"true"', 'process.env.NODE_ENV': '"production"' },
    build: { outDir: out, emptyOutDir: false, minify: false, lib: { entry: path.join(out, 'entry.ts'), formats: ['iife'], name: 'PosterCheck', fileName: () => 'check.js' } },
});

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${fontCss}"><div id="root" class="${fontClasses}"></div><script src="/__check.js"></script>`);
    }
    const file = url.pathname === '/__check.js' ? path.join(out, 'check.js')
        : url.pathname.startsWith('/_next/static/') ? path.join(web, '.next', url.pathname.slice('/_next'.length))
        : path.join(web, 'public', decodeURIComponent(url.pathname));
    if (!existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const noArial = ctx => ctx.route(`**${fontCss}`, async route => {
    const r = await route.fetch();
    route.fulfill({ response: r, body: (await r.text()).replaceAll('local("Arial")', 'local("vsite-font-that-does-not-exist")') });
});
const failFirstPlate = ctx => { const seen = new Set(); return ctx.route('**/poster-art/plates/**', r => { const u = r.request().url(); if (seen.has(u)) return r.continue(); seen.add(u); return r.abort('connectionreset'); }); };

const SCENARIOS = [
    { name: 'Android Chrome', engine: chromium, device: 'Pixel 7' },
    { name: 'Android without Arial (2026-09-27)', engine: chromium, device: 'Pixel 7', setup: noArial },
    { name: 'iPhone (WebKit)', engine: webkit, device: 'iPhone 13' },
    { name: 'no dish photo can download', engine: chromium, device: 'Pixel 7', setup: ctx => ctx.route(/\/poster-art\/(restaurant|cafe)\//, r => r.abort('connectionreset')) },
    { name: 'food plate fails once', engine: chromium, device: 'Pixel 7', setup: failFirstPlate },
    { name: 'older browser: no canvas roundRect', engine: chromium, device: 'Pixel 7', init: () => { delete CanvasRenderingContext2D.prototype.roundRect; } },
    { name: 'web fonts never arrive', engine: chromium, device: 'Pixel 7', setup: ctx => ctx.route('**/*.woff2', () => { /* never answer */ }) },
];

let failures = 0;
const ids = JSON.parse(JSON.stringify(await (async () => {
    const b = await chromium.launch(); const p = await b.newPage(); await p.goto(base);
    await p.waitForFunction(() => window.designIds); const v = await p.evaluate(() => window.designIds); await b.close(); return v;
})()));
for (const s of SCENARIOS) {
    const line = [];
    for (const id of ids) {
        const browser = await s.engine.launch();
        const ctx = await browser.newContext({ ...devices[s.device] });
        if (s.setup) await s.setup(ctx);
        if (s.init) await ctx.addInitScript(s.init);
        const page = await ctx.newPage();
        await page.goto(base);
        await page.waitForFunction(() => typeof window.renderPoster === 'function');
        const r = await Promise.race([
            page.evaluate(i => window.renderPoster(i, 720), id),
            new Promise(res => setTimeout(() => res({ ok: false, ms: 20000, error: 'hung for 20 s' }), 20000)),
        ]);
        await browser.close();
        if (!r.ok) failures++;
        line.push(r.ok ? `${id} ${(r.ms / 1000).toFixed(1)}s` : `${id} FAILED (${r.error})`);
    }
    console.log(`${line.some(l => l.includes('FAILED')) ? 'FAIL' : 'ok  '}  ${s.name.padEnd(36)} ${line.join(' | ')}`);
}
server.close();
rmSync(out, { recursive: true, force: true });
if (failures) { console.error(`\n${failures} poster(s) failed.`); process.exit(1); }
console.log(`\nAll ${SCENARIOS.length * ids.length} posters rendered.`);
