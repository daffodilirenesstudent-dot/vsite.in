import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth/verifyFirebaseToken';
import { rateLimit } from '@/lib/platform/rateLimit';
import { escapeHtml as esc } from '@/lib/platform/htmlEscape';
import { QR_STICKER_PRICE_INR, QR_STICKER_LABEL, normaliseStickerQty, stickerOrderTotal } from '@/lib/platform/hardware';

const ZEPTOMAIL_API_KEY    = process.env.ZEPTOMAIL_API_KEY    ?? '';
const ZEPTOMAIL_FROM_EMAIL = process.env.ZEPTOMAIL_FROM_EMAIL ?? '';
const ZEPTOMAIL_FROM_NAME  = process.env.ZEPTOMAIL_FROM_NAME  ?? 'Vsite';

// Soft length caps prevent a malicious authenticated user from blowing up the
// outbound email size, spamming support staff, or burning ZeptoMail quota.
const MAX_FIELD_LEN     = 200;
const MAX_LINE_LEN      = 300;

function cap(s: unknown, max: number): string {
  return String(s ?? '').replace(/[\x00-\x1F\x7F]/g, '').slice(0, max).trim();
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  const userId = await verifyFirebaseToken(token);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit per user — 5 requests per hour. ZeptoMail free tier is 10K/month
  // and `official@vsite.in` doesn't need 100 dupe requests from one merchant.
  const rl = rateLimit(`qr-card:${userId}`, { limit: 5, windowMs: 60 * 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many sticker orders. Please try again in an hour.' },
      { status: 429, headers: { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } }
    );
  }

  // Email passed from client (already authenticated — just for display in the notification email).
  // Capped + escaped before any HTML interpolation; never trusted as routing data.
  const userEmail = cap(req.headers.get('X-User-Email'), MAX_FIELD_LEN) || 'unknown';

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const rawQrType = (body as { qrType?: string }).qrType;
  const qrType: 'common' | 'table' = rawQrType === 'table' ? 'table' : 'common';

  const shopName  = cap((body as { shopName?: unknown }).shopName,   MAX_FIELD_LEN);
  const contactIn = (body as { contact?: { name?: unknown; phone?: unknown } }).contact ?? {};
  const addrIn    = (body as { address?: { line1?: unknown; city?: unknown; state?: unknown; pincode?: unknown; country?: unknown } }).address ?? {};
  const contact = {
    name:  cap(contactIn.name,  MAX_FIELD_LEN),
    phone: cap(contactIn.phone, 30),
  };
  const address = {
    line1:   cap(addrIn.line1,   MAX_LINE_LEN),
    // City was missing entirely, which made every request undeliverable and
    // forced a follow-up call to the owner before the card could be posted.
    city:    cap(addrIn.city,    MAX_FIELD_LEN),
    state:   cap(addrIn.state,   MAX_FIELD_LEN),
    pincode: cap(addrIn.pincode, 20),
    country: cap(addrIn.country, MAX_FIELD_LEN) || 'India',
  };

  if (!shopName || !contact.name || !contact.phone || !address.line1 || !address.city || !address.state || !address.pincode) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // `quantity` is what the current client sends; `tableCount` is kept as a
  // fallback so a cached bundle mid-deploy still books a sane order rather
  // than silently collapsing to one sticker.
  const rawQty = (body as { quantity?: unknown; tableCount?: unknown });
  const stickerCount = normaliseStickerQty(rawQty.quantity ?? rawQty.tableCount);
  // Priced server-side from the shared constant. The client sends a quantity,
  // never an amount — the old flow multiplied a literal 99 here and a literal
  // 99 in the page, which is how they were free to disagree.
  const totalPrice = stickerOrderTotal(stickerCount);

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <tr><td style="background:#5137EF;padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:800;color:#FFFFFF;">New sticker order</p>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.75);">A merchant has ordered ${QR_STICKER_LABEL}s</p>
        </td></tr>

        <tr><td style="padding:28px 32px 0;">

          <p style="margin:0 0 20px;font-size:14px;color:#52525C;line-height:1.6;">
            A new sticker order has been submitted via the Vsite admin dashboard.
          </p>

          <!-- Shop details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
            <tr><td colspan="2" style="padding-bottom:12px;">
              <p style="margin:0;font-size:11px;font-weight:700;color:#71717A;text-transform:uppercase;letter-spacing:1px;">Shop Details</p>
            </td></tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;width:140px;">Shop Name</td>
              <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${esc(shopName)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;">Account Email</td>
              <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${esc(userEmail)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;">Contact Name</td>
              <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${esc(contact.name)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;">Phone</td>
              <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${esc(contact.phone)}</td>
            </tr>
          </table>

          <!-- QR card order -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
            <tr><td colspan="2" style="padding-bottom:12px;">
              <p style="margin:0;font-size:11px;font-weight:700;color:#71717A;text-transform:uppercase;letter-spacing:1px;">Sticker order</p>
            </td></tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;width:140px;">QR Type</td>
              <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${qrType === 'table' ? 'Table QR' : 'Common QR'}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;">Stickers</td>
              <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${esc(stickerCount)} sticker${stickerCount > 1 ? 's' : ''}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;">Rate</td>
              <td style="font-size:14px;color:#0A0A0A;padding:4px 0;">₹${QR_STICKER_PRICE_INR} per sticker</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;font-weight:700;">Total Amount</td>
              <td style="font-size:16px;font-weight:800;color:#5137EF;padding:4px 0;">₹${totalPrice}</td>
            </tr>
          </table>

          <!-- Delivery address -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
            <tr><td colspan="2" style="padding-bottom:12px;">
              <p style="margin:0;font-size:11px;font-weight:700;color:#71717A;text-transform:uppercase;letter-spacing:1px;">Delivery Address</p>
            </td></tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;width:140px;">Address</td>
              <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${esc(address.line1)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;">City</td>
              <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${esc(address.city)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;">State</td>
              <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${esc(address.state)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;">Pin Code</td>
              <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${esc(address.pincode)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#71717A;padding:4px 0;">Country</td>
              <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${esc(address.country)}</td>
            </tr>
          </table>

        </td></tr>

        <tr><td style="padding:0 32px 28px;">
          <div style="border-top:1px solid #E4E4E7;padding-top:20px;">
            <p style="margin:0;font-size:12px;color:#99A1AF;">
              This request was submitted from the Vsite admin dashboard. Reply to <strong>${esc(userEmail)}</strong> to follow up.
            </p>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  if (!ZEPTOMAIL_API_KEY || !ZEPTOMAIL_FROM_EMAIL) {
    console.error('[qr-card-request] Missing ZEPTOMAIL_API_KEY or ZEPTOMAIL_FROM_EMAIL');
    return NextResponse.json({ error: 'Email not configured' }, { status: 500 });
  }

  // Only include reply_to when userEmail is a valid address. Defaulting to
  // 'unknown' (the placeholder used in the HTML body) causes ZeptoMail to
  // reject the request with TM_4001 / SM_113 "Invalid email address".
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);
  const payload = {
    from: { address: ZEPTOMAIL_FROM_EMAIL, name: ZEPTOMAIL_FROM_NAME },
    to: [{ email_address: { address: 'official@vsite.in', name: 'Vsite Team' } }],
    reply_to: isValidEmail ? [{ address: userEmail, name: shopName }] : undefined,
    subject: `Sticker order — ${shopName} (${stickerCount} × ₹${QR_STICKER_PRICE_INR} = ₹${totalPrice})`,
    htmlbody: html,
  };

  const resp = await fetch('https://api.zeptomail.in/v1.1/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: ZEPTOMAIL_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    // Logged, not returned. ZeptoMail's error bodies carry sub-account
    // identifiers and quota state, and this route is reachable by any trial user
    // (2026-09 assessment, Finding 14).
    console.error('[qr-card-request] ZeptoMail error', resp.status, errText);
    return NextResponse.json(
      { error: 'Could not submit your sticker order. Please try again.', code: 'MAIL_SEND_FAILED' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
