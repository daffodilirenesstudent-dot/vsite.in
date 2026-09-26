import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Replaced and deleted photos were never removed from storage (QA 2026-09-26).
 * Measured live the same day: 226 files in `product-images`, 68 in use.
 *
 * Now, when an owner replaces a dish or banner photo, or deletes the dish or
 * banner, THAT photo (and its thumbnail) is removed — and nothing else.
 * Deleting is permanent, so every guard below errs towards keeping a file:
 *
 *   - only after the database save has succeeded (a failed save keeps the old
 *     photo on the menu, so the old photo must still exist)
 *   - only the owner's own uploads: `product-images`, never the shared
 *     `default-images` library every store's dishes point at
 *   - only inside THIS store's folder (`<siteId>/…` or `<slug>/…`)
 *   - only when no dish or banner, in any store, still uses that exact URL
 */

const SRC = join(__dirname, '..', '..', 'src');
const shipped = (p: string) =>
    readFileSync(join(SRC, p), 'utf8').replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/\/\/[^\n]*/g, '');

const BASE = 'https://wdnruubljlwrduxnvuhr.supabase.co/storage/v1/object/public';
const SITE = { siteId: '6f22a113-d5a9-4e43-b6e1-460f7427f72e', slug: 'chai-point' };
const OWN = `${BASE}/product-images/${SITE.siteId}/1758870000000.webp`;
const OWN_BANNER = `${BASE}/product-images/${SITE.slug}/banners/banner-1758870000000.jpg`;

// ─────────────────────────────────────────────────────────────────────────────

describe('which URL is this store\'s own upload', () => {
    it('a dish photo in the store-id folder', async () => {
        const { ownedUploadPath } = await import('@/lib/menu/photoCleanup');
        expect(ownedUploadPath(OWN, SITE)).toBe(`${SITE.siteId}/1758870000000.webp`);
    });

    it('a banner in the store-slug folder', async () => {
        const { ownedUploadPath } = await import('@/lib/menu/photoCleanup');
        expect(ownedUploadPath(OWN_BANNER, SITE)).toBe(`${SITE.slug}/banners/banner-1758870000000.jpg`);
    });

    it('never a library photo, which every store shares', async () => {
        const { ownedUploadPath } = await import('@/lib/menu/photoCleanup');
        expect(ownedUploadPath(`${BASE}/default-images/cafe-foods/masala-dosa.jpeg`, SITE)).toBeNull();
    });

    it('never another store\'s folder', async () => {
        const { ownedUploadPath } = await import('@/lib/menu/photoCleanup');
        expect(ownedUploadPath(`${BASE}/product-images/other-cafe/banners/banner-1.jpg`, SITE)).toBeNull();
        expect(ownedUploadPath(`${BASE}/product-images/0a1b2c3d-0000-4000-8000-000000000000/1.jpg`, SITE)).toBeNull();
    });

    it('never a path that climbs out of the folder, a thumbnail, or a non-storage URL', async () => {
        const { ownedUploadPath } = await import('@/lib/menu/photoCleanup');
        expect(ownedUploadPath(`${BASE}/product-images/${SITE.slug}/../other-cafe/a.jpg`, SITE)).toBeNull();
        expect(ownedUploadPath(`${BASE}/product-images/${SITE.slug}/%2e%2e/other-cafe/a.jpg`, SITE)).toBeNull();
        expect(ownedUploadPath(`${BASE}/product-images/${SITE.siteId}/1.thumb.jpg`, SITE)).toBeNull();
        expect(ownedUploadPath('https://example.com/a.jpg', SITE)).toBeNull();
        expect(ownedUploadPath('', SITE)).toBeNull();
        expect(ownedUploadPath(`${BASE}/product-images/${SITE.siteId}`, SITE)).toBeNull();
    });

    it('ignores a query string on the URL', async () => {
        const { ownedUploadPath } = await import('@/lib/menu/photoCleanup');
        expect(ownedUploadPath(`${OWN}?t=123`, SITE)).toBe(`${SITE.siteId}/1758870000000.webp`);
    });
});

