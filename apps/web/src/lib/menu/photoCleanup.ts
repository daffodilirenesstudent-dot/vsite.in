/**
 * Which stored photo an owner's edit has made unnecessary, and whether it is
 * safe to delete. Pure and client-safe; the deleting happens server-side in
 * /api/manage/media/release.
 *
 * Deleting from storage is permanent, so every rule here errs towards keeping
 * a file. A photo is only ever a candidate when it is:
 *   - in `product-images`, the owners' own uploads — never `default-images`,
 *     the library whose photos every store's dishes share;
 *   - inside this store's folder: `<siteId>/…` (dish photos) or `<slug>/…`
 *     (banners, and older dish uploads);
 *   - a real file name, not a thumbnail and not a path that climbs out.
 * The route then keeps it anyway if any dish or banner still uses it.
 */
import { thumbObjectName } from '@/lib/menu/menuImages';

const OWN_UPLOAD = /^https?:\/\/[^/?#]+\/storage\/v1\/object\/public\/product-images\/([^?#]+)/;

export interface OwnedUpload {
    /** Object name in the bucket, decoded — what storage.remove() takes. */
    name: string;
    /** The same path as it appears in stored URLs — what the in-use check matches. */
    urlPath: string;
}

export function parseOwnedUpload(url: string | null | undefined, site: { siteId: string; slug: string | null | undefined }): OwnedUpload | null {
    const m = url ? OWN_UPLOAD.exec(url) : null;
    if (!m) return null;
    let name: string;
    try { name = decodeURIComponent(m[1]); } catch { return null; }
    const parts = name.split('/');
    if (parts.length < 2 || parts.some(p => p === '' || p === '.' || p === '..' || p.includes('\\'))) return null;
    if (parts[0] !== site.siteId && parts[0] !== site.slug) return null;
    if (thumbObjectName(name) === null) return null;
    return { name, urlPath: m[1] };
}

/** The bucket path of this store's own upload at `url`, or null when it is not one. */
export function ownedUploadPath(url: string | null | undefined, site: { siteId: string; slug: string | null | undefined }): string | null {
    return parseOwnedUpload(url, site)?.name ?? null;
}

/** After a save: the photo the row no longer points at, if any. */
export function replacedPhotos(before: string | null | undefined, after: string | null | undefined): string[] {
    return before && before !== after ? [before] : [];
}
