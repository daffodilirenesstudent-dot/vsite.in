import 'server-only';
import crypto from 'crypto';

// Symmetric encryption for OAuth tokens at rest.
//
// We use AES-256-GCM in app code (rather than pgp_sym_encrypt in Postgres)
// so we never have to send the key over the wire to the database and so the
// ciphertext is opaque to anyone with read-only DB access (including a
// compromised Supabase replication target).
//
// PAYMENTS_ENC_KEY must be a 32-byte key, base64-encoded.
//   openssl rand -base64 32

const ALGO = 'aes-256-gcm';
const GCM_TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.PAYMENTS_ENC_KEY;
  if (!raw) {
    throw new Error('PAYMENTS_ENC_KEY is not set');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('PAYMENTS_ENC_KEY must decode to 32 bytes (base64-encoded)');
  }
  return key;
}

// Format on disk: "v1:<iv_b64>:<tag_b64>:<ct_b64>"
// The version prefix lets us rotate the algorithm later without an ambiguous
// decrypt path.
export function encryptToken(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptToken(payload: string): string {
  const key = getKey();
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted token payload');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ct = Buffer.from(parts[3], 'base64');
  // Pin the tag at the 16 bytes encryptToken writes. Unpinned, GCM accepts a
  // tag cut to 4 bytes and verifies only those — a 2^32 forgery instead of 2^128.
  if (tag.length !== GCM_TAG_BYTES) {
    throw new Error('Invalid encrypted token payload');
  }
  const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: GCM_TAG_BYTES });
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plain.toString('utf8');
}
