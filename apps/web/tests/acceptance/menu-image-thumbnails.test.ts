import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Menu image thumbnails + long browser caching (Supabase egress).
 *
 * Measured on production (2026-09-24): a menu has ~36 photos averaging 186 KB,
 * and the list shows each one at 120 px while downloading the full file. Owner
 * uploads average 466 KB. Supabase free egress is 5 GB/month.
 *
 * Decisions, locked here:
 *
 *   1. THE ORIGINAL IS NEVER TOUCHED. A thumbnail is an extra file next to it
 *      (`<name>.thumb.jpg`). The original is uploaded byte-for-byte as today,
 *      and large views (the dish hero, banners) keep using it.
 *   2. SMALL SPOTS USE THE THUMBNAIL. The list card and the detail-sheet
 *      header show the thumbnail; if it is missing (old upload, backfill not
 *      run) the image falls back to the original, so nothing ever breaks.
 *   3. LONG CACHE. Uploads are sent with a one-year Cache-Control. Every upload
 *      path writes a unique filename, so a replaced photo is a new URL and a
 *      long cache can never show a stale dish.
 *   4. FLAG DEFAULTS OFF. `NEXT_PUBLIC_MENU_IMAGE_THUMBS` unset means exactly
 *      today's behaviour for owners and diners.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Match on shipped code, not on comments that name the old behaviour. */
const shipped = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const IMAGES = 'lib/menu/menuImages.ts';
const CARD = 'components/templates/MenuItemCard.tsx';
const TEMPLATE = 'components/templates/QRMenuTemplate.tsx';
const UPLOAD_SITES = [
    'app/manage/product-inventory/page.tsx',
    'app/manage/banner-management/page.tsx',
    'components/manage/ShopCard.tsx',
];

const BASE = 'https://wdnruubljlwrduxnvuhr.supabase.co/storage/v1/object/public';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

// ─────────────────────────────────────────────────────────────────────────────
// Flag
// ─────────────────────────────────────────────────────────────────────────────

