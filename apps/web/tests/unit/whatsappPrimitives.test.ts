/**
 * The pure building blocks of the WhatsApp notification layer.
 *
 * Everything with a rule in it — number normalisation, signature checking,
 * sweep windows, template payloads, retry classification and the outbox state
 * machine — is a pure function, so it is pinned here without a database or a
 * network. The routes and the outbox glue are covered in tests/api/.
 */

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

import { toWhatsAppNumber } from '@/lib/notifications/whatsapp/phone';
import { verifyMetaSignature, tokensMatch } from '@/lib/notifications/whatsapp/signature';
import { sweepWindows, isPaid, classifyPlanEvent, classifyTrialEvent } from '@/lib/notifications/whatsapp/windows';
import { buildComponents, TEMPLATES, formatDateIST } from '@/lib/notifications/whatsapp/templates';
import { isRetryable } from '@/lib/notifications/whatsapp/client';
import { nextDeliveryStatus, planFailure, isStale, MAX_ATTEMPTS } from '@/lib/notifications/whatsapp/state';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TRIAL = 7 * DAY;
const NOW = Date.parse('2026-09-22T04:30:00.000Z'); // 10:00 IST, the cron's slot

describe('toWhatsAppNumber', () => {
    it('keeps a +91 E.164 number as bare digits', () => {
        expect(toWhatsAppNumber('+919876543210')).toBe('919876543210');
    });
    it('adds 91 to a bare 10-digit Indian mobile', () => {
        expect(toWhatsAppNumber('98765 43210')).toBe('919876543210');
    });
    it('rejects a 10-digit number that is not an Indian mobile', () => {
        expect(toWhatsAppNumber('0123456789')).toBeNull();
    });
    it('rejects empty, null and junk', () => {
        expect(toWhatsAppNumber('')).toBeNull();
        expect(toWhatsAppNumber(null)).toBeNull();
        expect(toWhatsAppNumber(undefined)).toBeNull();
        expect(toWhatsAppNumber('12')).toBeNull();
    });
    it('keeps a valid foreign E.164 number', () => {
        expect(toWhatsAppNumber('+14155550123')).toBe('14155550123');
    });
});

describe('verifyMetaSignature', () => {
    const secret = 'app-secret';
    const body = '{"object":"whatsapp_business_account","entry":[]}';
    const good = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

    it('accepts the HMAC of the raw body', () => {
        expect(verifyMetaSignature(body, good, secret)).toBe(true);
    });
    it('rejects a signature over a different body (re-serialised JSON)', () => {
        expect(verifyMetaSignature(body.replace(':', ': '), good, secret)).toBe(false);
    });
    it('rejects a missing, unprefixed, truncated or non-hex header', () => {
        expect(verifyMetaSignature(body, null, secret)).toBe(false);
        expect(verifyMetaSignature(body, good.slice(7), secret)).toBe(false);
        expect(verifyMetaSignature(body, good.slice(0, 20), secret)).toBe(false);
        expect(verifyMetaSignature(body, 'sha256=' + 'z'.repeat(64), secret)).toBe(false);
    });
    it('rejects everything when the secret is empty', () => {
        const emptySig = 'sha256=' + crypto.createHmac('sha256', '').update(body).digest('hex');
        expect(verifyMetaSignature(body, emptySig, '')).toBe(false);
    });
});

describe('tokensMatch', () => {
    it('matches equal tokens and nothing else', () => {
        expect(tokensMatch('abc', 'abc')).toBe(true);
        expect(tokensMatch('abc', 'abd')).toBe(false);
        expect(tokensMatch('abc', 'abcd')).toBe(false);
        expect(tokensMatch('', '')).toBe(false);
    });
});

describe('sweep windows', () => {
    const w = sweepWindows(NOW);

    it('trial query spans trial-ended (30h back) to trial-ending (48h ahead)', () => {
        expect(w.trialEnds.gt).toBe(new Date(NOW - 30 * HOUR).toISOString());
        expect(w.trialEnds.lte).toBe(new Date(NOW + 48 * HOUR).toISOString());
    });
    it('plan query spans expired (30h back) to T-3 (78h ahead)', () => {
        expect(w.planExpires.gt).toBe(new Date(NOW - 30 * HOUR).toISOString());
        expect(w.planExpires.lte).toBe(new Date(NOW + 78 * HOUR).toISOString());
    });

    it('classifies a trial by when it ends', () => {
        expect(classifyTrialEvent(NOW + 36 * HOUR, NOW)).toBe('trial_ending');
        expect(classifyTrialEvent(NOW - 2 * HOUR, NOW)).toBe('trial_ended');
        expect(classifyTrialEvent(NOW + 60 * HOUR, NOW)).toBeNull();
        expect(classifyTrialEvent(NOW - 40 * HOUR, NOW)).toBeNull();
        expect(classifyTrialEvent(0, NOW)).toBeNull(); // no trial at all
    });

    it('classifies a paid plan by when it expires', () => {
        expect(classifyPlanEvent(NOW + 70 * HOUR, NOW)).toBe('plan_expiring');
        expect(classifyPlanEvent(NOW + 30 * HOUR, NOW)).toBe('plan_expiring');
        expect(classifyPlanEvent(NOW + 5 * HOUR, NOW)).toBe('plan_expires_today');
        expect(classifyPlanEvent(NOW - 5 * HOUR, NOW)).toBe('plan_expired');
        expect(classifyPlanEvent(NOW + 90 * HOUR, NOW)).toBeNull();
        expect(classifyPlanEvent(NOW - 40 * HOUR, NOW)).toBeNull();
    });

    it('treats only a future store_expires_at as paid', () => {
        expect(isPaid('2026-10-01T00:00:00Z', NOW)).toBe(true);
        expect(isPaid('2026-09-01T00:00:00Z', NOW)).toBe(false);
        expect(isPaid(null, NOW)).toBe(false);
        expect(isPaid('not a date', NOW)).toBe(false);
    });
});

