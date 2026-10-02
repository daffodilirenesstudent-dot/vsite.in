import crypto from 'crypto';

/**
 * Meta signs every webhook POST as `X-Hub-Signature-256: sha256=<hex>`, the
 * HMAC-SHA256 of the RAW request body keyed with the app's App Secret.
 *
 * It must be the raw body: Meta escapes non-ASCII as \uXXXX when it signs, so
 * parsing and re-serialising (which un-escapes Tamil shop names, for one)
 * produces different bytes and a signature that never matches.
 *
 * An empty secret rejects everything — an HMAC keyed with '' is computable by
 * anyone, so accepting it would mean no authentication at all.
 */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
    if (!appSecret || !header || !header.startsWith('sha256=')) return false;
    const given = header.slice('sha256='.length);
    if (!/^[0-9a-f]{64}$/i.test(given)) return false;
    const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given.toLowerCase(), 'hex'));
}

/**
 * Constant-time comparison for the GET handshake's verify token. Hashing both
 * sides to a fixed 32 bytes removes the length leak `timingSafeEqual` would
 * otherwise force us to branch on. Empty never matches.
 */
export function tokensMatch(given: string, expected: string): boolean {
    if (!given || !expected) return false;
    const a = crypto.createHash('sha256').update(given).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b);
}
