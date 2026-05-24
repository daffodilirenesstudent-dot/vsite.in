// Thin wrapper around the ZeptoMail v1.1 send-email API. Centralised so all
// outbound transactional mail (qr-card requests, plan invoices, expiry
// reminders) shares one well-tested code path and one place to swap providers
// if we ever migrate off ZeptoMail.

const ZEPTOMAIL_API_KEY    = process.env.ZEPTOMAIL_API_KEY    ?? '';
const ZEPTOMAIL_FROM_EMAIL = process.env.ZEPTOMAIL_FROM_EMAIL ?? '';
const ZEPTOMAIL_FROM_NAME  = process.env.ZEPTOMAIL_FROM_NAME  ?? 'Vsite';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ZeptoRecipient { address: string; name?: string }

export interface SendMailArgs {
  to:        ZeptoRecipient | ZeptoRecipient[];
  subject:   string;
  htmlBody:  string;
  /** Optional reply-to override; silently dropped if invalid. */
  replyTo?:  ZeptoRecipient;
  /** Optional cc recipients; invalid addresses are silently filtered. */
  cc?:       ZeptoRecipient[];
  /** Optional from override. Address must be a verified sender in ZeptoMail. */
  from?:     ZeptoRecipient;
}

export interface SendMailResult { ok: boolean; status: number; error?: string }

/**
 * Sends a transactional email via ZeptoMail. Returns { ok: false } instead of
 * throwing so callers can decide whether a failed email should fail the whole
 * request (it usually shouldn't — payment activation must not be reverted
 * because an invoice email bounced).
 */
export async function sendZeptoMail(args: SendMailArgs): Promise<SendMailResult> {
  if (!ZEPTOMAIL_API_KEY || !ZEPTOMAIL_FROM_EMAIL) {
    console.error('[sendZeptoMail] Missing ZEPTOMAIL_API_KEY or ZEPTOMAIL_FROM_EMAIL');
    return { ok: false, status: 0, error: 'Email not configured' };
  }

  const toList = Array.isArray(args.to) ? args.to : [args.to];
  const toValid = toList.filter(r => EMAIL_RE.test(r.address));
  if (toValid.length === 0) {
    return { ok: false, status: 0, error: 'No valid recipient addresses' };
  }

  const fromAddress = args.from?.address && EMAIL_RE.test(args.from.address)
    ? args.from.address
    : ZEPTOMAIL_FROM_EMAIL;
  const fromName = args.from?.name ?? ZEPTOMAIL_FROM_NAME;

  const payload: Record<string, unknown> = {
    from:    { address: fromAddress, name: fromName },
    to:      toValid.map(r => ({ email_address: { address: r.address, name: r.name ?? '' } })),
    subject: args.subject,
    htmlbody: args.htmlBody,
  };

  if (args.cc?.length) {
    const ccValid = args.cc.filter(r => EMAIL_RE.test(r.address));
    if (ccValid.length) payload.cc = ccValid.map(r => ({ email_address: { address: r.address, name: r.name ?? '' } }));
  }
  if (args.replyTo && EMAIL_RE.test(args.replyTo.address)) {
    payload.reply_to = [{ address: args.replyTo.address, name: args.replyTo.name ?? '' }];
  }

  try {
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
      console.error('[sendZeptoMail] error', resp.status, errText);
      return { ok: false, status: resp.status, error: errText };
    }
    return { ok: true, status: resp.status };
  } catch (err) {
    console.error('[sendZeptoMail] network error', err);
    return { ok: false, status: 0, error: (err as Error).message };
  }
}
