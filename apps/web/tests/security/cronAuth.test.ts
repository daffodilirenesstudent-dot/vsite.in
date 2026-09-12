/**
 * Authentication on the /api/cron/* routes.
 *
 * These three routes are unauthenticated-by-URL and privileged-by-effect: they
 * send paid email, mutate subscription rows, and bulk-delete. The only thing in
 * front of them is CRON_SECRET.
 *
 * Two defects were found in the 2026-09 assessment, and both came from the three
 * routes each hand-rolling their own `isAuthorized`:
 *
 *   Finding 2 (HIGH)   — expiry-reminder accepted ANY request carrying an
 *     `x-vercel-cron` header. That was sound on Vercel, which strips the header
 *     at the edge. The app runs on DigitalOcean App Platform, which does not, so
 *     `curl -H 'x-vercel-cron: 1'` bypassed CRON_SECRET outright.
 *   Finding 5 (MEDIUM) — cleanup did `if (!secret) return true`, i.e. a missing
 *     env var disabled authentication on a route that bulk-deletes.
 *
 * The fix is one shared `authorizeCron` in @/lib/platform/cronAuth. These tests
 * pin its behaviour and then assert every route actually uses it, because the
 * original bug was three implementations drifting apart — not any one of them
 * being hard to write correctly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/platform/db/supabase-server', () => {
    const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => ({ data: [], error: null })),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        then: (r: (v: { data: unknown[]; error: null }) => void) => r({ data: [], error: null }),
    };
    return { supabaseServer: { from: vi.fn(() => chain), rpc: vi.fn(async () => ({ error: null })) } };
});
vi.mock('@/lib/notifications/email/planEmails', () => ({
    sendExpiryReminderEmail: vi.fn(async () => ({ ok: true })),
    sendPlanInvoiceEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/notifications/orderEmail', () => ({
    sendEmailDirect: vi.fn(async () => undefined),
    signOrderToken: vi.fn(() => 'tok'),
    verifyOrderToken: vi.fn(() => null),
}));

import { authorizeCron } from '@/lib/platform/cronAuth';
import { GET as cleanupGet, POST as cleanupPost } from '@/app/api/cron/cleanup/route';
import { GET as expiryGet, POST as expiryPost } from '@/app/api/cron/expiry-reminder/route';
import { GET as emailsGet, POST as emailsPost } from '@/app/api/cron/process-emails/route';

const SECRET = 'super-secret-cron-value';
const ORIGINAL = process.env.CRON_SECRET;

function cronReq(headers: Record<string, string> = {}, url = 'https://vsite.in/api/cron/x') {
    return new NextRequest(url, { method: 'GET', headers: new Headers(headers) });
}

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

beforeEach(() => { process.env.CRON_SECRET = SECRET; });
afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL;
});

describe('authorizeCron — the shared gate', () => {
    it('accepts the correct bearer secret', () => {
        expect(authorizeCron(cronReq({ authorization: `Bearer ${SECRET}` }))).toBe(true);
    });

    it('is case-insensitive about the header name only, not the scheme', () => {
        expect(authorizeCron(cronReq({ Authorization: `Bearer ${SECRET}` }))).toBe(true);
        expect(authorizeCron(cronReq({ authorization: `bearer ${SECRET}` }))).toBe(false);
    });

    it('rejects a wrong secret', () => {
        expect(authorizeCron(cronReq({ authorization: 'Bearer wrong-value-here' }))).toBe(false);
    });

    it('rejects a secret of a different length without throwing', () => {
        // crypto.timingSafeEqual throws on unequal buffer lengths — a naive
        // implementation turns a guess into a 500 and leaks the length.
        expect(() => authorizeCron(cronReq({ authorization: 'Bearer x' }))).not.toThrow();
        expect(authorizeCron(cronReq({ authorization: 'Bearer x' }))).toBe(false);
    });

    it('rejects a missing header', () => {
        expect(authorizeCron(cronReq())).toBe(false);
    });

    // Finding 2 — the header bypass.
    it('IGNORES x-vercel-cron: the app is not on Vercel and nothing strips it', () => {
        expect(authorizeCron(cronReq({ 'x-vercel-cron': '1' }))).toBe(false);
        expect(authorizeCron(cronReq({ 'x-vercel-cron': 'true' }))).toBe(false);
        expect(authorizeCron(cronReq({ 'x-vercel-cron': '1', authorization: 'Bearer nope' }))).toBe(false);
    });

    // Finding 5 — fail closed.
    it('FAILS CLOSED when CRON_SECRET is unset', () => {
        delete process.env.CRON_SECRET;
        expect(authorizeCron(cronReq())).toBe(false);
        expect(authorizeCron(cronReq({ authorization: 'Bearer anything' }))).toBe(false);
        expect(authorizeCron(cronReq({ 'x-vercel-cron': '1' }))).toBe(false);
    });

    it('fails closed on an empty CRON_SECRET too', () => {
        process.env.CRON_SECRET = '';
        expect(authorizeCron(cronReq({ authorization: 'Bearer ' }))).toBe(false);
    });
});

describe('every cron route is behind the shared gate', () => {
    const routes: Array<[string, (r: NextRequest) => Promise<Response>]> = [
        ['cleanup GET', cleanupGet],
        ['cleanup POST', cleanupPost],
        ['expiry-reminder GET', expiryGet],
        ['expiry-reminder POST', expiryPost],
        ['process-emails GET', emailsGet],
        ['process-emails POST', emailsPost],
    ];

    it.each(routes)('%s returns 401 with no credentials', async (_name, handler) => {
        expect((await handler(cronReq())).status).toBe(401);
    });

    it.each(routes)('%s returns 401 for a forged x-vercel-cron header', async (_name, handler) => {
        expect((await handler(cronReq({ 'x-vercel-cron': '1' }))).status).toBe(401);
    });

    it.each(routes)('%s returns 401 when CRON_SECRET is unset', async (_name, handler) => {
        delete process.env.CRON_SECRET;
        expect((await handler(cronReq())).status).toBe(401);
    });

    it.each(routes)('%s accepts the real secret', async (_name, handler) => {
        const res = await handler(cronReq({ authorization: `Bearer ${SECRET}` }));
        expect(res.status).not.toBe(401);
    });
});

/**
 * Found by curling the running dev server, not by any unit test: every job in
 * `.do/app.yaml` invokes its route with `curl -X POST`, and two of the three
 * routes exported only GET. They had been answering 405 to the scheduler since
 * the move to DigitalOcean — the email queue was never drained.
 *
 * A route that authenticates correctly and then 405s is still a broken route,
 * so the verb belongs under the same guard as the secret.
 */
