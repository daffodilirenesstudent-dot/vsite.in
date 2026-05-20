import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/verifyFirebaseToken';
import { rateLimit, getClientIp } from '@/lib/rateLimit';

const COOKIE_NAME = 'sb-access-token';
const IS_PROD = process.env.NODE_ENV === 'production';

// In production, only accept auth-mutating requests from our own origin.
// Prevents cross-site form/fetch attackers from griefing users (auto-logout)
// or from setting forged (but signature-valid) tokens via third-party pages.
function isSameOrigin(request: NextRequest): boolean {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const host = request.headers.get('host');
    if (!host) return false;

    // Same-origin fetch: browser sends Origin header. Require it to match host.
    if (origin) {
        try {
            return new URL(origin).host === host;
        } catch {
            return false;
        }
    }
    // Same-origin navigations may omit Origin but include Referer — check that too.
    if (referer) {
        try {
            return new URL(referer).host === host;
        } catch {
            return false;
        }
    }
    // No Origin and no Referer on a mutating request is suspicious.
    return false;
}

// POST /api/auth/session — verify Firebase token server-side, set HttpOnly cookie
export async function POST(request: NextRequest) {
    if (IS_PROD && !isSameOrigin(request)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Rate limit by IP — 30 requests per minute is well above any honest user
    // (token refresh ~once an hour) but cheap enough to absorb on retry storms.
    const rl = rateLimit(`session:${getClientIp(request.headers)}`, { limit: 30, windowMs: 60_000 });
    if (!rl.allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } },
        );
    }

    try {
        const { token } = await request.json();

        if (!token || typeof token !== 'string' || token.length < 20) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
        }

        // Cryptographically verify before setting — never blindly trust client input
        const uid = await verifyFirebaseToken(token);
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Decode exp from JWT payload to match cookie lifetime to token expiry
        let maxAge = 3600;
        try {
            const parts = token.split('.');
            if (parts.length === 3) {
                const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                const padded = payloadB64 + '='.repeat((4 - payloadB64.length % 4) % 4);
                const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
                if (typeof payload.exp === 'number') {
                    maxAge = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
                }
            }
        } catch {
            // malformed JWT — fall back to 1h default
        }

        const response = NextResponse.json({ ok: true });
        response.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,           // not readable by JS — XSS cannot steal it
            secure: IS_PROD,          // HTTPS only in production
            sameSite: 'lax',          // allows GET navigations from external links (WhatsApp, etc.)
            path: '/',
            maxAge,
        });
        return response;
    } catch {
        return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }
}

// DELETE /api/auth/session — clear the auth cookie on sign-out
export async function DELETE(request: NextRequest) {
    if (IS_PROD && !isSameOrigin(request)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, '', {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
        expires: new Date(0),     // belt-and-suspenders for browsers that mishandle maxAge: 0 
    });
    return response;
}
