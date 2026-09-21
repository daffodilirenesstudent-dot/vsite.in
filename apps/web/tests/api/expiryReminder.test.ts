/**
 * The T-3 expiry reminder must reach every store with a paid window closing.
 *
 * ── The bug these tests pin down ────────────────────────────────────────────
 * `razorpay_status` was doing two incompatible jobs on one column:
 *
 *   1. the replay guard on activation — verify-payment and the Razorpay webhook
 *      both activate only `.eq('razorpay_status', 'created')`, so the column has
 *      to be knocked back to 'created' every time an order is issued;
 *   2. "is this a live paying subscription?", which is how the reminder sweep
 *      was reading it (`.eq('razorpay_status', 'active')`).
 *
 * create-subscription upserts `razorpay_status: 'created'` the moment an order
 * is created — including for a customer who is ALREADY paid and active and is
 * simply renewing early. If that customer then abandons the Razorpay modal
 * (closes it, card declined, changes their mind), the row stays 'created' with
 * `store_expires_at` still in the future. Job 1 is satisfied; job 2 now reads
 * false for a paying customer, and the sweep skipped them for good.
 *
 * The result was silent and hit the customers most likely to renew: they got no
 * warning, their store went dark when the window lapsed, and the first signal
 * was a support message. Nothing errored anywhere.
 *
 * The fix is to stop asking `razorpay_status` the second question. A future
 * `store_expires_at` IS the paid window — the column is NULL by default
 * (migration 010) and is only ever written by verify-payment and the webhook,
 * i.e. only after money has actually been captured. So the window plus
 * `expiry_reminder_sent_at IS NULL` already says exactly what the sweep means,
 * and says it without depending on the activation state machine.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const sendExpiryReminderEmail = vi.fn(async (_args: unknown) => ({ ok: true as const }));
vi.mock('@/lib/notifications/email/planEmails', () => ({
    sendExpiryReminderEmail: (a: unknown) => sendExpiryReminderEmail(a),
    sendPlanInvoiceEmail: vi.fn(async () => ({ ok: true })),
}));

interface Row {
    site_id: string;
    user_id: string;
    store_plan: string;
    store_expires_at: string | null;
    razorpay_status: string | null;
    expiry_reminder_sent_at: string | null;
    sites: { name: string; notification_emails: string[] | null } | null;
}

/** The table the sweep reads, as a real dataset the mock filters over. */
let rows: Row[] = [];

/**
 * A Supabase chain that actually APPLIES its filters, rather than recording
 * them. A mock returning a fixed array would have passed happily both before
 * and after the fix — the bug lives entirely in which rows come back.
 */
function chainFor() {
    const filters: Array<{ op: string; col: string; val: unknown }> = [];
    let pending: Record<string, unknown> | null = null;

    const matches = (r: Row) =>
        filters.every(({ op, col, val }) => {
            const v = (r as unknown as Record<string, unknown>)[col];
            if (op === 'eq') return v === val;
            if (op === 'is') return v === val;
            if (op === 'gt') return v != null && String(v) > String(val);
            if (op === 'lt') return v != null && String(v) < String(val);
            return true;
        });

    const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((col: string, val: unknown) => { filters.push({ op: 'eq', col, val }); return chain; }),
        is: vi.fn((col: string, val: unknown) => { filters.push({ op: 'is', col, val }); return chain; }),
        gt: vi.fn((col: string, val: unknown) => { filters.push({ op: 'gt', col, val }); return chain; }),
        lt: vi.fn((col: string, val: unknown) => { filters.push({ op: 'lt', col, val }); return chain; }),
        update: vi.fn((args: Record<string, unknown>) => { pending = args; return chain; }),
        then(resolve: (v: { data: unknown; error: null }) => void) {
            const hit = rows.filter(matches);
            if (pending) {
                const args = pending;
                hit.forEach(r => Object.assign(r, args));
                pending = null;
            }
            return resolve({ data: hit, error: null });
        },
    };
    return chain;
}

vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: { from: vi.fn(() => chainFor()), rpc: vi.fn(async () => ({ error: null })) },
}));

import { GET as expiryGet } from '@/app/api/cron/expiry-reminder/route';

const SECRET = 'test-cron-secret';
const inDays = (d: number) => new Date(Date.now() + d * 24 * 60 * 60_000).toISOString();

function cronReq() {
    return new NextRequest('https://vsite.in/api/cron/expiry-reminder', {
        method: 'GET',
        headers: new Headers({ authorization: 'Bearer ' + SECRET }),
    });
}

function row(over: Partial<Row> = {}): Row {
    return {
        site_id: 'site-1',
        user_id: 'user-1',
        store_plan: 'qr_menu',
        store_expires_at: inDays(2),
        razorpay_status: 'active',
        expiry_reminder_sent_at: null,
        sites: { name: 'Placeholder Cafe', notification_emails: ['owner@example.test'] },
        ...over,
    };
}

beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    sendExpiryReminderEmail.mockClear();
    rows = [];
});

describe('expiry reminder sweep', () => {
    it('reminds a straightforwardly active store expiring in 2 days', async () => {
        rows = [row()];
        await expiryGet(cronReq());
        expect(sendExpiryReminderEmail).toHaveBeenCalledTimes(1);
    });

    it('reminds a paid store that abandoned an early renewal', async () => {
        // Paid through in 2 days, but they opened the renewal modal and closed
        // it — create-subscription already knocked the status back to 'created'.
        rows = [row({ razorpay_status: 'created' })];
        await expiryGet(cronReq());
        expect(
            sendExpiryReminderEmail,
            'a paying customer mid-renewal must still be warned',
        ).toHaveBeenCalledTimes(1);
    });

    it('marks the row so a second sweep does not email twice', async () => {
        rows = [row({ razorpay_status: 'created' })];
        await expiryGet(cronReq());
        await expiryGet(cronReq());
        expect(sendExpiryReminderEmail).toHaveBeenCalledTimes(1);
        expect(rows[0].expiry_reminder_sent_at).not.toBeNull();
    });

    it('ignores a store that never paid (no expiry window)', async () => {
        // store_expires_at NULL is the default: an order was created but never
        // captured, so there is no paid window to warn about.
        rows = [row({ store_expires_at: null, razorpay_status: 'created' })];
        await expiryGet(cronReq());
        expect(sendExpiryReminderEmail).not.toHaveBeenCalled();
    });

    it('ignores a window that already lapsed', async () => {
        rows = [row({ store_expires_at: inDays(-1) })];
        await expiryGet(cronReq());
        expect(sendExpiryReminderEmail).not.toHaveBeenCalled();
    });

    it('ignores a window far outside the reminder horizon', async () => {
        rows = [row({ store_expires_at: inDays(20) })];
        await expiryGet(cronReq());
        expect(sendExpiryReminderEmail).not.toHaveBeenCalled();
    });

    it('still refuses an unauthenticated caller', async () => {
        rows = [row()];
        const res = await expiryGet(
            new NextRequest('https://vsite.in/api/cron/expiry-reminder', { method: 'GET' }),
        );
        expect(res.status).toBe(401);
        expect(sendExpiryReminderEmail).not.toHaveBeenCalled();
    });
});
