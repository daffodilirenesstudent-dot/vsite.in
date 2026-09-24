import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Owner photo compression (dish photos and banners).
 *
 * Owners must use their own photos for their signature dishes, and a phone
 * photo is 2–9 MB (measured on production: three 9 MB PNGs, 77 of 219 uploads
 * are PNG). The menu shows at most 560 CSS px, so anything past 1600 px is
 * bytes nobody sees.
 *
 * Decisions, locked here (the pattern Facebook's Spectrum, Instagram and
 * YouTube use — shrink on the device, one master, a few sizes):
 *
 *   1. COMPRESS IN THE OWNER'S BROWSER, BEFORE UPLOAD. Our 512 MB server and the
 *      database never see image bytes; the upload goes straight to storage.
 *   2. ONE MASTER: long edge 1600 px, WebP 0.80 where the browser can encode it,
 *      JPEG 0.85 where it cannot (Safari silently returns PNG for WebP, so the
 *      result type is checked). Visually identical at menu sizes.
 *   3. STEP-DOWN RESIZING. A 4000 px photo drawn straight to 1600 px aliases;
 *      halving in steps does not. The first step stays under iOS Safari's
 *      16.7 MP canvas cap.
 *   4. NEVER MAKE IT WORSE. An already-compact JPEG/WebP within 1600 px is kept
 *      byte-for-byte (no generation loss).
 *   5. FLAG DEFAULTS OFF. `NEXT_PUBLIC_MENU_PHOTO_COMPRESS` unset = today's
 *      uploads, today's 5 MB limit.
 *
 * Real-browser behaviour (Chromium, Firefox, WebKit) is proven in
 * menu-photo-compression.browser.test.ts.
 */