describe('templates', () => {
    it('welcome carries the QR as an image header and the body params in order', () => {
        const c = buildComponents('welcome', {
            shopName: 'Anna Cafe', menuUrl: 'https://vsite.in/shop/anna-cafe',
            qrImageUrl: 'https://vsite.in/api/qr/anna-cafe', trialEndsOn: '29 Sept 2026',
        });
        expect(c).toEqual([
            { type: 'header', parameters: [{ type: 'image', image: { link: 'https://vsite.in/api/qr/anna-cafe' } }] },
            { type: 'body', parameters: [
                { type: 'text', text: 'Anna Cafe' },
                { type: 'text', text: 'https://vsite.in/shop/anna-cafe' },
                { type: 'text', text: '29 Sept 2026' },
            ] },
        ]);
    });

    it('text-only templates have no header component', () => {
        const c = buildComponents('plan_expired', { shopName: 'Anna Cafe' });
        expect(c).toEqual([{ type: 'body', parameters: [{ type: 'text', text: 'Anna Cafe' }] }]);
    });

    it('throws on a missing param instead of sending a broken template (Meta 132000)', () => {
        expect(() => buildComponents('payment_receipt', { amountInr: '299' })).toThrow(/validTill/);
    });

    it('strips newlines and caps length — Meta rejects both in text params', () => {
        const c = buildComponents('plan_expired', { shopName: 'A\nB\tC' + 'x'.repeat(2000) });
        const text = (c[0].parameters[0] as { text: string }).text;
        expect(text).not.toMatch(/[\n\t]/);
        expect(text.length).toBeLessThanOrEqual(200);
    });

    it('every v1 event has a registered template name', () => {
        expect(Object.keys(TEMPLATES).sort()).toEqual([
            'payment_receipt', 'plan_expired', 'plan_expires_today', 'plan_expiring',
            'trial_ended', 'trial_ending', 'welcome',
        ]);
    });

    it('formats dates in IST', () => {
        // 20:00 UTC on the 28th is already the 29th in India.
        expect(formatDateIST('2026-09-28T20:00:00Z')).toMatch(/29/);
    });
});

describe('isRetryable', () => {
    it('retries throttling, unknown and server errors', () => {
        for (const code of [4, 80007, 130429, 131000, 131056]) expect(isRetryable(code, 400)).toBe(true);
        expect(isRetryable(null, 503)).toBe(true);
        expect(isRetryable(null, 0)).toBe(true); // network / timeout
    });
    it('never retries auth, template or recipient errors', () => {
        for (const code of [0, 190, 368, 131026, 131047, 132000, 132001, 132012, 133010]) {
            expect(isRetryable(code, 400)).toBe(false);
        }
    });
});

describe('outbox state machine', () => {
    it('delivery statuses only move forward', () => {
        expect(nextDeliveryStatus('sent', 'delivered')).toBe('delivered');
        expect(nextDeliveryStatus('delivered', 'read')).toBe('read');
        expect(nextDeliveryStatus('read', 'delivered')).toBeNull();
        expect(nextDeliveryStatus('delivered', 'sent')).toBeNull();
        expect(nextDeliveryStatus('sending', 'sent')).toBe('sent');
    });
    it('a webhook failure is terminal unless the row is already read', () => {
        expect(nextDeliveryStatus('sent', 'failed')).toBe('dead');
        expect(nextDeliveryStatus('read', 'failed')).toBeNull();
    });
    it('ignores unknown statuses and rows the webhook must not touch', () => {
        expect(nextDeliveryStatus('sent', 'deleted')).toBeNull();
        expect(nextDeliveryStatus('skipped', 'delivered')).toBeNull();
    });

    it('backs off 5m·4^n and gives up after MAX_ATTEMPTS', () => {
        const a1 = planFailure(1, true, NOW);
        expect(a1.status).toBe('failed');
        expect(a1.nextAttemptAt).toBe(new Date(NOW + 5 * 60_000).toISOString());
        expect(planFailure(2, true, NOW).nextAttemptAt).toBe(new Date(NOW + 20 * 60_000).toISOString());
        expect(planFailure(MAX_ATTEMPTS, true, NOW).status).toBe('dead');
    });
    it('a permanent error is dead on the first attempt', () => {
        expect(planFailure(1, false, NOW).status).toBe('dead');
    });

    it('rows older than 48h are stale — enabling late cannot blast old messages', () => {
        expect(isStale(new Date(NOW - 47 * HOUR).toISOString(), NOW)).toBe(false);
        expect(isStale(new Date(NOW - 49 * HOUR).toISOString(), NOW)).toBe(true);
    });
});
