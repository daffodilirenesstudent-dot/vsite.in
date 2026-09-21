import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Email notifications are removed (owner decision, 2026-09-21). Notifications
 * move to a WhatsApp layer, built next; until then the in-app bell (notify())
 * is the only notification channel, and it is untouched.
 *
 * Removed: the ZeptoMail sender, the email_queue drain cron, the plan-expiry
 * reminder email and its cron, plan-invoice emails from verify-payment and the
 * Razorpay webhook, order-confirmation emails in the (frozen) order routes, and
 * the "notification emails" section of Settings.
 *
 * NOT removed: /api/manage/qr-card-request. It emails the vsite TEAM, not the
 * owner, and it is the only record of a physical QR-card order — removing it
 * would silently drop orders. It waits for its own decision.
 */

const ROOT = resolve(__dirname, '../..');
const SRC = join(ROOT, 'src');
const KEPT = new Set(['app/api/manage/qr-card-request/route.ts']);

function files(dir: string): string[] {
    const SOURCE = /\.(tsx?|jsx?)$/;
    return readdirSync(dir).flatMap((e) => {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) return files(p);
        return SOURCE.test(p) ? [p] : [];
    });
}

const sources = files(SRC)
    .map((p) => ({ path: relative(SRC, p).split(sep).join('/'), text: readFileSync(p, 'utf8') }))
    .filter((f) => !KEPT.has(f.path));

function offenders(pattern: RegExp): string[] {
    return sources.filter((f) => pattern.test(f.text)).map((f) => f.path);
}

describe('email notification layer is gone', () => {
    it('has no email sender module left', () => {
        expect(existsSync(join(SRC, 'lib/notifications/email'))).toBe(false);
        expect(offenders(/@\/lib\/notifications\/email/)).toEqual([]);
        expect(offenders(/sendEmailDirect|buildOrderConfirmationEmail|sendOrderConfirmationEmail/)).toEqual([]);
    });

    it('no longer queues or drains email', () => {
        expect(offenders(/email_queue/)).toEqual([]);
        expect(existsSync(join(SRC, 'app/api/cron/process-emails'))).toBe(false);
    });

    it('has no expiry-reminder email job', () => {
        expect(existsSync(join(SRC, 'app/api/cron/expiry-reminder'))).toBe(false);
    });

    it('does not read or write notification_emails anywhere', () => {
        expect(offenders(/notification_emails/)).toEqual([]);
    });

    it('does not schedule the removed jobs', () => {
        const spec = readFileSync(join(ROOT, '.do/app.yaml'), 'utf8');
        expect(spec).not.toMatch(/process-emails/);
        expect(spec).not.toMatch(/expiry-reminder/);
    });
});

describe('what stays', () => {
    it('keeps the order-status link token, which was never an email feature', async () => {
        const { signOrderToken, verifyOrderToken } = await import('@/lib/orders/orderToken');
        expect(verifyOrderToken(signOrderToken('order-1'))).toBe('order-1');
    });

    it('keeps the in-app notification bell', () => {
        expect(existsSync(join(SRC, 'lib/notifications/notify.ts'))).toBe(true);
    });
});
