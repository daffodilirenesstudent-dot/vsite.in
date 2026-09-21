import crypto from 'crypto';

/**
 * Signed, expiring token for the public order-status link
 * (/api/orders/[id]/status?t=…).
 *
 * This used to live in lib/notifications/orderEmail.ts because the link was
 * first sent by email. Email is gone (2026-09-21); the link is not, so the token
 * moved here unchanged.
 *
 * The secret keeps its historical env name, ORDER_EMAIL_SECRET. Renaming it
 * would mean a coordinated env change in production and would invalidate every
 * link already issued.
 */

const ORDER_TOKEN_SECRET = process.env.ORDER_EMAIL_SECRET;

if (!ORDER_TOKEN_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[orderToken] ORDER_EMAIL_SECRET env var is not set — refusing to start in production with an insecure key');
  }
  console.error('[orderToken] ORDER_EMAIL_SECRET env var is not set — order links are insecure!');
}
const SECRET = ORDER_TOKEN_SECRET ?? 'dev-only-insecure-key';

const LINK_TTL_SECONDS = 72 * 60 * 60;

export function signOrderToken(orderId: string): string {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
  const payload = `${orderId}.${exp}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export function verifyOrderToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split('.');
    if (parts.length !== 3) return null;
    const [orderId, expStr, sig] = parts;
    const exp = parseInt(expStr, 10);
    if (Math.floor(Date.now() / 1000) > exp) return null;
    const expected = crypto
      .createHmac('sha256', SECRET)
      .update(`${orderId}.${expStr}`)
      .digest('hex');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    return orderId;
  } catch {
    return null;
  }
}