describe('what to release after a save', () => {
    it('the old photo when it was replaced or removed', async () => {
        const { replacedPhotos } = await import('@/lib/menu/photoCleanup');
        expect(replacedPhotos(OWN, `${BASE}/product-images/${SITE.siteId}/2.webp`)).toEqual([OWN]);
        expect(replacedPhotos(OWN, null)).toEqual([OWN]);
    });

    it('nothing when the photo did not change, or there was none', async () => {
        const { replacedPhotos } = await import('@/lib/menu/photoCleanup');
        expect(replacedPhotos(OWN, OWN)).toEqual([]);
        expect(replacedPhotos(null, OWN)).toEqual([]);
        expect(replacedPhotos(undefined, null)).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The route
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}));

const mockFrom = vi.fn();
const mockRemove = vi.fn();
const bucketsTouched: string[] = [];
vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: {
        from: (...a: unknown[]) => mockFrom(...a),
        storage: { from: (bucket: string) => { bucketsTouched.push(bucket); return { remove: (...a: unknown[]) => mockRemove(...a) }; } },
    },
}));

const mockVerify = vi.fn();
vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
    verifyFirebaseToken: (...a: unknown[]) => mockVerify(...a),
}));

import { NextRequest } from 'next/server';

/** Per-table answers: `sites` is the ownership read; products/banners are the in-use check. */
let answers: Record<string, unknown>;
function qb(table: string) {
    const settled = () => ({ data: answers[table] ?? null, error: null });
    const chain: Record<string, unknown> = {
        single: vi.fn(async () => settled()),
        maybeSingle: vi.fn(async () => settled()),
        then: (f: (v: unknown) => unknown) => Promise.resolve(settled()).then(f),
    };
    for (const m of ['select', 'eq', 'like', 'limit']) chain[m] = vi.fn(() => chain);
    return chain;
}

const req = (body: unknown, token = 'Bearer t') =>
    new NextRequest(new Request('http://localhost/api/manage/media/release', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: token },
        body: JSON.stringify(body),
    }));

const call = async (body: unknown, token?: string) => {
    const { POST } = await import('@/app/api/manage/media/release/route');
    return POST(req(body, token));
};

beforeEach(() => {
    vi.clearAllMocks();
    bucketsTouched.length = 0;
    mockVerify.mockResolvedValue('user-1');
    mockRemove.mockResolvedValue({ data: [], error: null });
    answers = { sites: { id: SITE.siteId, slug: SITE.slug }, products: [], banners: [] };
    mockFrom.mockImplementation((t: string) => qb(t));
});