describe('every cron route answers the verb .do/app.yaml actually sends', () => {
    const spec = readFileSync(join(process.cwd(), '.do', 'app.yaml'), 'utf8');

    it('app.yaml still POSTs (if this changes, the exports below can change too)', () => {
        expect(spec).toMatch(/curl[^\n]*-X POST/);
    });

    it.each([
        ['cleanup', cleanupPost],
        ['expiry-reminder', expiryPost],
        ['process-emails', emailsPost],
    ] as Array<[string, (r: NextRequest) => Promise<Response>]>)(
        '%s exports a POST handler that is not a 405',
        async (_name, handler) => {
            expect(handler, 'route must export POST').toBeTypeOf('function');
            const res = await handler(cronReq({ authorization: `Bearer ${SECRET}` }));
            expect(res.status).not.toBe(405);
            expect(res.status).not.toBe(401);
        },
    );
});

describe('no route hand-rolls its own cron check any more', () => {
    const files = [
        'app/api/cron/cleanup/route.ts',
        'app/api/cron/expiry-reminder/route.ts',
        'app/api/cron/process-emails/route.ts',
    ];

    it.each(files)('%s imports authorizeCron', (f) => {
        expect(src(f)).toMatch(/from '@\/lib\/platform\/cronAuth'/);
    });

    // Asserts the header is never READ, not that the string never appears —
    // each route carries a comment explaining why the bypass was removed, and
    // that comment is the thing most likely to stop someone reinstating it.
    it.each(files)('%s does not read the x-vercel-cron header', (f) => {
        expect(src(f).toLowerCase()).not.toMatch(/get\(\s*['"`]x-vercel-cron/);
    });

    it.each(files)('%s does not compare the secret inline', (f) => {
        // `=== \`Bearer ${secret}\`` is the shape that drifted three ways.
        expect(src(f)).not.toMatch(/===\s*`Bearer/);
    });
});

// Finding 2 (disclosure half) and Finding 14.
describe('cron routes do not leak internals to a caller', () => {
    it('expiry-reminder does not return subscriber counts or site ids', async () => {
        const res = await expiryGet(cronReq({ authorization: `Bearer ${SECRET}` }));
        const body = await res.json();
        // Anyone who ever obtains the secret — or any future auth slip — should
        // not also get a live read on how many stores are about to churn.
        expect(body).not.toHaveProperty('scanned');
        expect(body).not.toHaveProperty('sent');
        expect(body).not.toHaveProperty('failures');
        expect(body.ok).toBe(true);
    });

    it('cleanup does not return the raw Postgres error message', () => {
        expect(src('app/api/cron/cleanup/route.ts')).not.toMatch(/detail:\s*error\.message/);
    });
});
