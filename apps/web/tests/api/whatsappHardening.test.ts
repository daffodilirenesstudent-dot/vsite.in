/**
 * WhatsApp production hardening — breakers, alerts, watchdog, housekeeping,
 * webhook fields, cron check-in. Spec:
 * docs/superpowers/specs/2026-10-02-whatsapp-hardening-design.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFakeDb, fakeClient, type FakeDb } from '../fixtures/fakeSupabase';

const holder = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: { from: (t: string) => fakeClient(holder.db).from(t) },
}));
const sentry = vi.hoisted(() => ({ captureMessage: vi.fn(), captureCheckIn: vi.fn(() => 'checkin-1') }));
vi.mock('@sentry/nextjs', () => sentry);
const notifyMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/notifications/notify', () => ({ notify: notifyMock }));

import { alert } from '@/lib/notifications/whatsapp/alerts';
import { enqueue, dispatchRow, dispatchDue } from '@/lib/notifications/whatsapp/outbox';
import { readBreakers, openBreaker, closeBreaker, beat, lastBeat, claimAlert } from '@/lib/notifications/whatsapp/healthStore';

const MIN = 60_000;
const HOUR = 60 * MIN;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-02T04:30:00.000Z');
type Row = Record<string, unknown>;
const health = () => holder.db.tables.notification_health as Row[];
const outbox = () => holder.db.tables.notification_outbox as Row[];

const fetchMock = vi.fn();
function metaOk(wamid = 'wamid.OK1') {
    return new Response(JSON.stringify({ messages: [{ id: wamid }] }), { status: 200 });
}
function metaErr(code: number, http = 400) {
    return new Response(JSON.stringify({ error: { message: 'err', code } }), { status: http });
}
const ENV = {
    WHATSAPP_ACCESS_TOKEN: 'test-token', WHATSAPP_PHONE_NUMBER_ID: '1234567890',
    WHATSAPP_APP_SECRET: 'test-app-secret', WHATSAPP_VERIFY_TOKEN: 'test-verify-token', CRON_SECRET: 'test-cron-secret',
};
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    holder.db = createFakeDb({
        tables: { notification_outbox: [], notification_health: [], sites: [], site_subscriptions: [], profiles: [] },
        unique: { notification_outbox: ['idempotency_key'], notification_health: ['key'] },
        relations: {
            site_subscriptions: { table: 'site_subscriptions', local: 'id', foreign: 'site_id', many: true },
            sites: { table: 'sites', local: 'site_id', foreign: 'id' },
        },
    });
    for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
    fetchMock.mockReset(); notifyMock.mockReset();
    sentry.captureMessage.mockReset(); sentry.captureCheckIn.mockReset(); sentry.captureCheckIn.mockReturnValue('checkin-1');
    vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
    for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    vi.unstubAllGlobals();
});

describe('healthStore', () => {
    it('opening a closed breaker reports newlyOpened; re-opening an open one does not', async () => {
        const a = await openBreaker('system', { code: 190, reason: 'token', untilMs: NOW + 15 * MIN, nowMs: NOW });
        expect(a).toEqual({ newlyOpened: true, openUntil: new Date(NOW + 15 * MIN).toISOString() });
        const b = await openBreaker('system', { code: 190, reason: 'token', untilMs: NOW + 20 * MIN, nowMs: NOW + 5 * MIN });
        expect(b.newlyOpened).toBe(false);
        expect(health()).toHaveLength(1);
        expect(health()[0]).toMatchObject({ key: 'system', code: 190, open_until: new Date(NOW + 20 * MIN).toISOString() });
    });

    it('an expired breaker counts as closed, so re-opening it is new', async () => {
        await openBreaker('system', { code: 190, reason: 'token', untilMs: NOW + MIN, nowMs: NOW });
        const again = await openBreaker('system', { code: 190, reason: 'token', untilMs: NOW + 20 * MIN, nowMs: NOW + 2 * MIN });
        expect(again.newlyOpened).toBe(true);
    });

    it('readBreakers returns open and expired breakers, not closed ones or other keys', async () => {
        await openBreaker('system', { code: 190, reason: 'token', untilMs: NOW + MIN, nowMs: NOW });
        await openBreaker('template:vsite_x', { code: 132001, reason: 'tpl', untilMs: NOW + HOUR, nowMs: NOW });
        await openBreaker('template:vsite_y', { code: 132001, reason: 'tpl', untilMs: NOW + HOUR, nowMs: NOW });
        await closeBreaker('template:vsite_y', NOW);
        await beat('heartbeat:daily', NOW);
        const m = await readBreakers();
        expect([...m.keys()].sort()).toEqual(['system', 'template:vsite_x']);
        expect(m.get('system')).toBe(NOW + MIN);
    });

    it('heartbeats round-trip; a missing heartbeat is null', async () => {
        expect(await lastBeat('heartbeat:daily')).toBeNull();
        await beat('heartbeat:daily', NOW);
        expect(await lastBeat('heartbeat:daily')).toBe(NOW);
    });

    it('claimAlert fires once per window per kind', async () => {
        expect(await claimAlert('backlog', HOUR, NOW)).toBe(true);
        expect(await claimAlert('backlog', HOUR, NOW + 10 * MIN)).toBe(false);
        expect(await claimAlert('dead_spike', HOUR, NOW + 10 * MIN)).toBe(true);
        expect(await claimAlert('backlog', HOUR, NOW + HOUR + 1)).toBe(true);
    });
});

describe('alert', () => {
    it('reports to Sentry with a stable fingerprint per kind and key', () => {
        alert('breaker_open', { key: 'system', code: 190 });
        expect(sentry.captureMessage).toHaveBeenCalledWith('WhatsApp: breaker_open', expect.objectContaining({
            level: 'error',
            fingerprint: ['whatsapp', 'breaker_open', 'system'],
            tags: { area: 'whatsapp', kind: 'breaker_open' },
            extra: { key: 'system', code: 190 },
        }));
    });
    it('passes the level through', () => {
        alert('quality_drop', { event: 'DOWNGRADE' }, 'warning');
        expect(sentry.captureMessage.mock.calls[0][1]).toMatchObject({ level: 'warning', fingerprint: ['whatsapp', 'quality_drop', ''] });
    });
    it('never throws when Sentry throws', () => {
        sentry.captureMessage.mockImplementationOnce(() => { throw new Error('sentry down'); });
        expect(() => alert('backlog', { oldestMinutes: 45 })).not.toThrow();
    });
});

function seedOwner() { holder.db.tables.profiles.push({ id: 'u1', phone_number: '+919800000001' }); }
const receipt = (key: string) => ({
    event: 'payment_receipt' as const, key, userId: 'u1', siteId: null,
    params: { amountInr: '299', validTill: '22 Oct 2026' },
});
const welcome = (key: string) => ({
    event: 'welcome' as const, key, userId: 'u1', siteId: 's1',
    params: { shopName: 'Anna Cafe', menuUrl: 'https://vsite.in/shop/anna', qrImageUrl: 'https://vsite.in/api/qr/anna', trialEndsOn: '9 Oct 2026' },
});

describe('dispatcher with breakers', () => {
    it('token expired mid-run: one Meta call, one alert, nothing lost', async () => {
        seedOwner();
        for (let i = 0; i < 20; i++) await enqueue(receipt(`receipt:${i}`));
        fetchMock.mockResolvedValue(metaErr(190, 401));
        const r = await dispatchDue({ nowMs: NOW });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
        expect(sentry.captureMessage.mock.calls[0][1]).toMatchObject({ fingerprint: ['whatsapp', 'breaker_open', 'system'] });
        expect(outbox().every(o => o.status !== 'dead')).toBe(true);
        expect(outbox().every(o => o.attempts === 0)).toBe(true);
        expect(r.paused).toBe(19);
        expect(health().find(h => h.key === 'system')).toMatchObject({ code: 190, open_until: new Date(NOW + 15 * MIN).toISOString() });
    });

    it('after the breaker expires, a success closes it and the backlog drains', async () => {
        seedOwner();
        for (let i = 0; i < 3; i++) await enqueue(receipt(`receipt:${i}`));
        fetchMock.mockResolvedValueOnce(metaErr(190, 401));
        await dispatchDue({ nowMs: NOW });
        fetchMock.mockImplementation(async () => metaOk());
        const later = NOW + 16 * MIN;
        const r = await dispatchDue({ nowMs: later });
        expect(r.sent).toBe(3);
        expect(health().find(h => h.key === 'system')?.open_until).toBeNull();
        expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
    });

    it('a paused template holds only its own rows', async () => {
        seedOwner();
        holder.db.tables.sites.push({ id: 's1', user_id: 'u1', name: 'Anna Cafe', slug: 'anna' });
        await enqueue(welcome('welcome:s1'));
        await enqueue(receipt('receipt:a'));
        await enqueue(receipt('receipt:b'));
        fetchMock.mockImplementation(async (_url: string, init: { body: string }) =>
            (JSON.parse(init.body) as { template: { name: string } }).template.name === 'vsite_welcome_qr' ? metaErr(132015) : metaOk());
        const r = await dispatchDue({ nowMs: NOW });
        expect(r.sent).toBe(2);
        const w = outbox().find(o => o.idempotency_key === 'welcome:s1') as Row;
        expect(w).toMatchObject({ status: 'failed', attempts: 0, error_code: 132015 });
        expect(health().find(h => h.key === 'template:vsite_welcome_qr')).toBeTruthy();
        expect(health().find(h => h.key === 'system')).toBeUndefined();
    });

    it('fails open: if the health table cannot be read, sending continues', async () => {
        seedOwner();
        const id = await enqueue(receipt('receipt:x')) as string;
        holder.db.failNext = { table: 'notification_health', op: 'select' };
        fetchMock.mockImplementation(async () => metaOk());
        expect(await dispatchRow(id, NOW)).toBe('sent');
    });

    it('a recipient error still kills only that row, with no breaker and no alert', async () => {
        seedOwner();
        const id = await enqueue(receipt('receipt:y')) as string;
        fetchMock.mockResolvedValueOnce(metaErr(131026));
        expect(await dispatchRow(id, NOW)).toBe('dead');
        expect(health()).toHaveLength(0);
        expect(sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('health store down plus an account error: still one Meta call, no attempts burned', async () => {
        seedOwner();
        for (let i = 0; i < 5; i++) await enqueue(receipt(`receipt:d${i}`));
        holder.db.failNext = { table: 'notification_health', op: 'upsert' };
        fetchMock.mockImplementation(async () => metaErr(190, 401));
        await dispatchDue({ nowMs: NOW });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(outbox().every(o => o.status !== 'dead')).toBe(true);
        expect(outbox().every(o => o.attempts === 0)).toBe(true);
    });
});
