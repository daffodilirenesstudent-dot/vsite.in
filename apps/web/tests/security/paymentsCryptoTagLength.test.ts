/**
 * AES-GCM auth-tag length (security audit 2026-09-27, Semgrep gcm-no-tag-length).
 *
 * Node's GCM decipher accepts any tag from 4 to 16 bytes unless the length is
 * pinned, and verifies only that many bytes. A payload whose tag is cut to 4
 * bytes therefore still decrypts — forging one takes ~2^32 tries instead of
 * 2^128. encryptToken always writes a 16-byte tag, so decryptToken must accept
 * exactly that and nothing shorter.
 */

import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { encryptToken, decryptToken } from '@/lib/payments/server/paymentsCrypto';

beforeAll(() => {
    process.env.PAYMENTS_ENC_KEY = crypto.randomBytes(32).toString('base64');
});

function withTag(payload: string, cut: (tag: Buffer) => Buffer): string {
    const [v, iv, tag, ct] = payload.split(':');
    return [v, iv, cut(Buffer.from(tag, 'base64')).toString('base64'), ct].join(':');
}

describe('decryptToken pins the GCM tag at 16 bytes', () => {
    it('round-trips a token', () => {
        expect(decryptToken(encryptToken('rzp_oauth_placeholder'))).toBe('rzp_oauth_placeholder');
    });

    it.each([4, 8, 12, 15])('refuses a tag truncated to %i bytes', bytes => {
        const truncated = withTag(encryptToken('rzp_oauth_placeholder'), t => t.subarray(0, bytes));
        expect(() => decryptToken(truncated)).toThrow();
    });
});
