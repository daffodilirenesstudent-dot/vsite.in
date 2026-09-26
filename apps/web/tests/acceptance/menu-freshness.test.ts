import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * QA 2026-09-26, the medium findings about what the owner and the diner see.
 *
 *   1. STALE MENU. The shop page sets `revalidate = 10`. It reads searchParams,
 *      so the page itself renders per request — but Next's Data Cache still
 *      holds the Supabase reads for 10 s and serves the old copy once, so the
 *      first diner after an edit saw the menu from before it. Owner edits are
 *      client-side Supabase writes, so nothing told Next the data changed.
 *      Fix: after an edit the dashboard asks the server to revalidatePath the
 *      store's /shop/<slug>; server routes that edit the store do it inline.
 *   2. OWNER VISITS COUNTED. "View menu" (and the owner scanning their own QR)
 *      landed in Scans and Visitors. The dashboard marks this device as the
 *      owner's; the menu skips the scan ping there.
 *   3. PRINTER POLL. The dashboard polled the kitchen printer bridge on
 *      127.0.0.1:7878 every 30 s while ordering — the only thing it prints
 *      for — is frozen.
 *   4. STORE STATUS. One tap took the whole menu offline, unconfirmed.
 */

const SRC = join(__dirname, '..', '..', 'src');
const shipped = (p: string) =>
    readFileSync(join(SRC, p), 'utf8').replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/\/\/[^\n]*/g, '');

vi.mock('server-only', () => ({}));

const mockFrom = vi.fn();
vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: { from: (...a: unknown[]) => mockFrom(...a) },
}));

const mockVerify = vi.fn();
vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
    verifyFirebaseToken: (...a: unknown[]) => mockVerify(...a),
}));

const mockRevalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => mockRevalidatePath(...a) }));

import { NextRequest } from 'next/server';

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

const refreshReq = (body: unknown, token = 'Bearer t') =>
    new NextRequest(new Request('http://localhost/api/manage/menu-refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: token },
        body: JSON.stringify(body),
    }));

const callRefresh = async (body: unknown, token?: string) => {
    const { POST } = await import('@/app/api/manage/menu-refresh/route');
    return POST(refreshReq(body, token));
};

beforeEach(() => {
    vi.clearAllMocks();
    mockVerify.mockResolvedValue('user-1');
    mockFrom.mockImplementation(() => qb({ data: { id: 'site-1', slug: 'chai-point' } }));
});

// ─────────────────────────────────────────────────────────────────────────────

