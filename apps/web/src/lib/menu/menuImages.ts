// Menu image delivery: small thumbnails for small spots, long browser cache.
//
// Why: Supabase free egress is 5 GB/month. A menu shows ~36 photos at 120 px
// but each one downloaded the full file (186 KB average, 466 KB for owner
// uploads). A 360 px thumbnail looks identical at that size and is ~20 KB.
//
// The original is never re-encoded, overwritten or deleted: the thumbnail is an
// extra file beside it (`<name>.thumb.jpg`), and large views keep the original.
// A missing thumbnail (old upload, backfill not run) falls back to the original.
//
// CLIENT-SAFE and pure: imported by the public menu and the dashboard, and by
// node tests. Browser-only work (canvas) is injected as `makeThumb`.

/**
 * Off unless explicitly "true". NEXT_PUBLIC_* is inlined at build time, so
 * flipping it needs a redeploy; a missing value keeps today's behaviour.
 */
export const MENU_IMAGE_THUMBS: boolean = process.env.NEXT_PUBLIC_MENU_IMAGE_THUMBS === 'true';

/** One year. Safe because every upload path writes a unique filename. */
export const IMAGE_CACHE_SECONDS = '31536000';

/** Short edge of a thumbnail: the 120 px list card at 3× device pixel ratio. */
export const THUMB_EDGE_PX = 360;
export const THUMB_QUALITY = 0.85;

const THUMB_SUFFIX = '.thumb.jpg';
const PUBLIC_STORAGE = /^(https?:\/\/[^/?#]+\/storage\/v1\/object\/public\/(?:product-images|default-images)\/)([^?#]+)/;

/** "shop/prod-0.12.png" → "shop/prod-0.12.thumb.jpg"; null for a thumbnail. */
export function thumbObjectName(objectName: string): string | null {
    if (!objectName || objectName.endsWith(THUMB_SUFFIX)) return null;
    const slash = objectName.lastIndexOf('/');
    const dot = objectName.lastIndexOf('.');
    const stem = dot > slash + 1 ? objectName.slice(0, dot) : objectName;
    return `${stem}${THUMB_SUFFIX}`;
}

/** Public URL of the thumbnail beside `url`, or null when none can exist. */
export function thumbUrlFor(url: string | null | undefined): string | null {
    const m = url ? PUBLIC_STORAGE.exec(url) : null;
    if (!m) return null;
    const name = thumbObjectName(m[2]);
    return name ? `${m[1]}${name}` : null;
}

/** What a small menu spot should load. Flag off → the original, as today. */
export function menuThumbSrc(url: string, enabled: boolean = MENU_IMAGE_THUMBS): string {
    return (enabled && thumbUrlFor(url)) || url;
}

/**
 * `onError` for a thumbnail: switch to the original once. Returns false when
 * there is nothing left to try, so the caller can stop its loading state.
 */
export function fallBackToOriginal(
    img: { src: string; dataset: Record<string, string | undefined> },
    original: string,
): boolean {
    if (img.dataset.menuFallback === '1') return false;
    img.dataset.menuFallback = '1';
    if (img.src === original) return false;
    img.src = original;
    return true;
}

/**
 * Call once the image is mounted. A server-rendered <img> can fail before
 * React hydrates and attaches onError, and React 18 does not replay that
 * event — so check the element itself: requested (currentSrc set), finished
 * (complete), no pixels. A lazy image not yet requested has no currentSrc.
 */
export function fallBackIfBroken(
    img: { complete: boolean; naturalWidth: number; currentSrc: string; src: string; dataset: Record<string, string | undefined> },
    original: string,
): boolean {
    if (!img.currentSrc || !img.complete || img.naturalWidth > 0) return false;
    return fallBackToOriginal(img, original);
}

export type UploadOptions = {
    upsert?: boolean;
    contentType?: string;
    cacheControl?: string;
};

/** The slice of a Supabase storage bucket (`supabase.storage.from(x)`) we use. */
export interface UploadBucket {
    upload(path: string, body: Blob, options?: UploadOptions): Promise<{ error: Error | null }>;
}

/**
 * Upload a menu image. Flag off: exactly today's single call. Flag on: the
 * same file with a one-year cache, then a best-effort thumbnail beside it —
 * a thumbnail failure never fails the upload.
 */
export async function uploadMenuImage(args: {
    bucket: UploadBucket;
    path: string;
    file: Blob;
    options?: UploadOptions;
    enabled?: boolean;
    makeThumb: (file: Blob) => Promise<Blob | null>;
}): Promise<{ error: Error | null }> {
    const { bucket, path, file, options, enabled = MENU_IMAGE_THUMBS, makeThumb } = args;
    if (!enabled) return bucket.upload(path, file, options);

    const { error } = await bucket.upload(path, file, { ...options, cacheControl: IMAGE_CACHE_SECONDS });
    if (error) return { error };

    const thumbPath = thumbObjectName(path);
    if (thumbPath) {
        try {
            const thumb = await makeThumb(file);
            if (thumb) {
                await bucket.upload(thumbPath, thumb, { contentType: 'image/jpeg', cacheControl: IMAGE_CACHE_SECONDS });
            }
        } catch {
            // The menu falls back to the original; the backfill can fill it in later.
        }
    }
    return { error: null };
}
