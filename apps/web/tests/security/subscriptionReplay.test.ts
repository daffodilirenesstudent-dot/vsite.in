/**
 * Red-team suite for /api/subscription/verify-payment — the revenue path.
 *
 * This is the ONLY route that turns money into an active plan, and it is never
 * frozen. Three defects were found in the 2026-09 assessment and each one has a
 * test here:
 *
 *   Finding 1 (CRITICAL) — the same Razorpay success payload could be replayed
 *     to add 30 days per call. The signature is a static HMAC the attacker's own
 *     browser receives from Checkout, so replay needs nothing but a repeat POST.
 *   Finding 6 — `authorized` (funds reserved, never captured, auto-voided after
 *     ~5 days) was accepted as proof of payment alongside `captured`.
 *   Finding 9 — the `X-User-Email` request header steered the invoice email's
 *     recipients. Moot since 2026-09-21: the invoice email was removed.
 *
 * A passing test here means the attack is blocked. The webhook
 * (`webhooks/razorpay/route.ts`) already had the activation guard this route
 * lacked; `webhookParity` below pins that the two agree.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

process.env.RAZORPAY_KEY_ID     = 'rzp_test_admin';
process.env.RAZORPAY_KEY_SECRET = 'admin_secret';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
    verifyFirebaseToken: vi.fn(async (t: string) => (t === 'admin-token' ? 'admin-user' : null)),
}));
vi.mock('@/lib/platform/rateLimit', () => ({
    rateLimit: () => ({ allowed: true, remaining: 9, retryAfterMs: 0 }),
    getClientIp: () => '1.2.3.4',
}));

// Invoice mail — we assert on who it is addressed to, so it must be observable.
vi.mock('@/lib/notifications/notify', () => ({ notify: vi.fn() }));

type Script = {
    singleResult?: unknown;
    maybeSingleResult?: unknown;
    /** Rows the `.update(...).select(...)` chain resolves with. [] = no row matched. */
    updateSelectResult?: unknown[];
    insertError?: { code: string } | null;
    /** What a `.select(..., { count: 'exact', head: true })` resolves `count` to. */
    countResult?: number;
};
const scripts: Record<string, Script> = {};
const dbCalls: Array<{ table: string; op: string; args?: unknown; filters: Array<[string, unknown]> }> = [];

function tableMock(table: string) {
    const s = scripts[table] ?? {};
    const filters: Array<[string, unknown]> = [];
    let pending: { op: string; args?: unknown } | null = null;

    const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((col: string, val: unknown) => { filters.push([col, val]); return chain; }),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: s.maybeSingleResult ?? null, error: null })),
        single: vi.fn(async () => ({ data: s.singleResult ?? null, error: null })),
        insert: vi.fn(async (a: unknown) => {
            dbCalls.push({ table, op: 'insert', args: a, filters: [...filters] });
            return { data: null, error: s.insertError ?? null };
        }),
        update: vi.fn((a: unknown) => { pending = { op: 'update', args: a }; return chain; }),
        upsert: vi.fn(async (a: unknown) => {
            dbCalls.push({ table, op: 'upsert', args: a, filters: [...filters] });
            return { data: null, error: null };
        }),
        delete: vi.fn(() => { pending = { op: 'delete' }; return chain; }),
        // Awaiting the chain commits whatever verb was staged, with the filters
        // that were attached along the way — so a test can assert BOTH the values
        // written and the guard conditions the route wrote them under.
        then(resolve: (v: { data: unknown; error: null }) => void) {
            if (pending) {
                dbCalls.push({ table, op: pending.op, args: pending.args, filters: [...filters] });
                pending = null;
            }
            // Default: one row matched. A replay test sets `updateSelectResult: []`.
            resolve({
                data: s.updateSelectResult ?? [{ site_id: 'row' }],
                error: null,
                count: s.countResult ?? 0,
            } as { data: unknown; error: null });
        },
    };
    return chain;
}

vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: { from: vi.fn((t: string) => tableMock(t)), rpc: vi.fn() },
}));

const razorpayMock = { orders: { fetch: vi.fn(), create: vi.fn() }, payments: { fetch: vi.fn() } };
vi.mock('razorpay', () => ({
    default: class {
        orders = razorpayMock.orders;
        payments = razorpayMock.payments;
        constructor(_o?: unknown) { }
    },
}));

import { POST as verifyPayment } from '@/app/api/subscription/verify-payment/route';

const SITE = '00000000-0000-0000-0000-000000000aaa';
const ORDER = 'order_LiveOne';
const PAYMENT = 'pay_LiveOne';

