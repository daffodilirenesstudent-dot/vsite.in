// Signed QR table parameter — HMAC defense against URL tampering.
//
// The customer's QR code links to /shop/<slug>?table=<n>&sig=<hmac16>.
// A customer at table 5 cannot edit the URL to ?table=3 to grief that table:
// the sig wouldn't match the server-side recomputation.
//
// Algorithm:
//   sig = first 16 hex of HMAC-SHA256(qr_secret, slug + '|' + tableNumber)
//
// The secret lives only in sites.qr_secret (server-only). The QR generation
// page is server-rendered, so the secret never leaves the backend.
//
// VERIFY pattern (timing-safe):
//   verifyTableSig(slug, tableNumber, secret, sigFromUrl) → boolean
//
// PHASE 1 (current): missing sig is logged but allowed (so freshly-installed
// restaurants don't break customers with old printed cards).
// PHASE 2 (after re-print): strict — missing sig rejects.

import crypto from 'crypto';

const SIG_LEN_HEX = 16; // 64-bit truncation — plenty for 1-200 table range

export function signTable(slug: string, tableNumber: number, secret: string): string {
    return crypto
        .createHmac('sha256', secret)
        .update(`${slug}|${tableNumber}`)
        .digest('hex')
        .slice(0, SIG_LEN_HEX);
}

/**
 * Timing-safe HMAC verify. Returns true iff `sig` is a valid signature for
 * (slug, tableNumber) under `secret`. Empty/missing inputs → false.
 */
export function verifyTableSig(
    slug: string,
    tableNumber: number,
    secret: string,
    sig: string | null | undefined,
): boolean {
    if (!sig || typeof sig !== 'string' || sig.length !== SIG_LEN_HEX) return false;
    if (!secret) return false;
    const expected = signTable(slug, tableNumber, secret);
    try {
        return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
        return false;
    }
}
