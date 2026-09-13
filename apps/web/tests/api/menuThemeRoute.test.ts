import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PATCH /api/manage/sites/[siteId]/menu-theme
 *
 * Three things this route must never get wrong:
 *
 *   1. It must not touch menu data. A design is config on the site row. If a
 *      theme change could write a product, change the slug or rotate qr_secret,
 *      then every printed standee on twenty tables is one settings tap away
 *      from resolving to nothing.
 *   2. It must not accept an unvalidated colour. The value lands in a style
 *      block built with dangerouslySetInnerHTML.
 *   3. It must write the audit row. The October decision on whether to build
 *      more designs is computed from those rows and nothing else.
 */

vi.mock('server-only', () => ({}));

const mockFrom = vi.fn();
vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: { from: (...a: unknown[]) => mockFrom(...a) },
}));

const mockVerify = vi.fn();
vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
    verifyFirebaseToken: (...a: unknown[]) => mockVerify(...a),
}));

const mockAudit = vi.fn();
vi.mock('@/lib/platform/auditLog', () => ({ audit: (...a: unknown[]) => mockAudit(...a) }));

import { NextRequest } from 'next/server';

/** Chainable query-builder stand-in, after tests/api/routes.test.ts. */
function qb(result: { data?: unknown; error?: unknown } = {}) {
    const settled = { data: result.data ?? null, error: result.error ?? null };
    const chain: Record<string, unknown> = {
        single: vi.fn().mockResolvedValue(settled),
        maybeSingle: vi.fn().mockResolvedValue(settled),
        then: (f: (v: typeof settled) => unknown) => Promise.resolve(settled).then(f),
    };
    for (const m of ['select', 'eq', 'update', 'insert', 'delete', 'order', 'limit']) {
        chain[m] = vi.fn(() => chain);
    }
    return chain as never;
}

const PREV = { menu_theme: 'classic', menu_font: 'classic', primary_color: '#EF59A1' };

const req = (body: unknown, token = 'Bearer t') =>
    new NextRequest(
        new Request('http://localhost/api/manage/sites/site-1/menu-theme', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', authorization: token },
            body: JSON.stringify(body),
        }),
    );

const call = async (body: unknown, token?: string) => {
    const { PATCH } = await import('@/app/api/manage/sites/[siteId]/menu-theme/route');
    return PATCH(req(body, token), { params: { siteId: 'site-1' } });
};

beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockResolvedValue('user-1');
    mockFrom.mockImplementation(() => qb({ data: PREV }));
});

describe('authentication and ownership', () => {
    it('rejects a caller with no bearer token', async () => {
        const res = await call({ menu_theme: 'cafe' }, '');
        expect(res.status).toBe(401);
    });

    it('rejects a token that does not verify', async () => {
        mockVerify.mockResolvedValue(null);
        expect((await call({ menu_theme: 'cafe' })).status).toBe(401);
    });

    it('refuses a site the caller does not own', async () => {
        // The read is scoped by user_id, so someone else's site reads as absent
        // — an attacker learns nothing from the difference.
        mockFrom.mockImplementation(() => qb({ data: null }));
        const res = await call({ menu_theme: 'cafe' });
        expect(res.status).toBe(403);
        expect(mockAudit).not.toHaveBeenCalled();
    });
});

describe('validation', () => {
    it('rejects an unknown design', async () => {
        const res = await call({ menu_theme: 'festival-pongal' });
        expect(res.status).toBe(400);
    });

    it('rejects an unknown font pairing', async () => {
        expect((await call({ menu_font: 'comic' })).status).toBe(400);
    });

    it('rejects an empty patch rather than writing nothing', async () => {
        expect((await call({})).status).toBe(400);
    });

    it('survives a body that is not an object', async () => {
        for (const body of [null, 42, 'x', []]) {
            const res = await call(body);
            expect(res.status, String(body)).toBeGreaterThanOrEqual(400);
            expect(res.status, String(body)).toBeLessThan(500);
        }
    });

    it('refuses a colour that would break out of the style block', async () => {
        for (const attack of [
            'red; } body { display: none } .x {',
            '</style><script>alert(1)</script>',
            '#FFF',
            'url(javascript:alert(1))',
        ]) {
            const res = await call({ primary_color: attack });
            expect(res.status, attack).toBe(400);
        }
        expect(mockAudit).not.toHaveBeenCalled();
    });
});

describe('a successful change', () => {
    it('accepts a valid design and reports it back', async () => {
        const res = await call({ menu_theme: 'premium', primary_color: '#1F3A5F' });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.menu_theme).toBe('premium');
        expect(body.primary_color).toBe('#1F3A5F');
    });

    it('accepts a partial patch — the panel saves one control at a time', async () => {
        expect((await call({ menu_font: 'warm' })).status).toBe(200);
    });

    it('writes the audit row the October decision is computed from', async () => {
        await call({ menu_theme: 'cafe' });
        expect(mockAudit).toHaveBeenCalledTimes(1);
        const entry = mockAudit.mock.calls[0][0];
        expect(entry.action).toBe('menu_theme_change');
        expect(entry.siteId).toBe('site-1');
        expect(entry.userId).toBe('user-1');
        // `source` is what separates "changed it later" from "picked it at
        // signup" — the whole metric rests on being able to tell them apart.
        expect(entry.details.source).toBe('settings');
        expect(entry.details.before).toEqual(PREV);
        expect(entry.details.after).toEqual({ menu_theme: 'cafe' });
    });

    it('touches only the sites table', async () => {
        await call({ menu_theme: 'cafe' });
        const tables = mockFrom.mock.calls.map(c => c[0]);
        expect(tables.every(t => t === 'sites')).toBe(true);
        expect(tables).not.toContain('products');
    });

    it('never writes the slug or the QR secret', async () => {
        const updates: Record<string, unknown>[] = [];
        mockFrom.mockImplementation(() => {
            const chain = qb({ data: PREV }) as unknown as Record<string, unknown>;
            chain.update = vi.fn((patch: Record<string, unknown>) => {
                updates.push(patch);
                return chain;
            });
            return chain as never;
        });
        await call({ menu_theme: 'premium', menu_font: 'sharp', primary_color: '#1F3A5F' });
        expect(updates).toHaveLength(1);
        const keys = Object.keys(updates[0]);
        expect(keys.sort()).toEqual(['menu_font', 'menu_theme', 'primary_color']);
        expect(keys).not.toContain('slug');
        expect(keys).not.toContain('qr_secret');
    });
});

describe('failure', () => {
    it('reports a write failure as a 500 and logs nothing to the audit trail', async () => {
        mockFrom.mockImplementation(() => {
            const chain = qb({ data: PREV }) as unknown as Record<string, unknown>;
            chain.update = vi.fn(() => qb({ error: { message: 'boom' } }));
            return chain as never;
        });
        const res = await call({ menu_theme: 'cafe' });
        expect(res.status).toBe(500);
        expect(mockAudit).not.toHaveBeenCalled();
    });
});