describe('flag', () => {
    it('is OFF when the env var is missing', async () => {
        vi.stubEnv('NEXT_PUBLIC_MENU_IMAGE_THUMBS', '');
        const m = await import('@/lib/menu/menuImages');
        expect(m.MENU_IMAGE_THUMBS).toBe(false);
    });

    it('is ON only for the exact value "true"', async () => {
        vi.stubEnv('NEXT_PUBLIC_MENU_IMAGE_THUMBS', 'true');
        const m = await import('@/lib/menu/menuImages');
        expect(m.MENU_IMAGE_THUMBS).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Thumbnail URL
// ─────────────────────────────────────────────────────────────────────────────

describe('thumbUrlFor', () => {
    it('puts the thumbnail next to an owner upload', async () => {
        const { thumbUrlFor } = await import('@/lib/menu/menuImages');
        expect(thumbUrlFor(`${BASE}/product-images/site-1/1727000000000.png`))
            .toBe(`${BASE}/product-images/site-1/1727000000000.thumb.jpg`);
    });

    it('puts the thumbnail next to a library image', async () => {
        const { thumbUrlFor } = await import('@/lib/menu/menuImages');
        expect(thumbUrlFor(`${BASE}/default-images/cafe-foods/chicken-biryani-v5.jpeg`))
            .toBe(`${BASE}/default-images/cafe-foods/chicken-biryani-v5.thumb.jpg`);
    });

    it('handles a file with no extension', async () => {
        const { thumbUrlFor } = await import('@/lib/menu/menuImages');
        expect(thumbUrlFor(`${BASE}/product-images/shop/prod-0`))
            .toBe(`${BASE}/product-images/shop/prod-0.thumb.jpg`);
    });

    it('does not derive a thumbnail from a thumbnail', async () => {
        const { thumbUrlFor } = await import('@/lib/menu/menuImages');
        expect(thumbUrlFor(`${BASE}/product-images/s/a.thumb.jpg`)).toBeNull();
    });

    it('leaves anything that is not our public storage alone', async () => {
        const { thumbUrlFor } = await import('@/lib/menu/menuImages');
        expect(thumbUrlFor('https://example.com/dish.jpg')).toBeNull();
        expect(thumbUrlFor('blob:https://vsite.in/1234')).toBeNull();
        expect(thumbUrlFor('data:image/png;base64,AAAA')).toBeNull();
        expect(thumbUrlFor(`${BASE}/other-bucket/x.jpg`)).toBeNull();
        expect(thumbUrlFor('')).toBeNull();
        expect(thumbUrlFor(null)).toBeNull();
    });
});

describe('menuThumbSrc', () => {
    const url = `${BASE}/product-images/s/a.jpg`;

    it('returns the original when the flag is off (backward compatibility)', async () => {
        const { menuThumbSrc } = await import('@/lib/menu/menuImages');
        expect(menuThumbSrc(url, false)).toBe(url);
    });

    it('returns the thumbnail when the flag is on', async () => {
        const { menuThumbSrc } = await import('@/lib/menu/menuImages');
        expect(menuThumbSrc(url, true)).toBe(`${BASE}/product-images/s/a.thumb.jpg`);
    });

    it('returns the original when no thumbnail can exist', async () => {
        const { menuThumbSrc } = await import('@/lib/menu/menuImages');
        expect(menuThumbSrc('https://example.com/a.jpg', true)).toBe('https://example.com/a.jpg');
    });
});

describe('fallBackToOriginal', () => {
    it('swaps a failed thumbnail for the original, once', async () => {
        const { fallBackToOriginal } = await import('@/lib/menu/menuImages');
        const img = { src: `${BASE}/product-images/s/a.thumb.jpg`, dataset: {} as Record<string, string> };
        expect(fallBackToOriginal(img, `${BASE}/product-images/s/a.jpg`)).toBe(true);
        expect(img.src).toBe(`${BASE}/product-images/s/a.jpg`);
        // The original failing too must not loop.
        expect(fallBackToOriginal(img, `${BASE}/product-images/s/a.jpg`)).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Upload
// ─────────────────────────────────────────────────────────────────────────────

type UploadCall = { path: string; body: unknown; options: Record<string, unknown> | undefined };

function fakeBucket(failThumb = false) {
    const calls: UploadCall[] = [];
    return {
        calls,
        upload: async (path: string, body: unknown, options?: Record<string, unknown>) => {
            calls.push({ path, body, options });
            if (failThumb && path.endsWith('.thumb.jpg')) return { error: new Error('denied') };
            return { error: null };
        },
    };
}

describe('uploadMenuImage', () => {
    const original = new Blob(['original-bytes'], { type: 'image/png' });
    const thumb = new Blob(['thumb-bytes'], { type: 'image/jpeg' });

    it('flag off: uploads exactly as today — one call, same file, same options', async () => {
        const { uploadMenuImage } = await import('@/lib/menu/menuImages');
        const bucket = fakeBucket();
        const makeThumb = vi.fn(async () => thumb);
        const res = await uploadMenuImage({
            bucket, path: 's/1.png', file: original,
            options: { upsert: true, contentType: 'image/png' },
            enabled: false, makeThumb,
        });
        expect(res.error).toBeNull();
        expect(bucket.calls).toEqual([
            { path: 's/1.png', body: original, options: { upsert: true, contentType: 'image/png' } },
        ]);
        expect(makeThumb).not.toHaveBeenCalled();
    });

    it('flag on: the original goes up unchanged with a one-year cache, then the thumbnail', async () => {
        const { uploadMenuImage, IMAGE_CACHE_SECONDS } = await import('@/lib/menu/menuImages');
        expect(IMAGE_CACHE_SECONDS).toBe('31536000');
        const bucket = fakeBucket();
        const res = await uploadMenuImage({
            bucket, path: 's/1.png', file: original,
            options: { contentType: 'image/png' },
            enabled: true, makeThumb: async () => thumb,
        });
        expect(res.error).toBeNull();
        expect(bucket.calls).toHaveLength(2);
        expect(bucket.calls[0].body).toBe(original); // the very same object: never re-encoded
        expect(bucket.calls[0].options).toEqual({ contentType: 'image/png', cacheControl: '31536000' });
        expect(bucket.calls[1].path).toBe('s/1.thumb.jpg');
        expect(bucket.calls[1].body).toBe(thumb);
        expect(bucket.calls[1].options).toMatchObject({ contentType: 'image/jpeg', cacheControl: '31536000' });
    });

    it('a failed thumbnail never fails the upload', async () => {
        const { uploadMenuImage } = await import('@/lib/menu/menuImages');
        const failing = await uploadMenuImage({
            bucket: fakeBucket(true), path: 's/1.png', file: original,
            enabled: true, makeThumb: async () => thumb,
        });
        expect(failing.error).toBeNull();

        const throwing = await uploadMenuImage({
            bucket: fakeBucket(), path: 's/2.png', file: original,
            enabled: true, makeThumb: async () => { throw new Error('canvas'); },
        });
        expect(throwing.error).toBeNull();

        const empty = fakeBucket();
        await uploadMenuImage({
            bucket: empty, path: 's/3.png', file: original,
            enabled: true, makeThumb: async () => null,
        });
        expect(empty.calls).toHaveLength(1);
    });

    it('a failed original is reported and no thumbnail is written', async () => {
        const { uploadMenuImage } = await import('@/lib/menu/menuImages');
        const calls: UploadCall[] = [];
        const res = await uploadMenuImage({
            bucket: { upload: async (path, body, options) => { calls.push({ path, body, options }); return { error: new Error('full') }; } },
            path: 's/1.png', file: original, enabled: true, makeThumb: async () => thumb,
        });
        expect(res.error).toBeInstanceOf(Error);
        expect(calls).toHaveLength(1);
    });
});

describe('every owner upload path goes through uploadMenuImage', () => {
    it.each(UPLOAD_SITES)('%s', (file) => {
        const code = shipped(file);
        expect(code).toMatch(/uploadMenuImage\(/);
        expect(code).not.toMatch(/\.upload\(/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Menu rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('menu rendering', () => {
    it('the list card shows the thumbnail and falls back to the original', () => {
        const card = shipped(CARD);
        expect(card).toMatch(/menuThumbSrc\(/);
        expect(card).toMatch(/fallBackToOriginal\(/);
        // Lazy loading stays: only the first rows are eager.
        expect(card).toMatch(/loading=\{priority \? 'eager' : 'lazy'\}/);
    });

    it('the detail-sheet header (54 px) shows the thumbnail with a fallback', () => {
        const tpl = shipped(TEMPLATE);
        expect(tpl).toMatch(/src=\{menuThumbSrc\(product\.image_url\)\}/);
        expect(tpl).toMatch(/fallBackToOriginal\(/);
    });

    it('the dish hero keeps the full original', () => {
        const tpl = shipped(TEMPLATE);
        expect(tpl).toMatch(/<img src=\{product\.image_url\} alt=\{product\.name\}\s+style=\{\{ width: '100%', aspectRatio: '4\/3'/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Backfill (existing uploads and the shared library)
// ─────────────────────────────────────────────────────────────────────────────

describe('backfill script', () => {
    const SCRIPT = join(WEB, 'scripts', 'backfill-menu-thumbs.mjs');

    it('exists', () => {
        expect(existsSync(SCRIPT)).toBe(true);
    });

    it('is a dry run unless --apply is passed, and never deletes or overwrites', () => {
        const code = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf8') : '';
        expect(code).toMatch(/--apply/);
        expect(code).not.toMatch(/\.remove\(/);
        expect(code).not.toMatch(/upsert:\s*true/);
    });

    it('makes thumbnails the same size and quality as the browser does', async () => {
        const { THUMB_EDGE_PX, THUMB_QUALITY } = await import('@/lib/menu/menuImages');
        const code = existsSync(SCRIPT) ? readFileSync(SCRIPT, 'utf8') : '';
        expect(code).toMatch(new RegExp(`THUMB_EDGE_PX\\s*=\\s*${THUMB_EDGE_PX}\\b`));
        expect(code).toMatch(new RegExp(`THUMB_QUALITY\\s*=\\s*${THUMB_QUALITY}\\b`));
    });
});
