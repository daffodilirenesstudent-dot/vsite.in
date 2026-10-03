/**
 * Regression test for the 2026-10-03 production incident — the same CDN cache
 * poisoning as /manage/dashboard on 2026-08-18 (tests/unit/middlewareCacheHeaders.test.ts),
 * on the one page the August fix did not cover.
 *
 * Symptom: owners whose session expired landed on
 * https://vsite.in/auth/refresh?to=%2Fmanage%2Fdashboard and saw the raw RSC
 * flight payload ("2:I[19107,[],\"ClientPageRoot\"]…") as plain text.
 *
 * Cause: /auth/refresh is a 'use client' page outside the middleware matcher,
 * so Next.js prerendered it and stamped `s-maxage=31536000`. Cloudflare keys
 * on the URL alone (it ignores `Vary: RSC`), cached the text/x-component
 * variant first, and replayed it to every browser for a year
 * (live: cf-cache-status HIT, Content-Type text/x-component, Age 11554).
 *
 * Fix: a server layout forces the route dynamic, so Next.js sends
 * `private, no-cache, no-store` and no shared cache can hold either variant.
 * Route segment config is ignored inside a 'use client' file, hence a layout.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'src', 'app', 'auth', 'refresh');
const layoutPath = join(dir, 'layout.tsx');

describe('/auth/refresh is never stored by a shared cache', () => {
    it('has a layout that forces the route dynamic', () => {
        expect(existsSync(layoutPath), 'src/app/auth/refresh/layout.tsx').toBe(true);
        const layout = readFileSync(layoutPath, 'utf8');
        expect(layout).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/);
    });

    it('the layout is a server component, where segment config is honoured', () => {
        const layout = existsSync(layoutPath) ? readFileSync(layoutPath, 'utf8') : '';
        expect(layout).not.toMatch(/^\s*['"]use client['"]/m);
    });
});
