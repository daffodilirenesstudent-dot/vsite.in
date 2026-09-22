/**
 * The WhatsApp outbox, sweep and webhook — against an in-memory database.
 *
 * These are the properties that decide whether owners get one correct message,
 * zero, or five:
 *   - an idempotency key is sent at most once, however many times it is enqueued
 *   - a row is claimed by one dispatcher only
 *   - a retryable Meta error backs off; a permanent one stops
 *   - an owner who renewed after the sweep is not told their plan is expiring
 *   - a stale backlog is never blasted out when the layer is switched on late
 *   - delivery statuses only move forward, whatever order Meta sends them in
 *   - the sweep picks exactly the stores inside each window, and only once
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { createFakeDb, fakeClient, type FakeDb } from '../fixtures/fakeSupabase';

const holder = vi.hoisted(() => ({ db: null as unknown as FakeDb }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: { from: (t: string) => fakeClient(holder.db).from(t) },
}));
const notifyMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/notifications/notify', () => ({ notify: notifyMock }));

import { enqueue, dispatchRow, dispatchDue, applyStatuses } from '@/lib/notifications/whatsapp/outbox';
import { runSweep } from '@/lib/notifications/whatsapp/sweep';
import { GET as webhookGet, POST as webhookPost } from '@/app/api/webhooks/whatsapp/route';
import { GET as cronGet, POST as cronPost } from '@/app/api/cron/whatsapp/route';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-09-22T04:30:00.000Z');

type OutRow = Record<string, unknown>;
const outbox = () => holder.db.tables.notification_outbox as OutRow[];

const fetchMock = vi.fn();

function metaOk(wamid = 'wamid.OK1') {
    return new Response(JSON.stringify({ messaging_product: 'whatsapp', contacts: [{ input: 'x', wa_id: 'x' }], messages: [{ id: wamid }] }), { status: 200 });
}
function metaErr(code: number, http = 400) {
    return new Response(JSON.stringify({ error: { message: 'err', type: 'OAuthException', code, fbtrace_id: 't' } }), { status: http });
}

const ENV = {
    WHATSAPP_ACCESS_TOKEN: 'test-token',
    WHATSAPP_PHONE_NUMBER_ID: '1234567890',
    WHATSAPP_APP_SECRET: 'test-app-secret',
    WHATSAPP_VERIFY_TOKEN: 'test-verify-token',
    CRON_SECRET: 'test-cron-secret',
};
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    holder.db = createFakeDb({
        tables: { notification_outbox: [], sites: [], site_subscriptions: [], profiles: [] },
        unique: { notification_outbox: ['idempotency_key'] },
        relations: {
            site_subscriptions: { table: 'site_subscriptions', local: 'id', foreign: 'site_id', many: true },
            sites: { table: 'sites', local: 'site_id', foreign: 'id' },
        },
    });
    for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
    fetchMock.mockReset();
    notifyMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
    for (const k of Object.keys(ENV)) {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    vi.unstubAllGlobals();
});

function seedOwner(userId = 'u1', phone: string | null = '+919876543210') {
    holder.db.tables.profiles.push({ id: userId, phone_number: phone });
}

const receipt = (key = 'receipt:order_1') => ({
    event: 'payment_receipt' as const, key, userId: 'u1', siteId: 's1',
    params: { amountInr: '299', validTill: '22 Oct 2026' },
});

// ─────────────────────────────────────────────────────────────────────────────

describe('enqueue', () => {
    it('writes one queued row with the normalised number, and a repeat key is a no-op', async () => {
        seedOwner();
        const id = await enqueue(receipt());
        expect(id).toBeTruthy();
        expect(await enqueue(receipt())).toBeNull();
        expect(outbox()).toHaveLength(1);
        expect(outbox()[0]).toMatchObject({
            status: 'queued', to_phone: '919876543210', template: 'vsite_payment_receipt',
            language: 'en', event: 'payment_receipt', attempts: 0,
        });
    });

    it('an owner with no usable number is recorded as skipped, never sent', async () => {
        seedOwner('u1', null);
        const id = await enqueue(receipt());
        expect(outbox()[0]).toMatchObject({ status: 'skipped', last_error: 'no_phone' });
        expect(await dispatchRow(id as string, NOW)).toBe('not_claimed');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects params the template cannot render, before anything is stored', async () => {
        seedOwner();
        await expect(enqueue({ ...receipt(), params: { amountInr: '299' } })).rejects.toThrow(/validTill/);
        expect(outbox()).toHaveLength(0);
    });
});

describe('dispatchRow', () => {
    it('sends the template to the Graph API and records the wamid', async () => {
        seedOwner();
        const id = await enqueue(receipt()) as string;
        fetchMock.mockResolvedValueOnce(metaOk('wamid.ABC'));

        expect(await dispatchRow(id, NOW)).toBe('sent');

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://graph.facebook.com/v25.0/1234567890/messages');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
        const body = JSON.parse(init.body as string);
        expect(body).toMatchObject({
            messaging_product: 'whatsapp', to: '919876543210', type: 'template',
            template: { name: 'vsite_payment_receipt', language: { code: 'en' } },
        });
        expect(outbox()[0]).toMatchObject({ status: 'sent', wamid: 'wamid.ABC', attempts: 1 });
    });

    it('leaves the row queued, untouched, when WhatsApp is not configured', async () => {
        seedOwner();
        const id = await enqueue(receipt()) as string;
        delete process.env.WHATSAPP_ACCESS_TOKEN;
        expect(await dispatchRow(id, NOW)).toBe('not_configured');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(outbox()[0]).toMatchObject({ status: 'queued', attempts: 0 });
    });

    it('a throttling error backs off; the next attempt is scheduled', async () => {
        seedOwner();
        const id = await enqueue(receipt()) as string;
        fetchMock.mockResolvedValueOnce(metaErr(130429));
        expect(await dispatchRow(id, NOW)).toBe('failed');
        expect(outbox()[0]).toMatchObject({ status: 'failed', attempts: 1, error_code: 130429 });
        expect(outbox()[0].next_attempt_at).toBe(new Date(NOW + 5 * 60_000).toISOString());
    });

    it('a network failure is retryable', async () => {
        seedOwner();
        const id = await enqueue(receipt()) as string;
        fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
        expect(await dispatchRow(id, NOW)).toBe('failed');
    });

    it('a template error is permanent — dead on the first attempt', async () => {
        seedOwner();
        const id = await enqueue(receipt()) as string;
        fetchMock.mockResolvedValueOnce(metaErr(132001));
        expect(await dispatchRow(id, NOW)).toBe('dead');
        expect(outbox()[0]).toMatchObject({ status: 'dead', error_code: 132001 });
    });

    it('two dispatchers racing on one row send it once', async () => {
        seedOwner();
        const id = await enqueue(receipt()) as string;
        fetchMock.mockResolvedValue(metaOk());
        const results = await Promise.all([dispatchRow(id, NOW), dispatchRow(id, NOW)]);
        expect(results.sort()).toEqual(['not_claimed', 'sent']);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('a row older than 48h is skipped as stale, not sent', async () => {
        seedOwner();
        const id = await enqueue(receipt()) as string;
        outbox()[0].created_at = new Date(NOW - 3 * DAY).toISOString();
        expect(await dispatchRow(id, NOW)).toBe('skipped');
        expect(outbox()[0]).toMatchObject({ status: 'skipped', last_error: 'stale' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('an owner who renewed after the sweep is not told the plan is expiring', async () => {
        seedOwner();
        holder.db.tables.site_subscriptions.push({ site_id: 's1', user_id: 'u1', store_expires_at: new Date(NOW + 33 * DAY).toISOString() });
        const id = await enqueue({
            event: 'plan_expiring', key: 'plan_expiring:s1:old', userId: 'u1', siteId: 's1',
            params: { shopName: 'Anna Cafe', expiresOn: '25 Sept 2026', expiresAt: new Date(NOW + 3 * DAY).toISOString() },
        }) as string;
        expect(await dispatchRow(id, NOW)).toBe('skipped');
        expect(outbox()[0]).toMatchObject({ status: 'skipped', last_error: 'precondition' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('an owner who paid during the trial is not told the trial ended', async () => {
        seedOwner();
        holder.db.tables.sites.push({ id: 's1', user_id: 'u1', name: 'Anna Cafe', slug: 'anna', created_at: new Date(NOW - 8 * DAY).toISOString() });
        holder.db.tables.site_subscriptions.push({ site_id: 's1', user_id: 'u1', store_expires_at: new Date(NOW + 20 * DAY).toISOString() });
        const id = await enqueue({
            event: 'trial_ended', key: 'trial_ended:s1', userId: 'u1', siteId: 's1',
            params: { shopName: 'Anna Cafe', priceInr: '299' },
        }) as string;
        expect(await dispatchRow(id, NOW)).toBe('skipped');
    });
});

describe('dispatchDue', () => {
    it('sends queued and due-for-retry rows, reclaims stuck ones, and leaves the rest', async () => {
        seedOwner();
        await enqueue(receipt('receipt:a'));
        await enqueue(receipt('receipt:b'));
        await enqueue(receipt('receipt:c'));
        await enqueue(receipt('receipt:d'));
        const [a, b, c, d] = outbox();
        b.status = 'failed'; b.attempts = 1; b.next_attempt_at = new Date(NOW - 60_000).toISOString();   // due
        c.status = 'failed'; c.attempts = 1; c.next_attempt_at = new Date(NOW + HOUR).toISOString();     // not yet
        d.status = 'sending'; d.attempts = 1; d.updated_at = new Date(NOW - 20 * 60_000).toISOString();  // stuck
        fetchMock.mockImplementation(async () => metaOk());

        const r = await dispatchDue({ nowMs: NOW });

        expect(r.sent).toBe(3);
        expect(a.status).toBe('sent');
        expect(b.status).toBe('sent');
        expect(c.status).toBe('failed');
        expect(d.status).toBe('sent');
    });
});

describe('applyStatuses (webhook status updates)', () => {
    async function sentRow(wamid: string) {
        seedOwner();
        const id = await enqueue(receipt(`receipt:${wamid}`)) as string;
        fetchMock.mockResolvedValueOnce(metaOk(wamid));
        await dispatchRow(id, NOW);
        return outbox().find(r => r.id === id) as OutRow;
    }

    it('moves forward through delivered and read', async () => {
        const row = await sentRow('wamid.1');
        await applyStatuses([{ id: 'wamid.1', status: 'delivered', timestamp: '1758515400' }]);
        expect(row.status).toBe('delivered');
        await applyStatuses([{ id: 'wamid.1', status: 'read', timestamp: '1758515460' }]);
        expect(row.status).toBe('read');
    });

    it('a late "delivered" never downgrades a "read"', async () => {
        const row = await sentRow('wamid.2');
        await applyStatuses([
            { id: 'wamid.2', status: 'read', timestamp: '2' },
            { id: 'wamid.2', status: 'delivered', timestamp: '1' },
        ]);
        expect(row.status).toBe('read');
    });

    it('a delivery failure marks the row dead with Meta\'s code', async () => {
        const row = await sentRow('wamid.3');
        await applyStatuses([{ id: 'wamid.3', status: 'failed', timestamp: '1', errors: [{ code: 131026, title: 'Message undeliverable' }] }]);
        expect(row).toMatchObject({ status: 'dead', error_code: 131026 });
    });

    it('ignores wamids it did not send', async () => {
        await expect(applyStatuses([{ id: 'wamid.unknown', status: 'read', timestamp: '1' }])).resolves.toBe(0);
    });
});

describe('runSweep', () => {
    function seedStore(id: string, createdAt: number, expiresAt: number | null, phone = '+919800000001') {
        holder.db.tables.profiles.push({ id: `u-${id}`, phone_number: phone });
        holder.db.tables.sites.push({ id, user_id: `u-${id}`, name: `Shop ${id}`, slug: `shop-${id}`, created_at: new Date(createdAt).toISOString() });
        holder.db.tables.site_subscriptions.push({ site_id: id, user_id: `u-${id}`, store_expires_at: expiresAt === null ? null : new Date(expiresAt).toISOString() });
    }

    beforeEach(() => {
        seedStore('trialEnding', NOW - 6 * DAY, null);             // trial ends in 24h
        seedStore('trialEnded', NOW - 7 * DAY - 3 * HOUR, null);   // ended 3h ago
        seedStore('trialFresh', NOW - 1 * DAY, null);              // nothing yet
        seedStore('trialAncient', NOW - 60 * DAY, null);           // long gone — no backfill
        seedStore('paidInTrial', NOW - 6 * DAY, NOW + 25 * DAY);   // paid: no trial message, no plan message
        seedStore('planT3', NOW - 90 * DAY, NOW + 70 * HOUR);
        seedStore('planToday', NOW - 90 * DAY, NOW + 6 * HOUR);
        seedStore('planExpired', NOW - 90 * DAY, NOW - 4 * HOUR);
        seedStore('planFar', NOW - 90 * DAY, NOW + 20 * DAY);
        seedStore('planLongExpired', NOW - 90 * DAY, NOW - 10 * DAY);
    });

    it('enqueues exactly the due events, with cycle-scoped keys', async () => {
        const r = await runSweep(NOW);
        const keys = outbox().map(o => o.idempotency_key).sort();
        const t3 = new Date(NOW + 70 * HOUR).toISOString();
        const t0 = new Date(NOW + 6 * HOUR).toISOString();
        const ex = new Date(NOW - 4 * HOUR).toISOString();
        expect(keys).toEqual([
            `plan_expired:planExpired:${ex}`,
            `plan_expires_today:planToday:${t0}`,
            `plan_expiring:planT3:${t3}`,
            'trial_ended:trialEnded',
            'trial_ending:trialEnding',
        ]);
        expect(r.enqueued).toBe(5);
    });

    it('is idempotent — a second run the same day enqueues nothing', async () => {
        await runSweep(NOW);
        const again = await runSweep(NOW + HOUR);
        expect(again.enqueued).toBe(0);
        expect(outbox()).toHaveLength(5);
    });

    it('drops a bell notification for each new message, and none on a re-run', async () => {
        await runSweep(NOW);
        expect(notifyMock).toHaveBeenCalledTimes(5);
        await runSweep(NOW);
        expect(notifyMock).toHaveBeenCalledTimes(5);
        const types = notifyMock.mock.calls.map(c => (c[0] as { type: string }).type).sort();
        expect(types).toEqual(['plan_expired', 'plan_expiring', 'plan_expiring', 'trial_ending', 'trial_expired']);
    });

    it('a renewal starts a new cycle, so the next T-3 reminder is a new key', async () => {
        await runSweep(NOW);
        const sub = holder.db.tables.site_subscriptions.find(s => s.site_id === 'planT3') as OutRow;
        sub.store_expires_at = new Date(NOW + 30 * DAY + 70 * HOUR).toISOString();
        const later = await runSweep(NOW + 30 * DAY);
        expect(outbox().filter(o => String(o.idempotency_key).startsWith('plan_expiring:planT3:'))).toHaveLength(2);
        expect(later.enqueued).toBeGreaterThanOrEqual(1);
    });
});

describe('/api/webhooks/whatsapp', () => {
    const url = 'https://vsite.in/api/webhooks/whatsapp';
    const sign = (body: string, secret = ENV.WHATSAPP_APP_SECRET) =>
        'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

    it('GET echoes hub.challenge for the right verify token', async () => {
        const res = await webhookGet(new NextRequest(`${url}?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=1158201444`));
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('1158201444');
    });

    it('GET refuses a wrong token, a wrong mode, and a missing env var', async () => {
        expect((await webhookGet(new NextRequest(`${url}?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`))).status).toBe(403);
        expect((await webhookGet(new NextRequest(`${url}?hub.mode=unsubscribe&hub.verify_token=test-verify-token&hub.challenge=1`))).status).toBe(403);
        delete process.env.WHATSAPP_VERIFY_TOKEN;
        expect((await webhookGet(new NextRequest(`${url}?hub.mode=subscribe&hub.verify_token=&hub.challenge=1`))).status).toBe(403);
    });

    function statusPayload(wamid: string, status: string) {
        return JSON.stringify({
            object: 'whatsapp_business_account',
            entry: [{ id: 'waba', changes: [{ field: 'messages', value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '15550000000', phone_number_id: '1234567890' },
                statuses: [{ id: wamid, status, timestamp: '1758515400', recipient_id: '919876543210' }],
            } }] }],
        });
    }

    it('POST with a valid signature applies the status', async () => {
        seedOwner();
        const id = await enqueue(receipt()) as string;
        fetchMock.mockResolvedValueOnce(metaOk('wamid.W1'));
        await dispatchRow(id, NOW);

        const body = statusPayload('wamid.W1', 'delivered');
        const res = await webhookPost(new NextRequest(url, { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body) } }));
        expect(res.status).toBe(200);
        expect(outbox()[0].status).toBe('delivered');
    });

    it('POST with a bad or missing signature is refused and changes nothing', async () => {
        seedOwner();
        const id = await enqueue(receipt()) as string;
        fetchMock.mockResolvedValueOnce(metaOk('wamid.W2'));
        await dispatchRow(id, NOW);
        const body = statusPayload('wamid.W2', 'read');

        const bad = await webhookPost(new NextRequest(url, { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body, 'wrong') } }));
        const none = await webhookPost(new NextRequest(url, { method: 'POST', body }));
        expect(bad.status).toBe(401);
        expect(none.status).toBe(401);
        expect(outbox()[0].status).toBe('sent');
    });

    it('POST fails closed when the app secret is not configured', async () => {
        delete process.env.WHATSAPP_APP_SECRET;
        const body = statusPayload('wamid.X', 'read');
        const res = await webhookPost(new NextRequest(url, { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body, '') } }));
        expect(res.status).toBe(500);
    });

    it('POST returns 500 on a database failure so Meta retries', async () => {
        seedOwner();
        const id = await enqueue(receipt()) as string;
        fetchMock.mockResolvedValueOnce(metaOk('wamid.W3'));
        await dispatchRow(id, NOW);
        holder.db.failNext = { table: 'notification_outbox', op: 'select' };
        const body = statusPayload('wamid.W3', 'read');
        const res = await webhookPost(new NextRequest(url, { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body) } }));
        expect(res.status).toBe(500);
    });

    it('POST acknowledges inbound messages and other fields without error', async () => {
        const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'w', changes: [{ field: 'messages', value: {
            messaging_product: 'whatsapp', metadata: { display_phone_number: '1', phone_number_id: '1' },
            messages: [{ from: '919876543210', id: 'wamid.in', timestamp: '1', type: 'text', text: { body: 'hi' } }],
        } }, { field: 'account_update', value: {} }] }] });
        const res = await webhookPost(new NextRequest(url, { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body) } }));
        expect(res.status).toBe(200);
    });
});

describe('/api/cron/whatsapp', () => {
    const url = 'https://vsite.in/api/cron/whatsapp';

    it('refuses a request without the cron bearer', async () => {
        expect((await cronPost(new NextRequest(url, { method: 'POST' }))).status).toBe(401);
        expect((await cronGet(new NextRequest(url, { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);
    });

    it('with the bearer: sweeps, dispatches, and reports counts only', async () => {
        holder.db.tables.profiles.push({ id: 'u9', phone_number: '+919800000009' });
        holder.db.tables.sites.push({ id: 's9', user_id: 'u9', name: 'Shop 9', slug: 'shop-9', created_at: new Date(Date.now() - 6 * DAY).toISOString() });
        holder.db.tables.site_subscriptions.push({ site_id: 's9', user_id: 'u9', store_expires_at: null });
        fetchMock.mockImplementation(async () => metaOk());

        const res = await cronPost(new NextRequest(url, { method: 'POST', headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } }));
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toMatchObject({ success: true, enqueued: 1, sent: 1 });
        expect(JSON.stringify(json)).not.toMatch(/9198/); // no phone numbers in the response
    });
});
