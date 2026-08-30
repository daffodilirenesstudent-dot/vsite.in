/**
 * Middleware tests — import the actual middleware function and pass forged
 * NextRequest objects.
 *
 * The middleware verifies the Firebase ID token's RS256 SIGNATURE against
 * Google's JWKS, not just its `exp`. That is the security property, and it is
 * why these tests mock `jose`: a real signature would need Google's private
 * key, and hitting the live JWKS endpoint would make this suite depend on the
 * network. The mock reproduces the three outcomes the middleware branches on —
 * verified, expired, and bad signature — and nothing else.
 *
 * An earlier version of this file forged tokens with a literal `fakesig` and
 * asserted they were accepted. Once signature checking landed, those tokens
 * were correctly rejected and the tests failed. They were testing the absence
 * of the defence.
 */

import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const PROJECT_ID = 'vsite-test';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;

/** Signature segment that our mock verifier treats as genuine. */
const GOOD_SIG = 'signed-by-google';

// vi.mock is hoisted above every declaration in this file, so the error
// classes it closes over have to be hoisted with it.
const { MockJWTExpired, MockJWSInvalid } = vi.hoisted(() => ({
  MockJWTExpired: class extends Error {
    constructor() {
      super('"exp" claim timestamp check failed');
      this.name = 'JWTExpired';
    }
  },
  MockJWSInvalid: class extends Error {
    constructor() {
      super('signature verification failed');
      this.name = 'JWSSignatureVerificationFailed';
    }
  },
}));

vi.mock('jose', () => ({
  // The middleware builds this once at module load; it must not touch the network.
  createRemoteJWKSet: () => () => {
    throw new Error('JWKS should never be fetched in tests');
  },
  errors: { JWTExpired: MockJWTExpired },
  jwtVerify: async (token: string, _jwks: unknown, opts: { issuer: string; audience: string }) => {
    const [, body, sig] = token.split('.');

    // Signature first — this is the order jose itself uses, and it is what
    // makes an expired-but-genuine token distinguishable from a forgery.
    if (sig !== GOOD_SIG) throw new MockJWSInvalid();

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>;

    if (payload.iss !== opts.issuer || payload.aud !== opts.audience) throw new MockJWSInvalid();
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) throw new MockJWTExpired();

    return { payload, protectedHeader: { alg: 'RS256' } };
  },
}));

import { middleware } from '../../src/middleware';

// ── JWT helpers ────────────────────────────────────────────────────────────────

function makeJwt(payload: Record<string, unknown>, signature = GOOD_SIG): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      ...payload,
    }),
  ).toString('base64url');
  return `${header}.${body}.${signature}`;
}

function validToken(): string {
  return makeJwt({ sub: 'user-abc', exp: Math.floor(Date.now() / 1000) + 7200 });
}

/** Genuinely signed by Google, but past its `exp` — the refresh case. */
function expiredToken(): string {
  return makeJwt({ sub: 'user-abc', exp: Math.floor(Date.now() / 1000) - 60 });
}

/** Correct shape and claims, but not signed by Google — an attacker's token. */
function forgedToken(): string {
  return makeJwt({ sub: 'user-abc', exp: Math.floor(Date.now() / 1000) + 7200 }, 'fakesig');
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

  it('sends an expired token to the silent-refresh interstitial, not to /login', async () => {
    // The Firebase client almost always still holds a refreshable session in
    // IndexedDB, so bouncing an expired token to the login form made users
    // re-authenticate for no reason. /auth/refresh gets a fresh token and
    // resumes the original navigation.
    const req = makeRequest('/manage/dashboard', expiredToken());
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/auth/refresh');
    expect(location).toContain('to=%2Fmanage%2Fdashboard');
    expect(location).not.toContain('/login');
  });

  it('sends a FORGED token to /login, never to refresh', async () => {
    // The security property: a token that is well-formed and unexpired but
    // not signed by Google must not be treated as a session in any way.
    const req = makeRequest('/manage/dashboard', forgedToken());
    const res = await middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/login');
    expect(location).not.toContain('/auth/refresh');
  });

  it('does not treat a forged token as a session on an auth page either', async () => {
    const req = makeRequest('/login', forgedToken());
    const res = await middleware(req);
    expect(res.headers.get('location')).toBeNull();
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

  it('does NOT offer a refresh when there is no token at all', async () => {
    const req = makeRequest('/manage/dashboard');
    const res = await middleware(req);
    const location = res.headers.get('location') ?? '';
    // Nothing to refresh from — this is a logged-out visitor, not a stale one.
    expect(location).not.toContain('/auth/refresh');
    expect(location).toContain('/login');
  });

  it('stamps every response as uncacheable by a shared cache', () => {
    // Not a nicety: a CDN that caches one user's dashboard document and
    // replays it to the next visitor bypasses this middleware entirely.
    return Promise.all(
      ['/manage/dashboard', '/login', '/'].map(async (path) => {
        const res = await middleware(makeRequest(path, validToken()));
        expect(res.headers.get('Cache-Control')).toContain('no-store');
        expect(res.headers.get('CDN-Cache-Control')).toContain('no-store');
      }),
    );
  });
});
