import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Invoice history for the owner's own ₹299 plan.
 *
 * Rows already exist: `billing_history` is written by verify-payment (and by
 * the Razorpay webhook, which is why the insert tolerates a 23505). Until now
 * nothing read them back, so an owner could pay every month and never see a
 * record of it — the subscription page told them "Renew manually" and showed
 * no evidence any payment had ever happened.
 *
 * Deliberately NOT a GST invoice. vsite has no GSTIN yet, so this lists
 * payments; it does not claim to be a tax document. Adding GST later means
 * adding fields here, not rewriting the endpoint.
 *
 * The security shape that matters: `billing_history` is keyed by Firebase uid
 * in `user_id`, and the route reads it with the service-role client. The uid
 * therefore has to come from the verified token and never from the request,
 * or one owner could read another's payments by editing a query string.
 */

// `import 'server-only'` blows up in vitest unless mocked away.
vi.mock('server-only', () => ({}));

const verifyFirebaseToken = vi.fn();
const eqSpy = vi.fn();

vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
    verifyFirebaseToken: (t: string) => verifyFirebaseToken(t),
}));

// Chainable stand-in for the supabase query builder. A proxy rather than a
// hand-listed set of methods, so adding `.range()` or reordering the chain in
// the route does not silently produce an undefined and a confusing failure.
let currentRows: unknown[] = [];
let currentError: unknown = null;

function makeQuery(): unknown {
    const target = {
        eq(col: string, val: unknown) { eqSpy(col, val); return proxy; },
        then(res: (v: { data: unknown[]; error: unknown }) => unknown) {
            return Promise.resolve({ data: currentRows, error: currentError }).then(res);
        },
    } as Record<string, unknown>;
    const proxy: unknown = new Proxy(target, {
        get(t, prop: string) {
            if (prop in t) return t[prop];
            return () => proxy; // select / order / limit / …
        },
    });
    return proxy;
}

vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: { from: () => makeQuery() },
}));

const { GET } = await import('@/app/api/manage/billing-history/route');

function req(token = 'good-token', siteId = 'site-abc') {
    const qs = siteId ? `?site_id=${siteId}` : '';
    return new Request(`http://localhost/api/manage/billing-history${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
    }) as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
    verifyFirebaseToken.mockReset();
    eqSpy.mockReset();
    currentRows = [];
    currentError = null;
});

describe('reading your own invoice history', () => {
    it('rejects a request with no valid token', async () => {
        verifyFirebaseToken.mockResolvedValue(null);
        const res = await GET(req('rubbish'));
        expect(res.status).toBe(401);
    });

    it('scopes the query to the uid from the verified token', async () => {
        verifyFirebaseToken.mockResolvedValue('firebase-uid-123');
        await GET(req());
        // The whole security model of this endpoint in one assertion.
        expect(eqSpy).toHaveBeenCalledWith('user_id', 'firebase-uid-123');
    });

    it('isolates the list to the requested store', async () => {
        // An owner with five stores was seeing one merged list on all five,
        // because billing_history recorded no store at all.
        verifyFirebaseToken.mockResolvedValue('uid-1');
        await GET(req('good-token', 'site-abc'));
        expect(eqSpy).toHaveBeenCalledWith('site_id', 'site-abc');
    });

    it('refuses to guess when no store is named', async () => {
        // Falling back to "all of them" is exactly the bug being fixed.
        verifyFirebaseToken.mockResolvedValue('uid-1');
        const res = await GET(req('good-token', ''));
        expect(res.status).toBe(400);
    });

    it('returns the payments as invoices', async () => {
        verifyFirebaseToken.mockResolvedValue('uid-1');
        currentRows = [{
            id: 'row-1',
            plan_name: 'Smart QR Menu — Monthly',
            amount: 299,
            currency: 'INR',
            status: 'Success',
            created_at: '2026-09-09T10:00:00.000Z',
            razorpay_payment_id: 'pay_ABC123',
        }];
        const res = await GET(req());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.invoices).toHaveLength(1);
        const inv = body.invoices[0];
        expect(inv.amount).toBe(299);
        expect(inv.planName).toBe('Smart QR Menu');
        expect(inv.paymentId).toBe('pay_ABC123');
        // A human-quotable reference for support, derived from the row id.
        expect(inv.invoiceNo).toMatch(/^VS-/);
    });

    it('hides how the payment was recorded from the owner', async () => {
        // Real rows are named "Smart QR Menu — Payment (webhook)" or
        // "— Monthly" depending on which code path wrote them. That is our
        // plumbing; an invoice list should not explain webhooks to a café.
        verifyFirebaseToken.mockResolvedValue('uid-1');
        currentRows = [{
            id: 'row-9', plan_name: 'Smart QR Menu — Payment (webhook)', amount: '299',
            currency: 'INR', status: 'Success',
            created_at: '2026-08-30T16:45:04.242Z', razorpay_payment_id: 'pay_TW3',
        }];
        const body = await (await GET(req())).json();
        expect(body.invoices[0].planName).toBe('Smart QR Menu');
        // Postgres `numeric` arrives as a string — it must not reach the UI as one.
        expect(body.invoices[0].amount).toBe(299);
    });

    it('does not leak the internal user_id back to the client', async () => {
        verifyFirebaseToken.mockResolvedValue('uid-1');
        currentRows = [{
            id: 'row-1', plan_name: 'x', amount: 299, currency: 'INR',
            status: 'Success', created_at: '2026-09-09T10:00:00.000Z',
            razorpay_payment_id: 'pay_1', user_id: 'uid-1',
        }];
        const body = await (await GET(req())).json();
        expect(body.invoices[0]).not.toHaveProperty('user_id');
    });

    it('reports a database failure as a 500 rather than an empty history', async () => {
        // An owner seeing "no invoices" when the query broke would conclude
        // their payments were lost.
        verifyFirebaseToken.mockResolvedValue('uid-1');
        currentError = { message: 'connection reset' };
        const res = await GET(req());
        expect(res.status).toBe(500);
    });

    it('returns an empty list, not an error, for an owner who has never paid', async () => {
        verifyFirebaseToken.mockResolvedValue('uid-new');
        currentRows = [];
        const res = await GET(req());
        expect(res.status).toBe(200);
        expect((await res.json()).invoices).toEqual([]);
    });
});