const SRC = join(__dirname, '..', '..', 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const shipped = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const INVENTORY = 'app/manage/product-inventory/page.tsx';
const BANNERS = 'app/manage/banner-management/page.tsx';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('flag', () => {
    it('is OFF when the env var is missing', async () => {
        vi.stubEnv('NEXT_PUBLIC_MENU_PHOTO_COMPRESS', '');
        const m = await import('@/lib/menu/menuPhoto');
        expect(m.MENU_PHOTO_COMPRESS).toBe(false);
    });

    it('is ON only for the exact value "true"', async () => {
        vi.stubEnv('NEXT_PUBLIC_MENU_PHOTO_COMPRESS', 'true');
        const m = await import('@/lib/menu/menuPhoto');
        expect(m.MENU_PHOTO_COMPRESS).toBe(true);
    });
});

describe('settings', () => {
    it('matches the measured sweet spot', async () => {
        const m = await import('@/lib/menu/menuPhoto');
        expect(m.PHOTO_MAX_EDGE_PX).toBe(1600);
        expect(m.PHOTO_WEBP_QUALITY).toBe(0.8);
        expect(m.PHOTO_JPEG_QUALITY).toBe(0.85);
        expect(m.PHOTO_MAX_INPUT_BYTES).toBe(25 * 1024 * 1024);
        expect(m.CANVAS_MAX_PIXELS).toBeLessThan(4096 * 4096); // iOS Safari's canvas cap
    });
});

describe('fitWithin', () => {
    it('shrinks landscape and portrait to the long edge, keeping the ratio', async () => {
        const { fitWithin } = await import('@/lib/menu/menuPhoto');
        expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
        expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
        expect(fitWithin(2816, 1536, 1600)).toEqual({ width: 1600, height: 873 });
    });

    it('never upscales', async () => {
        const { fitWithin } = await import('@/lib/menu/menuPhoto');
        expect(fitWithin(1408, 768, 1600)).toEqual({ width: 1408, height: 768 });
        expect(fitWithin(1, 1, 1600)).toEqual({ width: 1, height: 1 });
    });
});

describe('downscalePlan (step-down resizing)', () => {
    it('halves until within 2× of the target, then lands on it', async () => {
        const { downscalePlan } = await import('@/lib/menu/menuPhoto');
        expect(downscalePlan(4000, 3000, 1600, 1200)).toEqual([
            { width: 2000, height: 1500 },
            { width: 1600, height: 1200 },
        ]);
    });

    it('is a single draw when no shrinking is needed', async () => {
        const { downscalePlan } = await import('@/lib/menu/menuPhoto');
        expect(downscalePlan(1408, 768, 1408, 768)).toEqual([{ width: 1408, height: 768 }]);
    });

    it('never shrinks more than 2× in one step after the first', async () => {
        const { downscalePlan } = await import('@/lib/menu/menuPhoto');
        const plan = downscalePlan(3000, 3000, 360, 360);
        expect(plan.at(-1)).toEqual({ width: 360, height: 360 });
        for (let i = 1; i < plan.length; i++) {
            expect(plan[i - 1].width / plan[i].width).toBeLessThanOrEqual(2.001);
        }
    });

    it('keeps every canvas under the iOS Safari pixel cap, even for a 108 MP photo', async () => {
        const { downscalePlan, CANVAS_MAX_PIXELS } = await import('@/lib/menu/menuPhoto');
        const plan = downscalePlan(12000, 9000, 1600, 1200);
        expect(plan.at(-1)).toEqual({ width: 1600, height: 1200 });
        for (const s of plan) expect(s.width * s.height).toBeLessThanOrEqual(CANVAS_MAX_PIXELS);
    });
});

describe('keepAsIs (never make it worse)', () => {
    it('keeps a compact JPEG or WebP that already fits', async () => {
        const { keepAsIs } = await import('@/lib/menu/menuPhoto');
        expect(keepAsIs({ type: 'image/jpeg', size: 300_000, width: 1200, height: 900 })).toBe(true);
        expect(keepAsIs({ type: 'image/webp', size: 90_000, width: 1600, height: 1600 })).toBe(true);
    });

    it('re-encodes PNGs, big files and oversized photos', async () => {
        const { keepAsIs } = await import('@/lib/menu/menuPhoto');
        expect(keepAsIs({ type: 'image/png', size: 80_000, width: 800, height: 600 })).toBe(false);
        expect(keepAsIs({ type: 'image/jpeg', size: 2_000_000, width: 1200, height: 900 })).toBe(false);
        expect(keepAsIs({ type: 'image/jpeg', size: 300_000, width: 4000, height: 3000 })).toBe(false);
    });
});

describe('photoFileName', () => {
    it('gives the file the extension of what it now is', async () => {
        const { photoFileName } = await import('@/lib/menu/menuPhoto');
        expect(photoFileName('IMG_2041.HEIC', 'image/jpeg')).toBe('IMG_2041.jpg');
        expect(photoFileName('dosa.png', 'image/webp')).toBe('dosa.webp');
        expect(photoFileName('biryani.final.jpeg', 'image/jpeg')).toBe('biryani.final.jpg');
        expect(photoFileName('photo', 'image/webp')).toBe('photo.webp');
        expect(photoFileName('', 'image/jpeg')).toBe('photo.jpg');
    });
});

describe('isPhotoFile', () => {
    it('accepts images, and HEIC even when the phone reports no type', async () => {
        const { isPhotoFile } = await import('@/lib/menu/menuPhoto');
        expect(isPhotoFile({ type: 'image/jpeg', name: 'a.jpg' })).toBe(true);
        expect(isPhotoFile({ type: '', name: 'IMG_1.HEIC' })).toBe(true);
        expect(isPhotoFile({ type: 'application/pdf', name: 'menu.pdf' })).toBe(false);
        expect(isPhotoFile({ type: '', name: 'notes.txt' })).toBe(false);
    });
});

describe('photoErrorMessage', () => {
    it('explains each failure in words an owner can act on', async () => {
        const { MenuPhotoError, photoErrorMessage } = await import('@/lib/menu/menuPhoto');
        expect(photoErrorMessage(new MenuPhotoError('TOO_LARGE'))).toMatch(/25 MB/);
        expect(photoErrorMessage(new MenuPhotoError('NOT_IMAGE'))).toMatch(/photo/i);
        expect(photoErrorMessage(new MenuPhotoError('HEIC_UNSUPPORTED'))).toMatch(/HEIC/);
        expect(photoErrorMessage(new MenuPhotoError('HEIC_UNSUPPORTED'))).toMatch(/screenshot/i);
        expect(photoErrorMessage(new MenuPhotoError('UNREADABLE'))).toMatch(/couldn.t open/i);
        expect(photoErrorMessage(new Error('network'))).toMatch(/upload/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wiring: both live owner-upload screens, flag-gated, old path kept for OFF
// ─────────────────────────────────────────────────────────────────────────────

describe('dish photo upload (product inventory)', () => {
    it('prepares the photo before upload when the flag is on', () => {
        const code = shipped(INVENTORY);
        expect(code).toMatch(/MENU_PHOTO_COMPRESS/);
        expect(code).toMatch(/prepareMenuPhoto\(/);
        expect(code).toMatch(/photoErrorMessage\(/);
    });

    it('accepts large phone photos when on, keeps the 5 MB limit when off', () => {
        const code = shipped(INVENTORY);
        expect(code).toMatch(/PHOTO_MAX_INPUT_BYTES/);
        expect(code).toMatch(/5 \* 1024 \* 1024/);
    });

    it('the inventory list icons use the thumbnail with a fallback', () => {
        const code = shipped(INVENTORY);
        expect(code).toMatch(/menuThumbSrc\(/);
        expect(code).toMatch(/fallBackToOriginal\(/);
    });
});

describe('banner upload', () => {
    it('prepares the photo before upload when on, old compressor when off', () => {
        const code = shipped(BANNERS);
        expect(code).toMatch(/MENU_PHOTO_COMPRESS/);
        expect(code).toMatch(/prepareMenuPhoto\(/);
        expect(code).toMatch(/compressImage\(/);
        expect(code).toMatch(/PHOTO_MAX_INPUT_BYTES/);
    });
});
