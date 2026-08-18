/**
 * Regression test for the production CDN cache-poisoning incident.
 *
 * Symptom: https://vsite.in/manage/dashboard rendered the raw RSC flight
 * payload ("2:I[9107,[],\"ClientPageRoot\"]...") as plain text instead of the
 * dashboard.
 *
 * Cause: Next.js serves two different bodies from one URL (HTML for a document
 * navigation, text/x-component for an RSC navigation) and signals this with
 * `Vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch`. Cloudflare ignores
 * `Vary` on everything except `Accept-Encoding`, so its cache key was URL-only
 * and whichever variant landed first was served to everyone — for the
 * `s-maxage=31536000` that Next.js emits on statically prerendered routes.
 *
 * Because a cache HIT is served without ever reaching the origin, the auth
 * gate in middleware was bypassed too: an anonymous GET of /manage/dashboard
 * returned 200 instead of a 307 to /login.
 *
 * The fix: every response middleware returns must forbid *shared* caching, so
 * no CDN in front of the origin can ever hold a copy of a path whose correct
 * response depends on the request's cookies or RSC headers.
 *
 * No network calls are made — an absent/short token is classified locally.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../src/middleware';

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(`http://localhost${pathname}`), { method: 'GET' });
}

/** Paths in the middleware matcher — every one of these varies by cookie. */
const MATCHED_PATHS = [
  '/',
  '/login',
  '/signup',
  '/onboarding',
  '/manage/dashboard',
  '/manage/product-inventory',
  '/manage/banner-management',
  '/manage/transactions',
  '/manage/settings',
  '/manage/settings/profile',
  '/manage/orders',
  '/manage/subscription',
  '/manage/qr',
];

describe('Middleware — CDN cache safety', () => {
  for (const path of MATCHED_PATHS) {
    it(`forbids shared-cache storage of ${path}`, async () => {
      const res = await middleware(makeRequest(path));
      const cacheControl = res.headers.get('cache-control') ?? '';

      // `private` bars shared caches; `no-store` bars storing it at all.
      expect(cacheControl).toContain('private');
      expect(cacheControl).toContain('no-store');
    });
  }

  it('sets the header on redirect responses too (the auth-gate path)', async () => {
    // Anonymous hit on a protected page → 307 to /login. This is the exact
    // response Cloudflare must never cache, because caching it would serve a
    // login redirect to authenticated users (and vice-versa).
    const res = await middleware(makeRequest('/manage/dashboard'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
    expect(res.headers.get('cache-control') ?? '').toContain('no-store');
  });

  it('sets the header on pass-through responses too', async () => {
    // Anonymous hit on /login → next(). Still must not be shared-cached: a
    // cached copy bypasses middleware, so a logged-in user would see the
    // login form instead of being bounced to the dashboard.
    const res = await middleware(makeRequest('/login'));

    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('cache-control') ?? '').toContain('no-store');
  });
});
