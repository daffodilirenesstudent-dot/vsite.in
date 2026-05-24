// Plan-lifecycle transactional emails: activation invoice + T-3 expiry reminder.
// Both share a single styled HTML shell so the two messages feel like part of
// the same SaaS lifecycle conversation rather than ad-hoc templates.

import { escapeHtml as esc } from '@/lib/htmlEscape';
import { sendZeptoMail, type ZeptoRecipient } from './sendZeptoMail';

// Plan-lifecycle mail. The from-ADDRESS must be a sender that's been
// verified in your ZeptoMail account — using an unverified address causes
// ZeptoMail to return 401 and the email silently fails.
//
// Default behaviour: fall back to ZEPTOMAIL_FROM_EMAIL (the same verified
// sender the order-confirmation flow uses — known to work). Override with
// ZEPTOMAIL_BILLING_FROM_EMAIL once you've verified `billing@vsite.in`
// (ZeptoMail → Mail Agents → your agent → Email Addresses → Add → Verify).
//
// The display NAME is always "Vsite Billing" so inboxes still group plan
// emails as billing communication regardless of the underlying address.
// Empty address → sendZeptoMail keeps the verified ZEPTOMAIL_FROM_EMAIL.
// Display name is always overridden so inboxes show "Vsite Billing".
const INVOICE_FROM: ZeptoRecipient = {
  address: process.env.ZEPTOMAIL_BILLING_FROM_EMAIL ?? '',
  name:    'Vsite Billing',
};

const PLAN_LABELS: Record<string, string> = {
  qr_menu:  'Smart QR Menu',
  base:     'Smart QR Menu',
  qr_order: 'QR Ordering',
  pro:      'Pay & Eat',
  pay_eat:  'Pay & Eat',
};

function planLabel(plan: string): string {
  return PLAN_LABELS[plan] ?? plan;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtMoney(amount: number, currency: string): string {
  const sym = currency === 'INR' ? '₹' : currency + ' ';
  return `${sym}${amount.toLocaleString('en-IN')}`;
}

function shell(headerColor: string, title: string, subtitle: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:${headerColor};padding:28px 32px;">
          <p style="margin:0;font-size:22px;font-weight:800;color:#FFFFFF;">${esc(title)}</p>
          <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.85);">${esc(subtitle)}</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">${bodyHtml}</td></tr>
        <tr><td style="padding:0 32px 28px;">
          <div style="border-top:1px solid #E4E4E7;padding-top:16px;">
            <p style="margin:0;font-size:11px;color:#A1A1AA;line-height:1.6;">
              You're receiving this because this address is set as a billing-notification email
              on your Vsite store. Update or remove it any time from Settings → Store details.
            </p>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ─── 1. Plan activated → invoice ─────────────────────────────────────────────

export interface SendPlanInvoiceArgs {
  recipients:       ZeptoRecipient[];   // notification_emails + account owner
  shopName:         string;
  plan:             string;
  amount:           number;             // major units, e.g. 300 for ₹300
  currency:         string;             // 'INR' | 'AED'
  razorpayPaymentId: string;
  activatedAt:      string;             // ISO
  expiresAt:        string;             // ISO
}

export async function sendPlanInvoiceEmail(args: SendPlanInvoiceArgs) {
  const label = planLabel(args.plan);
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0A0A0A;line-height:1.6;">
      Hi ${esc(args.shopName)} team — your <strong>${esc(label)}</strong> plan is now active.
      Thanks for choosing Vsite.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;border-radius:12px;padding:20px 24px;margin-bottom:20px;">
      <tr><td colspan="2" style="padding-bottom:12px;">
        <p style="margin:0;font-size:11px;font-weight:700;color:#71717A;text-transform:uppercase;letter-spacing:1px;">Invoice</p>
      </td></tr>
      <tr>
        <td style="font-size:13px;color:#71717A;padding:4px 0;width:160px;">Plan</td>
        <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${esc(label)} — Monthly</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#71717A;padding:4px 0;">Amount paid</td>
        <td style="font-size:14px;font-weight:600;color:#0A0A0A;padding:4px 0;">${esc(fmtMoney(args.amount, args.currency))}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#71717A;padding:4px 0;">Payment reference</td>
        <td style="font-size:13px;font-family:monospace;color:#0A0A0A;padding:4px 0;">${esc(args.razorpayPaymentId)}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#71717A;padding:4px 0;">Activated on</td>
        <td style="font-size:14px;color:#0A0A0A;padding:4px 0;">${esc(fmtDate(args.activatedAt))}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#71717A;padding:4px 0;font-weight:700;">Valid until</td>
        <td style="font-size:15px;font-weight:700;color:#5137EF;padding:4px 0;">${esc(fmtDate(args.expiresAt))}</td>
      </tr>
    </table>

    <p style="margin:0 0 18px;font-size:13px;color:#52525C;line-height:1.6;">
      Your store stays live for 30 days. We'll send a reminder 3 days before the plan expires
      so there's no interruption to your menu or orders.
    </p>

    <a href="https://vsite.in/manage/subscription"
       style="display:inline-block;background:#5137EF;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:10px;">
      View subscription
    </a>
  `;
  return sendZeptoMail({
    from: INVOICE_FROM,
    to: args.recipients,
    subject: `Invoice — ${label} plan activated (${args.shopName})`,
    htmlBody: shell('#5137EF', 'Plan activated', `${label} · Valid till ${fmtDate(args.expiresAt)}`, body),
  });
}

// ─── 2. Plan expiring in 3 days → reminder ───────────────────────────────────

export interface SendExpiryReminderArgs {
  recipients: ZeptoRecipient[];
  shopName:   string;
  plan:       string;
  expiresAt:  string;       // ISO
  daysLeft:   number;       // typically 3
}

export async function sendExpiryReminderEmail(args: SendExpiryReminderArgs) {
  const label = planLabel(args.plan);
  const dateStr = fmtDate(args.expiresAt);
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#0A0A0A;line-height:1.6;">
      Your <strong>${esc(label)}</strong> plan for <strong>${esc(args.shopName)}</strong>
      is ending soon.
    </p>

    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:18px 22px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;color:#92400E;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
        ${args.daysLeft} day${args.daysLeft === 1 ? '' : 's'} left
      </p>
      <p style="margin:6px 0 0;font-size:17px;font-weight:700;color:#0A0A0A;">
        Expires on ${esc(dateStr)}
      </p>
    </div>

    <p style="margin:0 0 18px;font-size:13px;color:#52525C;line-height:1.6;">
      Renew before the expiry date to keep your menu live, orders flowing, and your QR codes active.
      Renewing now extends your existing days — you won't lose what's left of this cycle.
    </p>

    <a href="https://vsite.in/manage/subscription"
       style="display:inline-block;background:#5137EF;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:10px;">
      Renew now
    </a>
  `;
  return sendZeptoMail({
    from: INVOICE_FROM,
    to: args.recipients,
    subject: `Your ${label} plan expires in ${args.daysLeft} day${args.daysLeft === 1 ? '' : 's'}`,
    htmlBody: shell('#D97706', 'Plan ending soon', `${label} · Expires ${dateStr}`, body),
  });
}