describe('1. an owner edit reaches the next diner, not the one after', () => {
    it('refreshes the store\'s public menu page', async () => {
        const res = await callRefresh({ siteId: 'site-1' });
        expect(res.status).toBe(200);
        expect(mockRevalidatePath).toHaveBeenCalledWith('/shop/chai-point');
    });

    it('rejects a caller with no token', async () => {
        expect((await callRefresh({ siteId: 'site-1' }, '')).status).toBe(401);
        expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('rejects a token that does not verify', async () => {
        mockVerify.mockResolvedValue(null);
        expect((await callRefresh({ siteId: 'site-1' })).status).toBe(401);
    });

    it('refuses a store the caller does not own', async () => {
        mockFrom.mockImplementation(() => qb({ data: null }));
        expect((await callRefresh({ siteId: 'site-2' })).status).toBe(404);
        expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('requires a siteId', async () => {
        expect((await callRefresh({})).status).toBe(400);
    });

    it('the client helper posts the site and never throws', async () => {
        const { refreshPublicMenu } = await import('@/lib/menu/refreshPublicMenu');
        const calls: Array<[string, RequestInit | undefined]> = [];
        const ok = (async (u: string, i?: RequestInit) => { calls.push([u, i]); return new Response('{}'); }) as unknown as typeof fetch;
        await refreshPublicMenu('site-1', { getToken: async () => 'tok', fetchImpl: ok });
        expect(calls[0][0]).toBe('/api/manage/menu-refresh');
        expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ siteId: 'site-1' });
        expect(new Headers(calls[0][1]?.headers).get('Authorization')).toBe('Bearer tok');

        const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        await expect(refreshPublicMenu('site-1', { getToken: async () => 'tok', fetchImpl: down })).resolves.toBeUndefined();
        await expect(refreshPublicMenu('site-1', { getToken: async () => undefined, fetchImpl: ok })).resolves.toBeUndefined();
    });

    it.each([
        ['app/manage/product-inventory/page.tsx', 4],   // save, delete, sold-out toggle, category delete
        ['app/manage/banner-management/page.tsx', 4],   // save, delete, visibility, reorder
        ['app/manage/settings/page.tsx', 1],            // store details (name, hours, location)
    ])('%s refreshes the menu after its edits', (page, atLeast) => {
        const hits = shipped(page).match(/refreshPublicMenu\(/g) ?? [];
        expect(hits.length).toBeGreaterThanOrEqual(atLeast);
    });

    it.each([
        'app/api/sites/toggle-live/route.ts',
        'app/api/manage/sites/[siteId]/menu-theme/route.ts',
    ])('%s refreshes the menu itself', (route) => {
        expect(shipped(route)).toMatch(/revalidatePath\(/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

function memoryStorage(): Storage {
    const m = new Map<string, string>();
    return {
        get length() { return m.size; },
        clear: () => m.clear(),
        getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
        key: (i: number) => Array.from(m.keys())[i] ?? null,
        removeItem: (k: string) => { m.delete(k); },
        setItem: (k: string, v: string) => { m.set(k, String(v)); },
    };
}

describe('2. the owner\'s own visits are not counted as scans', () => {
    it('a device that opened the dashboard is the owner\'s for their stores', async () => {
        const { markOwnerDevice, isOwnerDevice } = await import('@/lib/menu/ownerDevice');
        const s = memoryStorage();
        markOwnerDevice(s, ['site-1', 'site-2']);
        expect(isOwnerDevice(s, 'site-1')).toBe(true);
        expect(isOwnerDevice(s, 'site-2')).toBe(true);
        expect(isOwnerDevice(s, 'someone-elses-store')).toBe(false);
    });

    it('a diner\'s phone is not an owner device', async () => {
        const { isOwnerDevice } = await import('@/lib/menu/ownerDevice');
        expect(isOwnerDevice(memoryStorage(), 'site-1')).toBe(false);
    });

    it('survives unreadable storage: counts the scan rather than crash the menu', async () => {
        const { isOwnerDevice, markOwnerDevice } = await import('@/lib/menu/ownerDevice');
        const broken = memoryStorage();
        broken.setItem('vsite_owner_sites', '{not json');
        expect(isOwnerDevice(broken, 'site-1')).toBe(false);
        const throwing = { ...memoryStorage(), getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as Storage;
        expect(isOwnerDevice(throwing, 'site-1')).toBe(false);
        expect(() => markOwnerDevice(throwing, ['site-1'])).not.toThrow();
    });

    it('the menu checks before pinging the scan tracker', () => {
        const client = shipped('app/shop/[slug]/ShopPageClient.tsx');
        const check = client.indexOf('isOwnerDevice(');
        const ping = client.indexOf("fetch('/api/track-menu-scan'");
        expect(check).toBeGreaterThan(-1);
        expect(ping).toBeGreaterThan(check);
    });

    it('the dashboard marks the device with the owner\'s stores', () => {
        expect(shipped('components/SiteContext.tsx')).toMatch(/markOwnerDevice\(/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('3. no printer polling while ordering is frozen', () => {
    it('the bridge poll is gated on ORDERING_FROZEN before it fetches', () => {
        const ctx = shipped('components/PrinterStatusContext.tsx');
        expect(ctx).toMatch(/import\s*\{[^}]*ORDERING_FROZEN[^}]*\}\s*from\s*'@\/lib\/platform\/productFlags'/);
        const effect = ctx.slice(ctx.indexOf('useEffect('), ctx.indexOf('fetchStatus();'));
        expect(effect).toMatch(/if\s*\(\s*ORDERING_FROZEN\s*\)\s*return/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('4. taking the menu offline is confirmed', () => {
    const dash = () => shipped('app/manage/dashboard/page.tsx');

    it('asks before closing, not before opening', () => {
        const d = dash();
        expect(d).toMatch(/<ConfirmDialog\b/);
        const handler = d.slice(d.indexOf('const handleToggleStore'), d.indexOf('const setStoreLive'));
        expect(handler, 'going offline must open the confirmation').toMatch(/if\s*\(\s*storeOpen\s*\)\s*\{\s*setConfirmOffline\(true\)/);
    });

    it('the switch says what it is', () => {
        const d = dash();
        expect(d).toMatch(/role="switch"[\s\S]{0,80}aria-checked=\{storeOpen\}/);
        expect(d).toMatch(/aria-label="Store status: menu (online|visible) to customers"/);
    });

    it('the confirmation is a real dialog that Escape dismisses', () => {
        const c = shipped('components/manage/ConfirmDialog.tsx');
        expect(c).toMatch(/role="alertdialog"/);
        expect(c).toMatch(/aria-modal="true"/);
        expect(c).toMatch(/'Escape'/);
    });
});