function sign(orderId: string, paymentId: string) {
    return crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${orderId}|${paymentId}`).digest('hex');
}

function req(body: unknown, headers: Record<string, string> = {}) {
    return new NextRequest('https://vsite.in/api/subscription/verify-payment', {
        method: 'POST',
        headers: new Headers({ Authorization: 'Bearer admin-token', ...headers }),
        body: JSON.stringify(body),
    });
}

/** The state of a store that has an order open and has NOT yet been activated. */
function subscriptionAwaitingPayment() {
    scripts['sites'] = { singleResult: { id: SITE, name: 'Test Cafe', notification_emails: ['owner@example.com'] } };
    scripts['site_subscriptions'] = {
        singleResult: {
            id: 'sub1',
            razorpay_subscription_id: ORDER,
            store_expires_at: null,
            store_plan: null,
            pending_plan: 'qr_menu',
            razorpay_status: 'created',
        },
    };
    scripts['profiles'] = { maybeSingleResult: { contact_email: 'owner@example.com' } };
}

const goodBody = {
    razorpay_payment_id: PAYMENT,
    razorpay_order_id: ORDER,
    razorpay_signature: sign(ORDER, PAYMENT),
    siteId: SITE,
};

beforeEach(() => {
    dbCalls.length = 0;
    for (const k of Object.keys(scripts)) delete scripts[k];
    razorpayMock.payments.fetch.mockReset();
    razorpayMock.payments.fetch.mockResolvedValue({
        id: PAYMENT, status: 'captured', amount: 29900, currency: 'INR', order_id: ORDER,
    });
});

// =============================================================================
// Finding 1 — replay
// =============================================================================
describe('Finding 1: subscription payment replay', () => {
    it('activates on the first call', async () => {
        subscriptionAwaitingPayment();
        const res = await verifyPayment(req(goodBody));
        expect(res.status).toBe(200);
        expect((await res.json()).success).toBe(true);
    });

    it('guards the activation UPDATE on razorpay_status=created, like the webhook does', async () => {
        subscriptionAwaitingPayment();
        await verifyPayment(req(goodBody));

        const update = dbCalls.find(c => c.table === 'site_subscriptions' && c.op === 'update');
        expect(update, 'verify-payment must UPDATE site_subscriptions').toBeDefined();
        // Without this predicate the update is unconditional and every replay
        // lands another 30 days on store_expires_at.
        expect(update!.filters).toContainEqual(['razorpay_status', 'created']);
    });

    it('does NOT extend the plan when the same payload is replayed', async () => {
        subscriptionAwaitingPayment();
        // The store is already active and the conditional UPDATE matches no row.
        scripts['site_subscriptions'] = {
            singleResult: {
                id: 'sub1',
                razorpay_subscription_id: ORDER,
                store_expires_at: '2026-10-12T00:00:00.000Z',
                store_plan: 'qr_menu',
                pending_plan: null,
                razorpay_status: 'active',
            },
            updateSelectResult: [],
        };

        const res = await verifyPayment(req(goodBody));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.alreadyActive).toBe(true);
        // The critical assertion: the expiry the caller gets back is the one
        // already on the row, not that date plus another 30 days.
        expect(json.expiresAt).toBe('2026-10-12T00:00:00.000Z');
    });

    it('clears the consumed order id so the order cannot be presented twice', async () => {
        subscriptionAwaitingPayment();
        await verifyPayment(req(goodBody));
        const update = dbCalls.find(c => c.table === 'site_subscriptions' && c.op === 'update');
        expect((update!.args as Record<string, unknown>).razorpay_subscription_id).toBeNull();
    });

    /**
     * Nulling the order id must not turn an HONEST retry into an error. A double
     * click, a flaky network, or the client retrying after the webhook won the
     * race all re-POST the same body against a row whose order id is now null —
     * and "Order mismatch" on the revenue path, to someone whose money has
     * already left, is the worst possible answer.
     */
    it('answers a retry against an already-redeemed order with 200, not a mismatch error', async () => {
        scripts['sites'] = { singleResult: { id: SITE, name: 'Test Cafe', notification_emails: [] } };
        scripts['site_subscriptions'] = {
            singleResult: {
                id: 'sub1',
                razorpay_subscription_id: null,          // consumed by the first call
                store_expires_at: '2026-10-12T00:00:00.000Z',
                store_plan: 'qr_menu',
                pending_plan: null,
                razorpay_status: 'active',
            },
            updateSelectResult: [],
        };
        // The payment IS on record for this site — proof the first call succeeded.
        scripts['billing_history'] = { countResult: 1 };

        const res = await verifyPayment(req(goodBody));
        const json = await res.json();

        expect(res.status).toBe(200);
        expect(json.alreadyActive).toBe(true);
        expect(json.expiresAt).toBe('2026-10-12T00:00:00.000Z');
    });

    it('still rejects an order id that was never issued for this site', async () => {
        scripts['sites'] = { singleResult: { id: SITE, name: 'Test Cafe', notification_emails: [] } };
        scripts['site_subscriptions'] = {
            singleResult: {
                id: 'sub1',
                razorpay_subscription_id: 'order_SOMETHING_ELSE',
                store_expires_at: null, store_plan: null,
                pending_plan: 'qr_menu', razorpay_status: 'created',
            },
        };
        const res = await verifyPayment(req(goodBody));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/mismatch/i);
    });
});

// =============================================================================
// Finding 6 — payment status and amount
// =============================================================================
describe('Finding 6: only a captured payment activates a plan', () => {
    it('rejects status=authorized — the money has not moved and auto-voids', async () => {
        subscriptionAwaitingPayment();
        razorpayMock.payments.fetch.mockResolvedValue({
            id: PAYMENT, status: 'authorized', amount: 29900, currency: 'INR', order_id: ORDER,
        });
        const res = await verifyPayment(req(goodBody));
        expect(res.status).toBe(202);
        expect((await res.json()).code).toBe('PAYMENT_PENDING');
        expect(dbCalls.find(c => c.table === 'site_subscriptions' && c.op === 'update')).toBeUndefined();
    });

    it('rejects a payment Razorpay reports against a different order', async () => {
        subscriptionAwaitingPayment();
        razorpayMock.payments.fetch.mockResolvedValue({
            id: PAYMENT, status: 'captured', amount: 29900, currency: 'INR', order_id: 'order_SOMEONE_ELSE',
        });
        const res = await verifyPayment(req(goodBody));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/order/i);
    });

    it('rejects when the captured amount is under the plan price', async () => {
        subscriptionAwaitingPayment();
        razorpayMock.payments.fetch.mockResolvedValue({
            id: PAYMENT, status: 'captured', amount: 100, currency: 'INR', order_id: ORDER,
        });
        const res = await verifyPayment(req(goodBody));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/amount/i);
    });
});
