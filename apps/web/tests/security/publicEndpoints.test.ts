/**
 * The unauthenticated surface.
 *
 * Four routes are reachable with no credentials at all. Two of them are public
 * by design (the menu-scan beacon and the order-status poller), one was a debug
 * artefact, and all of them sit in front of a single basic-xxs instance with a
 * service-role database client behind it.
 *
 * Finding 8 (MEDIUM)  — track-menu-scan rate-limited on the LEFTMOST entry of
 *   X-Forwarded-For, which is whatever the client wrote there; a proxy appends,
 *   it does not replace. Rotating that header gave a fresh bucket per request.
 * Finding 10 (MEDIUM) — orders/[id]/status pads every response to 800ms to
 *   defeat order-id enumeration, with no rate limit, so each unauthenticated
 *   request pins a connection and a timer for most of a second.
 * Finding 11 (LOW)    — sentry-example-api existed only to throw.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('server-only', () => ({}));

type RlOpts = { limit: number; windowMs: number };
const rateLimit = vi.fn((_key: string, _opts: RlOpts) => ({ allowed: true, remaining: 9, retryAfterMs: 0 }));
// getClientIp is deliberately NOT mocked — its header precedence is half of what
// Finding 8 is about, so the tests below exercise the real one.
vi.mock('@/lib/platform/rateLimit', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/platform/rateLimit')>();
    return { ...actual, rateLimit: (key: string, opts: RlOpts) => rateLimit(key, opts) };
});

const inserted: unknown[] = [];
vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: {
        from: vi.fn(() => ({
            insert: vi.fn(async (row: unknown) => { inserted.push(row); return { data: null, error: null }; }),
        })),
        rpc: vi.fn(),
    },
}));
vi.mock('@/lib/notifications/orderEmail', () => ({
    verifyOrderToken: vi.fn(() => null),
    signOrderToken: vi.fn(() => 'tok'),
    sendEmailDirect: vi.fn(),
}));

import { getClientIp } from '@/lib/platform/rateLimit';
import { POST as trackScan } from '@/app/api/track-menu-scan/route';
import { GET as orderStatus } from '@/app/api/orders/[id]/status/route';

const WEB = join(__dirname, '..', '..');
const SITE = '00000000-0000-0000-0000-000000000aaa';

beforeEach(() => {
    inserted.length = 0;
    rateLimit.mockReset();
    rateLimit.mockReturnValue({ allowed: true, remaining: 9, retryAfterMs: 0 });
});

// =============================================================================
// Finding 8
// =============================================================================
describe('getClientIp — the shared client-IP helper', () => {
    const h = (o: Record<string, string>) => new Headers(o);

    it('prefers x-real-ip, which the ingress sets and overwrites', () => {
        expect(getClientIp(h({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }))).toBe('9.9.9.9');
    });

    it('takes the RIGHTMOST x-forwarded-for entry, not the client-written leftmost', () => {
        // A proxy APPENDS what it observed. The leftmost value is attacker text;
        // the rightmost is the only entry our own infrastructure wrote.
        expect(getClientIp(h({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 203.0.113.7' }))).toBe('203.0.113.7');
    });

    it('falls back to a constant when nothing is present', () => {
        expect(getClientIp(h({}))).toBe('unknown');
    });
});

describe('Finding 8: track-menu-scan cannot be unbucketed by a forged header', () => {
    it('does not key its limiter on the client-supplied leftmost XFF value', async () => {
        await trackScan(new NextRequest('https://vsite.in/api/track-menu-scan', {
            method: 'POST',
            headers: new Headers({
                'x-forwarded-for': '6.6.6.6, 203.0.113.7',
                'x-real-ip': '203.0.113.7',
                'content-type': 'application/json',
            }),
            body: JSON.stringify({ site_id: SITE, visitor_id: 'v1' }),
        }));

        const keys = rateLimit.mock.calls.map(c => String(c[0]));
        expect(keys.length).toBeGreaterThan(0);
        expect(keys.some(k => k.includes('6.6.6.6')), 'forged IP must not appear in any bucket key').toBe(false);
    });

    it('also buckets per site, so a distributed source cannot inflate one store', async () => {
        await trackScan(new NextRequest('https://vsite.in/api/track-menu-scan', {
            method: 'POST',
            headers: new Headers({ 'x-real-ip': '203.0.113.7', 'content-type': 'application/json' }),
            body: JSON.stringify({ site_id: SITE, visitor_id: 'v1' }),
        }));
        const keys = rateLimit.mock.calls.map(c => String(c[0]));
        expect(keys.some(k => k.includes(SITE)), 'expected a per-site bucket').toBe(true);
    });

    it('writes nothing when the limiter denies', async () => {
        rateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 1000 });
        const res = await trackScan(new NextRequest('https://vsite.in/api/track-menu-scan', {
            method: 'POST',
            headers: new Headers({ 'x-real-ip': '203.0.113.7', 'content-type': 'application/json' }),
            body: JSON.stringify({ site_id: SITE, visitor_id: 'v1' }),
        }));
        expect(res.status).toBe(429);
        expect(inserted).toHaveLength(0);
    });
});

// =============================================================================
// Finding 10
// =============================================================================
describe('Finding 10: orders/[id]/status is rate limited', () => {
    const ORDER = '11111111-1111-1111-1111-111111111111';
    const req = () => new NextRequest(`https://vsite.in/api/orders/${ORDER}/status`, {
        method: 'GET',
        headers: new Headers({ 'x-real-ip': '203.0.113.7' }),
    });

    it('applies a limiter', async () => {
        rateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 1000 });
        await orderStatus(req(), { params: { id: ORDER } });
        expect(rateLimit).toHaveBeenCalled();
    });

    it('returns 429 WITHOUT paying the 800ms timing pad', async () => {
        rateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 1000 });
        const t0 = Date.now();
        const res = await orderStatus(req(), { params: { id: ORDER } });
        const elapsed = Date.now() - t0;

        expect(res.status).toBe(429);
        // A throttled request that still sleeps 800ms holds the connection it was
        // throttled to release — the limiter would make the problem worse.
        expect(elapsed).toBeLessThan(300);
    });
});

// =============================================================================
// Finding 11
// =============================================================================
describe('Finding 11: the Sentry debug route is gone', () => {
    it('src/app/api/sentry-example-api/route.ts no longer exists', () => {
        expect(existsSync(join(WEB, 'src', 'app', 'api', 'sentry-example-api', 'route.ts'))).toBe(false);
    });
});
