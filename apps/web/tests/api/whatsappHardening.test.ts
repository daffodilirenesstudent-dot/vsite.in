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

import { readBreakers, openBreaker, closeBreaker, beat, lastBeat, claimAlert } from '@/lib/notifications/whatsapp/healthStore';

const MIN = 60_000;
const HOUR = 60 * MIN;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-10-02T04:30:00.000Z');
type Row = Record<string, unknown>;
const health = () => holder.db.tables.notification_health as Row[];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const outbox = () => holder.db.tables.notification_outbox as Row[];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const fetchMock = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function metaOk(wamid = 'wamid.OK1') {
    return new Response(JSON.stringify({ messages: [{ id: wamid }] }), { status: 200 });
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
