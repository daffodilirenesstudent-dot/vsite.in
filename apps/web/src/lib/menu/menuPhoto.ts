// Owner photo preparation: the decisions, kept pure so node tests can pin them.
// The canvas work that applies them lives in imageCompress.ts (browser-only).
//
// Why: owners upload their own dish photos and banners straight from a phone,
// 2–9 MB each. The menu shows them at most 560 CSS px wide, so past 1600 px
// (560 × ~3 device pixel ratio) every byte is invisible — but it still costs
// Supabase storage and egress, and slows the menu on 4G.
//
// The pattern big photo products use: shrink on the device before upload
// (Facebook's Spectrum), keep one master, serve a few fixed sizes (Instagram,
// YouTube). Our server and database never see image bytes.

/**
 * Off unless explicitly "true". NEXT_PUBLIC_* is inlined at build time, so
 * flipping it needs a redeploy; a missing value keeps today's uploads.
 */
export const MENU_PHOTO_COMPRESS: boolean = process.env.NEXT_PUBLIC_MENU_PHOTO_COMPRESS === 'true';

/** Long edge of the stored master. The dish sheet is 560 CSS px at ~3× DPR. */
export const PHOTO_MAX_EDGE_PX = 1600;
/** Visually identical to the source at menu sizes (side-by-side checked). */
export const PHOTO_WEBP_QUALITY = 0.8;
/** Used where the browser cannot encode WebP (Safari). */
export const PHOTO_JPEG_QUALITY = 0.85;
/** Accepted input. Big phone photos are fine: they shrink before upload. */
export const PHOTO_MAX_INPUT_BYTES = 25 * 1024 * 1024;
/** A JPEG/WebP this small that already fits is kept as-is: no generation loss. */
export const PHOTO_KEEP_AS_IS_BYTES = 500 * 1024;
/** Per-canvas pixel budget, under iOS Safari's 16,777,216 (4096²) cap. */
export const CANVAS_MAX_PIXELS = 16_000_000;

export interface Size {
    width: number;
    height: number;
}

/** Scale into a `max` × `max` box, keeping the ratio. Never upscales. */
export function fitWithin(width: number, height: number, max: number): Size {
    const scale = Math.min(1, max / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

/**
 * The canvas sizes to draw through, ending at the target. A single big
 * reduction samples too few source pixels and aliases (moiré on fabric,
 * banana leaves, grill marks); halving averages them. Each step is at most
 * 2× smaller — except a first step forced smaller to stay under
 * CANVAS_MAX_PIXELS, which only a 100 MP+ photo triggers.
 */
export function downscalePlan(width: number, height: number, targetWidth: number, targetHeight: number): Size[] {
    const final = Math.min(1, targetWidth / width);
    const areaCap = Math.sqrt(CANVAS_MAX_PIXELS / (width * height));
    const plan: Size[] = [];
    let scale = 1;
    for (;;) {
        let next = scale >= final * 2 ? scale / 2 : final;
        if (plan.length === 0) next = Math.min(next, areaCap);
        if (next <= final) {
            plan.push({ width: targetWidth, height: targetHeight });
            return plan;
        }
        // Floor, not round: rounding up can tip a capped first step over the cap.
        plan.push({ width: Math.max(1, Math.floor(width * next)), height: Math.max(1, Math.floor(height * next)) });
        scale = next;
    }
}

/** Already compact and within bounds: re-encoding would only lose quality. */
export function keepAsIs(p: { type: string; size: number; width: number; height: number }): boolean {
    return /^image\/(jpeg|webp)$/.test(p.type)
        && p.size <= PHOTO_KEEP_AS_IS_BYTES
        && Math.max(p.width, p.height) <= PHOTO_MAX_EDGE_PX;
}

/** "IMG_2041.HEIC" + image/jpeg → "IMG_2041.jpg". */
export function photoFileName(name: string, mime: string): string {
    const stem = name.replace(/\.[^./\\]+$/, '') || 'photo';
    return `${stem}.${mime === 'image/webp' ? 'webp' : 'jpg'}`;
}

const HEIC = /\.hei[cf]$/i;

export function isHeic(file: { type: string; name: string }): boolean {
    return /^image\/hei[cf]/i.test(file.type) || HEIC.test(file.name);
}

/** Android often reports HEIC with an empty type, so the name counts too. */
export function isPhotoFile(file: { type: string; name: string }): boolean {
    return file.type.startsWith('image/') || isHeic(file);
}

export type MenuPhotoErrorCode = 'NOT_IMAGE' | 'TOO_LARGE' | 'HEIC_UNSUPPORTED' | 'UNREADABLE';

export class MenuPhotoError extends Error {
    readonly code: MenuPhotoErrorCode;

    constructor(code: MenuPhotoErrorCode) {
        super(code);
        this.name = 'MenuPhotoError';
        this.code = code;
    }
}

const MESSAGES: Record<MenuPhotoErrorCode, string> = {
    NOT_IMAGE: 'Please choose a photo (JPG, PNG or WebP).',
    TOO_LARGE: 'This photo is over 25 MB. Please choose a smaller one.',
    HEIC_UNSUPPORTED: "This photo is in HEIC format, which this browser can't open. Take a screenshot of the photo and upload that instead.",
    UNREADABLE: "We couldn't open this photo. Please try another one.",
};

/** A message an owner can act on; anything unexpected reads as an upload failure. */
export function photoErrorMessage(err: unknown): string {
    return err instanceof MenuPhotoError ? MESSAGES[err.code] : 'Failed to upload image. Please try again.';
}