describe('POST /api/manage/media/release', () => {
    it('removes an unused photo of the owner\'s store, and its thumbnail', async () => {
        const res = await call({ siteId: SITE.siteId, urls: [OWN] });
        expect(res.status).toBe(200);
        expect(mockRemove).toHaveBeenCalledWith([`${SITE.siteId}/1758870000000.webp`, `${SITE.siteId}/1758870000000.thumb.jpg`]);
        expect(await res.json()).toMatchObject({ success: true, removed: 1, kept: 0 });
    });

    it('keeps a photo another dish still uses', async () => {
        answers.products = [{ id: 'p-2' }];
        const res = await call({ siteId: SITE.siteId, urls: [OWN] });
        expect(mockRemove).not.toHaveBeenCalled();
        expect(await res.json()).toMatchObject({ removed: 0, kept: 1 });
    });

    it('keeps a photo a banner still uses', async () => {
        answers.banners = [{ id: 'b-2' }];
        await call({ siteId: SITE.siteId, urls: [OWN_BANNER] });
        expect(mockRemove).not.toHaveBeenCalled();
    });

    it('never touches a library photo or another store\'s file', async () => {
        const res = await call({ siteId: SITE.siteId, urls: [`${BASE}/default-images/cafe-foods/tea.jpeg`, `${BASE}/product-images/other-cafe/x.jpg`] });
        expect(mockRemove).not.toHaveBeenCalled();
        expect(await res.json()).toMatchObject({ removed: 0, kept: 2 });
    });

    // Owner, 26 Sep: "don't delete the food library". The route may only ever
    // address the owners' upload bucket — the library bucket is out of reach.
    it('only ever deletes from the owners upload bucket, never the food library', async () => {
        await call({ siteId: SITE.siteId, urls: [OWN, OWN_BANNER, `${BASE}/default-images/cafe-foods/tea.jpeg`] });
        expect(bucketsTouched.length).toBeGreaterThan(0);
        expect(new Set(bucketsTouched)).toEqual(new Set(['product-images']));
        for (const [paths] of mockRemove.mock.calls as Array<[string[]]>) {
            for (const p of paths) expect(p).not.toMatch(/default-images|cafe-foods/);
        }
        const route = readFileSync(join(SRC, 'app/api/manage/media/release/route.ts'), 'utf8');
        expect(route).not.toMatch(/storage\.from\(['"]default-images/);
    });

    it('rejects a caller with no token, or a bad one', async () => {
        expect((await call({ siteId: SITE.siteId, urls: [OWN] }, '')).status).toBe(401);
        mockVerify.mockResolvedValue(null);
        expect((await call({ siteId: SITE.siteId, urls: [OWN] })).status).toBe(401);
        expect(mockRemove).not.toHaveBeenCalled();
    });

    it('refuses a store the caller does not own', async () => {
        answers.sites = null;
        expect((await call({ siteId: SITE.siteId, urls: [OWN] })).status).toBe(404);
        expect(mockRemove).not.toHaveBeenCalled();
    });

    it('validates the body and caps the batch', async () => {
        expect((await call({ siteId: SITE.siteId })).status).toBe(400);
        expect((await call({ siteId: SITE.siteId, urls: 'x' })).status).toBe(400);
        expect((await call({ urls: [OWN] })).status).toBe(400);
        expect((await call({ siteId: SITE.siteId, urls: Array.from({ length: 11 }, () => OWN) })).status).toBe(400);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The client helper and the screens that use it
// ─────────────────────────────────────────────────────────────────────────────

describe('the dashboard releases a photo only after the save succeeded', () => {
    it('the helper posts the URLs, skips empty ones and never throws', async () => {
        const { releaseMenuPhotos } = await import('@/lib/menu/releaseMenuPhotos');
        const calls: Array<[string, RequestInit | undefined]> = [];
        const ok = (async (u: string, i?: RequestInit) => { calls.push([u, i]); return new Response('{}'); }) as unknown as typeof fetch;
        await releaseMenuPhotos('site-1', [OWN, null, '', OWN], { getToken: async () => 'tok', fetchImpl: ok });
        expect(calls[0][0]).toBe('/api/manage/media/release');
        expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ siteId: 'site-1', urls: [OWN] });

        calls.length = 0;
        await releaseMenuPhotos('site-1', [null], { getToken: async () => 'tok', fetchImpl: ok });
        expect(calls).toEqual([]);

        const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        await expect(releaseMenuPhotos('site-1', [OWN], { getToken: async () => 'tok', fetchImpl: down })).resolves.toBeUndefined();
    });

    /** The release call must come after the handler's error return, never before. */
    const releasedAfterSuccess = (src: string, handler: string, errorGuard: RegExp) => {
        const body = src.slice(src.indexOf(handler));
        const end = body.indexOf('\n    };');
        const fn = body.slice(0, end);
        const guard = fn.search(errorGuard);
        const release = fn.indexOf('releaseMenuPhotos(');
        expect(guard, `${handler}: error guard not found`).toBeGreaterThan(-1);
        expect(release, `${handler}: no releaseMenuPhotos call`).toBeGreaterThan(-1);
        expect(release, `${handler}: released before the save succeeded`).toBeGreaterThan(guard);
    };

    it('inventory: deleting a dish releases its photo', () => {
        releasedAfterSuccess(shipped('app/manage/product-inventory/page.tsx'), 'const confirmDelete', /if \(error\) \{ toast\.error\('Failed to delete'\); return; \}/);
    });

    it('inventory: replacing a dish photo releases the old one', () => {
        const src = shipped('app/manage/product-inventory/page.tsx');
        releasedAfterSuccess(src, 'const handleSaveProduct', /if \(error\) \{ toast\.error\('Failed to update product'\)/);
        expect(src).toMatch(/replacedPhotos\(editingProduct\.image_url, imageUrl\)/);
    });

    it('banners: deleting and replacing release the photo', () => {
        const src = shipped('app/manage/banner-management/page.tsx');
        releasedAfterSuccess(src, 'const handleDelete', /if \(error\) \{ toast\.error\('Failed to delete banner'\); \}/);
        expect(src).toMatch(/replacedPhotos\(editingBanner\.image_url, imageUrl\)/);
    });

    it('You tab banners: deleting and replacing release the photo', () => {
        const src = shipped('app/manage/you/banners/page.tsx');
        releasedAfterSuccess(src, 'const confirmDelete', /if \(!ok\) \{ toast\.error/);
        expect(src).toMatch(/replacedPhotos\(/);
    });

    it('an upload whose save then failed is released too, not left behind', () => {
        expect(shipped('app/manage/product-inventory/page.tsx')).toMatch(/releaseMenuPhotos\(siteId, \[uploadedUrl\]\)/);
        expect(shipped('app/manage/banner-management/page.tsx')).toMatch(/releaseMenuPhotos\(siteId, \[uploadedUrl\]\)/);
    });
});
