// Validates uploaded image files by sniffing the file's magic bytes and
// confirming they match an allowed image format. Prevents an attacker from
// uploading a polyglot (e.g. an HTML page with a .jpg extension) or an
// executable disguised by a faked Content-Type header.
//
// We sniff manually so we don't pull a heavy dep (`file-type` is ~150 KB
// across its tables). Three formats covers ~99% of real menu uploads.

export type AllowedMime = 'image/jpeg' | 'image/png' | 'image/webp';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

type SniffResult =
    | { ok: true; mime: AllowedMime }
    | { ok: false; reason: string };

function startsWith(buf: Uint8Array, sig: number[], offset = 0): boolean {
    if (buf.length < offset + sig.length) return false;
    for (let i = 0; i < sig.length; i++) {
        if (buf[offset + i] !== sig[i]) return false;
    }
    return true;
}

/**
 * Detects the actual image format from the first 12 bytes of the file.
 * Returns the canonical MIME or null if unrecognised.
 */
function sniffMime(buf: Uint8Array): AllowedMime | null {
    // JPEG: FF D8 FF
    if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
    // WebP: "RIFF" .... "WEBP"
    if (
        startsWith(buf, [0x52, 0x49, 0x46, 0x46]) &&
        startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)
    ) {
        return 'image/webp';
    }
    return null;
}

/**
 * Full validation pipeline for an uploaded image. Returns the verified
 * MIME type (use this for downstream calls — never trust file.type) or a
 * machine-friendly reason on rejection.
 */
export async function validateImageFile(file: File): Promise<SniffResult> {
    if (!(file instanceof File)) return { ok: false, reason: 'not a file' };
    if (file.size === 0) return { ok: false, reason: 'empty' };
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, reason: 'too large' };

    // Read enough bytes to identify all supported formats (12 covers WebP).
    const head = await file.slice(0, 16).arrayBuffer();
    const sniffed = sniffMime(new Uint8Array(head));
    if (!sniffed) return { ok: false, reason: 'unrecognised format' };

    // Defence-in-depth: the client-claimed type and the sniffed type must agree
    // on the family. (Some browsers report 'image/jpg' instead of 'image/jpeg';
    // accept that as a known equivalent.)
    const claimed = (file.type || '').toLowerCase();
    if (claimed && claimed !== sniffed && !(claimed === 'image/jpg' && sniffed === 'image/jpeg')) {
        return { ok: false, reason: 'mime mismatch' };
    }

    return { ok: true, mime: sniffed };
}
