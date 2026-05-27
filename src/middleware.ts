import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';

// Routes that require authentication
const PROTECTED_PATHS = [
    '/manage/dashboard',
    '/manage/product-inventory',
    '/manage/banner-management',
    '/manage/transactions',
    '/manage/settings',
    '/manage/orders',
    '/manage/subscription',
    '/manage/qr',
    '/onboarding',
];

// Auth routes — logged-in users should be bounced to dashboard
const AUTH_PATHS = ['/login', '/signup'];

// jose caches the JWKS after the first fetch and handles key rotation automatically.
// This module-level singleton is reused across all middleware invocations.
const FIREBASE_JWKS = createRemoteJWKSet(
    new URL(
        'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
    )
);

type TokenState = 'valid' | 'expired' | 'invalid';

/**
 * Verifies a Firebase ID token and classifies the result so callers can
 * distinguish "needs refresh" (expired) from "not logged in" (invalid).
 * Valid signature + exp + iss + aud → 'valid'.
 * Valid signature + iss + aud but exp in the past → 'expired'.
 * Anything else (missing, forged, wrong issuer, malformed) → 'invalid'.
 */
async function classifyToken(token: string | undefined): Promise<TokenState> {
    if (!token || token.length < 20) return 'invalid';
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) return 'invalid';
    try {
        await jwtVerify(token, FIREBASE_JWKS, {
            issuer: `https://securetoken.google.com/${projectId}`,
            audience: projectId,
        });
        return 'valid';
    } catch (err) {
        if (err instanceof joseErrors.JWTExpired) return 'expired';
        return 'invalid';
    }
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const token = request.cookies.get('sb-access-token')?.value;
    const state = await classifyToken(token);

    // ── AUTH PAGES: bounce logged-in users to dashboard ─────────
    if (AUTH_PATHS.some((p) => pathname === p)) {
        if (state === 'valid') {
            return NextResponse.redirect(new URL('/manage/dashboard', request.url));
        }
        // Expired token — silently refresh instead of showing the login form.
        // Firebase client likely still has a refreshable session in IndexedDB.
        if (state === 'expired') {
            const refreshUrl = new URL('/auth/refresh', request.url);
            refreshUrl.searchParams.set('to', '/manage/dashboard');
            return NextResponse.redirect(refreshUrl);
        }
        return NextResponse.next();
    }

    // ── HOME PAGE: redirect logged-in users straight to dashboard ─
    if (pathname === '/') {
        if (state === 'valid') {
            return NextResponse.redirect(new URL('/manage/dashboard', request.url));
        }
        if (state === 'expired') {
            const refreshUrl = new URL('/auth/refresh', request.url);
            refreshUrl.searchParams.set('to', '/manage/dashboard');
            return NextResponse.redirect(refreshUrl);
        }
        return NextResponse.next();
    }

    // ── PROTECTED PAGES ──────────────────────────────────────────
    const isProtected = PROTECTED_PATHS.some(
        (p) => pathname === p || pathname.startsWith(p + '/')
    );

    if (!isProtected) return NextResponse.next();

    if (state === 'valid') return NextResponse.next();

    // Expired token → silent refresh interstitial. Firebase client likely
    // still holds a refreshable session in IndexedDB; the interstitial will
    // get a fresh token and resume navigation without the user seeing /login.
    if (state === 'expired') {
        const refreshUrl = new URL('/auth/refresh', request.url);
        if (pathname.startsWith('/')) {
            refreshUrl.searchParams.set('to', pathname);
        }
        return NextResponse.redirect(refreshUrl);
    }

    // No token or tampered token → login
    const loginUrl = new URL('/login', request.url);
    if (pathname.startsWith('/')) {
        loginUrl.searchParams.set('redirectTo', pathname);
    }
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: ['/', '/login', '/signup', '/onboarding', '/manage/:path*'],
};
