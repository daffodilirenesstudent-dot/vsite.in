#!/usr/bin/env node
// Edge cache guard — proves vsite.in cannot serve a raw RSC payload as a page.
//
// Incident: docs/incidents/2026-10-03-rsc-cdn-cache-poisoning.md
//
// Two checks, no dependencies (Node 20+):
//   1. SERVED — load every sitemap page (plus the auth interstitials) the way a
//      browser does. FAIL if any real URL comes back as text/x-component: the
//      CDN is serving a poisoned copy to visitors right now.
//   2. POISONABLE — on a UNIQUE throwaway URL per page, send the poisoning
//      request (`RSC: 1`) and then load the same URL like a browser. FAIL if
//      the browser load returns the flight payload: the origin is letting the
//      CDN store RSC responses again. Throwaway keys never touch a real
//      visitor's cache entry.
//
// Usage:  node .github/scripts/edge-cache-guard.mjs https://vsite.in [--full]
//   default  probes one page per route type (hourly CI)
//   --full   probes every sitemap page (run once after each deploy)
// Exit 0 = safe, 1 = poisoned or poisonable, 2 = could not run.

const base = (process.argv[2] || 'https://vsite.in').replace(/\/$/, '');
const full = process.argv.includes('--full');
const runId = `g${Date.now()}`;
const KEY_PATHS = ['/auth/refresh?to=%2Fmanage%2Fdashboard', '/login', '/signup'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, headers) {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'vsite-edge-cache-guard/1', ...headers },
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.text()).slice(0, 40);
    return {
        status: res.status,
        type: res.headers.get('content-type') ?? '',
        cf: res.headers.get('cf-cache-status') ?? '-',
        pop: (res.headers.get('cf-ray') ?? '').split('-').pop() || '-',
        body,
    };
}

// The flight payload is text/x-component and starts with rows like `2:I[`.
const isFlight = (r) => r.type.includes('text/x-component') || /^\d+:[A-Z"[]/.test(r.body);

/** One page per route type: first segment, and whether it is a leaf or a child. */
function sampleOf(paths) {
    const seen = new Map();
    for (const p of paths) {
        const parts = p.split('/').filter(Boolean);
        const key = `${parts[0] ?? ''}|${parts.length}`;
        if (!seen.has(key)) seen.set(key, p);
    }
    return [...seen.values()];
}

async function main() {
    const sitemap = await (await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(20_000) })).text();
    const paths = [...new Set([...sitemap.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => new URL(m[1]).pathname))];
    if (paths.length < 10) throw new Error(`sitemap returned only ${paths.length} URLs`);

    const served = [];
    for (const p of [...paths, ...KEY_PATHS]) {
        const r = await get(base + p, { Accept: 'text/html' });
        if (r.status === 200 && isFlight(r)) served.push(`${p} [cf ${r.cf}, PoP ${r.pop}]`);
    }

    const probe = full ? [...paths, ...KEY_PATHS] : [...sampleOf(paths), KEY_PATHS[0]];
    const poisonable = [];
    let pop = '-';
    for (const p of probe) {
        const url = `${base}${p}${p.includes('?') ? '&' : '?'}edge_guard=${runId}`;
        await get(url, { RSC: '1', 'Next-Router-State-Tree': '%5B%22%22%5D' });
        await sleep(300);
        const r = await get(url, { Accept: 'text/html' });
        pop = r.pop;
        if (isFlight(r)) poisonable.push(`${p} [cf ${r.cf}]`);
    }

    console.log(`edge-cache-guard ${base} (CDN PoP ${pop})`);
    console.log(`  served as raw RSC now : ${served.length}/${paths.length + KEY_PATHS.length} real URLs`);
    console.log(`  poisonable on probe   : ${poisonable.length}/${probe.length} pages${full ? ' (full)' : ' (one per route type)'}`);
    if (served.length || poisonable.length) {
        for (const s of served) console.error(`  SERVED POISONED  ${s}`);
        for (const s of poisonable) console.error(`  POISONABLE       ${s}`);
        console.error('Recovery: redeploy the app (DigitalOcean -> Actions -> Force rebuild and deploy).');
        console.error('Runbook: docs/incidents/2026-10-03-rsc-cdn-cache-poisoning.md');
        process.exit(1);
    }
    console.log('  OK: no page is served or storable as a raw RSC payload.');
}

main().catch((err) => {
    console.error(`edge-cache-guard could not run: ${err instanceof Error ? err.message : err}`);
    process.exit(2);
});
