// src/lib/imageCompress.ts
// Browser-side image compression — runs before upload.
//
// Why: Vercel's serverless body cap is ~4.5MB. A single iPhone photo is often
// 4–8MB. Without compression, even 1 photo can fail the upload entirely, and
// 10 photos definitely will. Resizing to 1600px on the long edge + 0.82 JPEG
// quality typically yields 200–500KB per photo with no visible loss for menu
// scanning.

import { THUMB_EDGE_PX, THUMB_QUALITY } from '@/lib/menu/menuImages';
import {
    PHOTO_JPEG_QUALITY, PHOTO_MAX_EDGE_PX, PHOTO_MAX_INPUT_BYTES, PHOTO_WEBP_QUALITY,
    MenuPhotoError, downscalePlan, fitWithin, isHeic, isPhotoFile, keepAsIs, photoFileName,
} from '@/lib/menu/menuPhoto';

const MAX_DIMENSION = 1600;     // px on the long edge
const JPEG_QUALITY = 0.82;
const SIZE_THRESHOLD = 800_000; // 800KB — files smaller than this skip compression

/**
 * Compresses an image File and returns a new JPEG File. If the input is
 * already small enough (<800KB) and is a JPEG, it is returned unchanged
 * so we don't waste cycles re-encoding.
 */
export async function compressImage(file: File): Promise<File> {
    if (typeof window === 'undefined') return file;
    if (file.size < SIZE_THRESHOLD && /^image\/jpe?g$/i.test(file.type)) return file;

    const dataUrl = await readAsDataURL(file);
    const img = await loadImage(dataUrl);

    const { width, height } = scaleToFit(img.width, img.height, MAX_DIMENSION);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });

    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'menu';
    const compressed = new File([blob], `${baseName}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
    });

    // If compression somehow produced a larger file (rare, very small inputs),
    // keep the original.
    return compressed.size < file.size ? compressed : file;
}

function readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image decode failed'));
        img.src = src;
    });
}

function scaleToFit(w: number, h: number, max: number): { width: number; height: number } {
    if (w <= max && h <= max) return { width: w, height: h };
    const ratio = w > h ? max / w : max / h;
    return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

// ── Owner photos: shared canvas pipeline ────────────────────────────────────

/** Decode with the browser's own decoder; EXIF orientation is applied for us. */
async function decodePhoto(file: Blob): Promise<{ img: HTMLImageElement; url: string }> {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
        await img.decode();
    } catch {
        URL.revokeObjectURL(url);
        throw new MenuPhotoError(isHeic({ type: file.type, name: file instanceof File ? file.name : '' }) ? 'HEIC_UNSUPPORTED' : 'UNREADABLE');
    }
    if (!img.naturalWidth || !img.naturalHeight) {
        URL.revokeObjectURL(url);
        throw new MenuPhotoError('UNREADABLE');
    }
    return { img, url };
}

/**
 * Draw a source rectangle to `dw` × `dh` through downscalePlan's steps, on
 * white (so transparent PNG areas never turn black in a JPEG). Intermediate
 * canvases are released as soon as the next step has read them — iOS keeps
 * canvas memory until the size is zeroed.
 */
function drawDownscaled(
    source: CanvasImageSource,
    sx: number, sy: number, sw: number, sh: number,
    dw: number, dh: number,
): HTMLCanvasElement {
    let src: CanvasImageSource = source;
    let rect = { x: sx, y: sy, w: sw, h: sh };
    let out: HTMLCanvasElement | null = null;
    for (const step of downscalePlan(sw, sh, dw, dh)) {
        const canvas = document.createElement('canvas');
        canvas.width = step.width;
        canvas.height = step.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new MenuPhotoError('UNREADABLE');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, step.width, step.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, step.width, step.height);
        if (out) { out.width = 0; out.height = 0; }
        out = canvas;
        src = canvas;
        rect = { x: 0, y: 0, w: step.width, h: step.height };
    }
    if (!out) throw new MenuPhotoError('UNREADABLE');
    return out;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

let webpEncoding: Promise<boolean> | null = null;

/**
 * Safari cannot encode WebP and silently hands back a PNG instead, so ask once
 * with a 1×1 canvas and remember the answer rather than paying for a
 * full-size PNG encode on every photo.
 */
function canEncodeWebp(): Promise<boolean> {
    if (!webpEncoding) {
        const probe = document.createElement('canvas');
        probe.width = 1;
        probe.height = 1;
        webpEncoding = canvasToBlob(probe, 'image/webp', PHOTO_WEBP_QUALITY).then(b => b?.type === 'image/webp');
    }
    return webpEncoding;
}

async function encodePhoto(canvas: HTMLCanvasElement): Promise<Blob | null> {
    if (await canEncodeWebp()) {
        const webp = await canvasToBlob(canvas, 'image/webp', PHOTO_WEBP_QUALITY);
        if (webp?.type === 'image/webp') return webp;
    }
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', PHOTO_JPEG_QUALITY);
    return jpeg?.type === 'image/jpeg' ? jpeg : null;
}

/**
 * The master copy of an owner's dish photo or banner, made on their phone
 * before upload: long edge PHOTO_MAX_EDGE_PX, WebP (JPEG on Safari), upright,
 * no EXIF (the phone's GPS location goes with it). A compact JPEG/WebP that
 * already fits is returned untouched. Throws MenuPhotoError with a code the
 * page turns into a message (photoErrorMessage).
 */
export async function prepareMenuPhoto(file: File): Promise<File> {
    if (!isPhotoFile(file)) throw new MenuPhotoError('NOT_IMAGE');
    if (file.size > PHOTO_MAX_INPUT_BYTES) throw new MenuPhotoError('TOO_LARGE');

    const { img, url } = await decodePhoto(file);
    try {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (keepAsIs({ type: file.type, size: file.size, width, height })) return file;

        const target = fitWithin(width, height, PHOTO_MAX_EDGE_PX);
        const canvas = drawDownscaled(img, 0, 0, width, height, target.width, target.height);
        const blob = await encodePhoto(canvas);
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) throw new MenuPhotoError('UNREADABLE');

        // Never make it worse: a web-ready file that already fits and would
        // only grow stays as the owner chose it.
        const fits = Math.max(width, height) <= PHOTO_MAX_EDGE_PX;
        if (fits && blob.size >= file.size && /^image\/(jpeg|webp|png)$/.test(file.type)) return file;

        return new File([blob], photoFileName(file.name, blob.type), { type: blob.type, lastModified: Date.now() });
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * The small copy a menu shows at 120 px. Every spot that uses it is a square
 * `object-fit: cover`, so the thumbnail is that same centre square — the diner
 * sees an identical picture — at up to THUMB_EDGE_PX; never upscales. Returns
 * null when the browser cannot decode or encode it; the menu then uses the
 * original.
 */
export async function makeMenuThumbnail(file: Blob): Promise<Blob | null> {
    if (typeof window === 'undefined') return null;
    try {
        const { img, url } = await decodePhoto(file);
        try {
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            const edge = Math.min(THUMB_EDGE_PX, side);
            const canvas = drawDownscaled(
                img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, edge, edge,
            );
            const thumb = await canvasToBlob(canvas, 'image/jpeg', THUMB_QUALITY);
            canvas.width = 0;
            canvas.height = 0;
            return thumb;
        } finally {
            URL.revokeObjectURL(url);
        }
    } catch {
        return null;
    }
}
