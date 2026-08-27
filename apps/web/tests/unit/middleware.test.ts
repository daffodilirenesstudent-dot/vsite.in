/**
 * Middleware tests — import the actual middleware function
 * and pass forged NextRequest objects (with crafted JWTs).
 *
 * No network calls are made — the middleware only checks `exp` locally.
 */

import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../../src/middleware';

// ── JWT helpers ────────────────────────────────────────────────────────────────

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

function validToken(): string {
  return makeJwt({ sub: 'user-abc', exp: Math.floor(Date.now() / 1000) + 7200 });
}

function expiredToken(): string {
  return makeJwt({ sub: 'user-abc', exp: Math.floor(Date.now() / 1000) - 60 });
}

// ── Request factory ────────────────────────────────────────────────────────────

function makeRequest(pathname: string, token?: string): NextRequest {
  const url = `http://localhost${pathname}`;
  const req = new NextRequest(new URL(url), { method: 'GET' });
  if (token) {
    // NextRequest cookies are read-only from the constructor; use headers trick
    const reqWithCookie = new NextRequest(new URL(url), {
      method: 'GET',
      headers: { cookie: `sb-access-token=${token}` },
    });
    return reqWithCookie;
  }
  return req;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Middleware — public routes pass through without auth', () => {
  it('/shop/my-cafe passes through (no cookie required)', async () => {
    const req = makeRequest('/shop/my-cafe');
    const res = await middleware(req);
    // Not in the middleware matcher, so next() is returned (status 200 from next)
    expect(res.status).not.toBe(302);
  });
});

describe('Middleware — home page (/)', () => {
  it('redirects logged-in user from / to /manage/dashboard', async () => {
    const req = makeRequest('/', validToken());
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/manage/dashboard');
  });

  it('lets anonymous user through on /', async () => {
    const req = makeRequest('/');
    const res = await middleware(req);
    // NextResponse.next() returns a response without a Location header
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('Middleware — auth pages (/login, /signup)', () => {
  it('redirects logged-in user from /login to /manage/dashboard', async () => {
    const req = makeRequest('/login', validToken());
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/manage/dashboard');
  });

  it('lets anonymous user through on /login', async () => {
    const req = makeRequest('/login');
    const res = await middleware(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects logged-in user from /signup to /manage/dashboard', async () => {
    const req = makeRequest('/signup', validToken());
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/manage/dashboard');
  });
});

describe('Middleware — protected routes require auth', () => {
  const protectedPaths = [
    '/manage/dashboard',
    '/manage/product-inventory',
    '/manage/banner-management',
    '/manage/transactions',
    '/manage/settings',
    '/onboarding',
  ];

  for (const path of protectedPaths) {
    it(`redirects to /login when no cookie is set for ${path}`, async () => {
      const req = makeRequest(path);
      const res = await middleware(req);
      expect(res.status).toBe(307);
      const location = res.headers.get('location') ?? '';
      expect(location).toContain('/login');
    });
  }

  it('sets redirectTo query param on redirect', async () => {
    const req = makeRequest('/manage/dashboard');
    const res = await middleware(req);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('redirectTo=%2Fmanage%2Fdashboard');
  });

  it('sets expired=true when token exists but is expired', async () => {
    const req = makeRequest('/manage/dashboard', expiredToken());
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('expired=true');
  });

  it('allows access with a valid token', async () => {
    const req = makeRequest('/manage/dashboard', validToken());
    const res = await middleware(req);
    // Should NOT redirect
    expect(res.headers.get('location')).toBeNull();
  });

  it('allows access to sub-paths of protected routes with a valid token', async () => {
    const req = makeRequest('/manage/settings/profile', validToken());
    const res = await middleware(req);
    expect(res.headers.get('location')).toBeNull();
  });

  it('does NOT set expired=true when no token at all', async () => {
    const req = makeRequest('/manage/dashboard');
    const res = await middleware(req);
    const location = res.headers.get('location') ?? '';
    // No token means no expired flag
    expect(location).not.toContain('expired=true');
  });
});
