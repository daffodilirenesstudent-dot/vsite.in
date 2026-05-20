import crypto from 'crypto';

const ZEPTOMAIL_API_KEY    = process.env.ZEPTOMAIL_API_KEY    ?? '';
const ZEPTOMAIL_FROM_EMAIL = process.env.ZEPTOMAIL_FROM_EMAIL ?? '';
const ZEPTOMAIL_FROM_NAME  = process.env.ZEPTOMAIL_FROM_NAME  ?? 'Your Order';
const ORDER_EMAIL_SECRET   = process.env.ORDER_EMAIL_SECRET;
const BASE_URL             = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://buildyoustore.com';

if (!ORDER_EMAIL_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[orderEmail] ORDER_EMAIL_SECRET env var is not set — refusing to start in production with an insecure key');
  }
  console.error('[orderEmail] ORDER_EMAIL_SECRET env var is not set — email links are insecure!');
}
const EMAIL_SECRET = ORDER_EMAIL_SECRET ?? 'dev-only-insecure-key';

const LINK_TTL_SECONDS = 72 * 60 * 60; // 72 h — enough for slow email delivery

export function signOrderToken(orderId: string): string {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
  const payload = `${orderId}.${exp}`;
  const sig = crypto.createHmac('sha256', EMAIL_SECRET).update(payload).digest('hex');
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
      .createHmac('sha256', EMAIL_SECRET)
      .update(`${orderId}.${expStr}`)
      .digest('hex');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    return orderId;
  } catch {
    return null;
  }
}

import { escapeHtml as esc } from './htmlEscape';

export interface OrderEmailItem {
  name: string;
  qty: number;
  price: number;
  variantSize?: string;
}

export interface BuildOrderEmailParams {
  customerName: string;
  orderNumber: string;
  orderId: string;
  tokenNumber: string | null;
  shopSlug: string;
  shopName: string;
  subtotal: number;
  paymentMethod: 'online' | 'counter';
  items: OrderEmailItem[];
}

// Pure function — builds subject + HTML without any I/O.
// Called by the API route (to enqueue) and by the cron (to re-build if needed).
export function buildOrderConfirmationEmail(params: BuildOrderEmailParams): {
  subject: string;
  htmlbody: string;
} {
  const { customerName, orderNumber, orderId, tokenNumber, shopSlug, shopName, subtotal, items } =
    params;

  const signedToken  = signOrderToken(orderId);
  const orderLink    = `${BASE_URL}/shop/${shopSlug}/order/${orderId}?t=${signedToken}`;
  const menuLink     = `${BASE_URL}/shop/${shopSlug}`;
  const displayId    = tokenNumber ?? `#${orderNumber}`;
  const displayLabel = tokenNumber ? 'Your Token' : 'Order Number';

  const itemRows = items
    .map(
      item => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #F0F0F0;font-size:14px;color:#0A0A0A;">
        ${esc(item.qty)}&times; ${esc(item.name)}${item.variantSize ? ` <span style="color:#71717A;font-size:12px;">(${esc(item.variantSize)})</span>` : ''}
      </td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #F0F0F0;font-size:14px;color:#0A0A0A;white-space:nowrap;">
        &#8377;${(item.price * item.qty).toFixed(2)}
      </td>
    </tr>`,
    )
    .join('');

  const htmlbody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:#5137EF;padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:800;color:#FFFFFF;">${esc(shopName)}</p>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.75);">Order Confirmation</p>
        </td></tr>
        <tr><td style="padding:28px 32px 0;">
          <p style="margin:0 0 6px;font-size:15px;color:#52525C;">Hi <strong>${esc(customerName)}</strong>, your order is confirmed!</p>
          <div style="background:#F4F4F5;border-radius:12px;padding:20px 24px;margin:20px 0;text-align:center;">
            <p style="margin:0 0 6px;font-size:11px;color:#71717A;text-transform:uppercase;letter-spacing:1px;font-weight:700;">${esc(displayLabel)}</p>
            <p style="margin:0;font-size:48px;font-weight:900;color:#5137EF;letter-spacing:2px;line-height:1;">${esc(displayId)}</p>
            ${tokenNumber ? `<p style="margin:8px 0 0;font-size:12px;color:#71717A;">Show this token at the counter to collect your order</p>` : ''}
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 20px;">
          <div style="display:inline-block;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:8px 16px;">
            <span style="font-size:13px;font-weight:600;color:#16A34A;">&#10003; Paid</span>
          </div>
        </td></tr>
        <tr><td style="padding:0 32px;"><div style="height:1px;background:#E4E4E7;"></div></td></tr>
        <tr><td style="padding:20px 32px 0;">
          <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0A0A0A;text-transform:uppercase;letter-spacing:0.5px;">Order Items</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            ${itemRows}
            <tr>
              <td style="padding:14px 0 0;font-size:15px;font-weight:700;color:#0A0A0A;">Total</td>
              <td align="right" style="padding:14px 0 0;font-size:18px;font-weight:800;color:#5137EF;">&#8377;${subtotal.toFixed(2)}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px 0;"><div style="height:1px;background:#E4E4E7;"></div></td></tr>
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 16px;font-size:13px;color:#71717A;">Refreshed the page and lost your token? Use the link below — valid for 72 hours.</p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
            <tr>
              <td style="background:#5137EF;border-radius:8px;padding:12px 28px;">
                <a href="${orderLink}" style="color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;">View Order Status &rarr;</a>
              </td>
            </tr>
          </table>
          <div style="border-top:1px solid #E4E4E7;padding-top:20px;">
            <p style="margin:0;font-size:13px;color:#71717A;">
              Want to order again? <a href="${menuLink}" style="color:#5137EF;text-decoration:none;font-weight:600;">Back to menu &rarr;</a>
            </p>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Subject is plain text — strip line breaks & strange whitespace.
  // (HTML entities are NOT for subjects.)
  const sanitizeSubj = (s: string) => s.replace(/[\r\n\t]+/g, ' ').slice(0, 150);
  return {
    subject: sanitizeSubj(`Order confirmed — ${displayLabel} ${displayId} · ${shopName}`),
    htmlbody,
  };
}

// Calls Zeptomail directly. Used only by the cron processor — never in the hot order path.
export async function sendEmailDirect(params: {
  to: string;
  customerName: string;
  subject: string;
  htmlbody: string;
}): Promise<void> {
  if (!ZEPTOMAIL_API_KEY || !ZEPTOMAIL_FROM_EMAIL) {
    throw new Error('Zeptomail credentials not configured');
  }
  const resp = await fetch('https://api.zeptomail.in/v1.1/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: ZEPTOMAIL_API_KEY,
    },
    body: JSON.stringify({
      from: { address: ZEPTOMAIL_FROM_EMAIL, name: ZEPTOMAIL_FROM_NAME },
      to: [{ email_address: { address: params.to, name: params.customerName } }],
      subject: params.subject,
      htmlbody: params.htmlbody,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.status.toString());
    throw new Error(`Zeptomail ${resp.status}: ${text}`);
  }
}

// Kept for any legacy callers — routes them through build + direct send.
export async function sendOrderConfirmationEmail(
  params: BuildOrderEmailParams & { to: string },
): Promise<void> {
  const { subject, htmlbody } = buildOrderConfirmationEmail(params);
  await sendEmailDirect({ to: params.to, customerName: params.customerName, subject, htmlbody });
}
