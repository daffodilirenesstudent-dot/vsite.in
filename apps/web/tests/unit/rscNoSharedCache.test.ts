/**
 * Systemic guard for the RSC / CDN cache-poisoning class.
 *
 * Incidents: /manage/dashboard (2026-08-18) and /auth/refresh (2026-10-03) —
 * owners saw the raw React flight payload ("2:I[…,"ClientPageRoot"]…") as
 * plain text. Root cause, proven on production 2026-10-03 with throwaway URLs:
 *
 *   1. Next.js serves two bodies from one URL — HTML for a document load,
 *      text/x-component for a request carrying the `RSC: 1` header.
 *   2. Static pages are stamped `s-maxage=31536000`.
 *   3. The CDN (Cloudflare, via DigitalOcean) ignores `Vary: RSC` and keys on
 *      the URL alone, so whichever body is stored first is served to everyone.
 *   4. The client normally adds a cache-busting `?_rsc=` to RSC requests, but
 *      a middleware redirect builds a fresh URL and drops it; `fetch` follows
 *      the redirect with the RSC headers still attached. Anyone can also send
 *      `RSC: 1` on purpose: one request broke /pricing for every visitor.
 *
 * The invariant pinned here: EVERY page request carrying the RSC header passes
 * through middleware, which stamps `private, no-store` — a response the CDN
 * may not store. Document loads of public pages must NOT pay for middleware
 * (the /shop QR-menu hot path), so the rule is conditional on the header.
 *
 * The matcher is compiled with Next's own `getMiddlewareMatchers` and `has`
 * is evaluated with Next's own `matchHas`, so this checks what production
 * evaluates, not a re-implementation of it.
 */

import { describe, it, expect } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { NextRequest } from 'next/server';
import type { NextConfig } from 'next';
import { getMiddlewareMatchers } from 'next/dist/build/analysis/get-page-static-info';
import { matchHas } from 'next/dist/shared/lib/router/utils/prepare-destination';
import { middleware, config } from '../../src/middleware';

const matchers = getMiddlewareMatchers(config.matcher, {} as NextConfig);

/** Would Next.js invoke middleware for this pathname with these request headers? */
function runsMiddleware(pathname: string, headers: Record<string, string>): boolean {
    const req = { headers } as unknown as IncomingMessage;
    return matchers.some(
        (m) => new RegExp(m.regexp).test(pathname) && matchHas(req, {}, m.has, m.missing) !== false,
    );
}

const RSC = { rsc: '1' };

/** Public pages — static, ISR or dynamic — none of which is in the auth matcher. */
const PUBLIC_PAGES = [
    '/pricing',
    '/features',
    '/about',
    '/privacy',
    '/blog',
    '/blog/some-post',
    '/digital-menu',
    '/digital-menu/chennai',
    '/guide/digital-menu-setup',
    '/ta/guide/digital-menu-setup',
    '/auth/refresh',
    '/shop/anna-cafe',
    '/shop/preview',
];

describe('every RSC page request goes through middleware', () => {
    for (const path of PUBLIC_PAGES) {
        it(`RSC request to ${path} is handled by middleware`, () => {
            expect(runsMiddleware(path, RSC)).toBe(true);
        });
    }
});

describe('document loads of public pages do NOT pay for middleware', () => {
    for (const path of PUBLIC_PAGES) {
        it(`plain request to ${path} skips middleware`, () => {
            expect(runsMiddleware(path, {})).toBe(false);
        });
    }
});

describe('assets and API routes never run middleware', () => {
    for (const path of ['/_next/static/chunks/main.js', '/_next/image', '/api/cron/whatsapp', '/robots.txt', '/sitemap.xml', '/llms.txt', '/favicon.ico']) {
        it(`${path} (even with an RSC header)`, () => {
            expect(runsMiddleware(path, RSC)).toBe(false);
        });
    }
});

describe('the auth matcher is unchanged', () => {
    for (const path of ['/', '/login', '/signup', '/onboarding', '/manage/dashboard', '/manage/settings/profile']) {
        it(`document request to ${path} still runs middleware`, () => {
            expect(runsMiddleware(path, {})).toBe(true);
        });
    }
});

describe('middleware stamps RSC responses of public pages as unstorable', () => {
    for (const path of ['/pricing', '/auth/refresh?to=%2Fmanage%2Fdashboard', '/shop/anna-cafe']) {
        it(`${path}: passes through with private, no-store`, async () => {
            const req = new NextRequest(new URL(`http://localhost${path}`), {
                headers: { RSC: '1', cookie: 'sb-access-token=not-a-real-token-but-long-enough' },
            });
            const res = await middleware(req);
            expect(res.headers.get('location')).toBeNull();
            expect(res.headers.get('cache-control') ?? '').toMatch(/private.*no-store|no-store.*private/);
            expect(res.headers.get('cdn-cache-control') ?? '').toContain('no-store');
        });
    }
});
