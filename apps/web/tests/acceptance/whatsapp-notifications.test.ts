/**
 * Acceptance — WhatsApp notification layer v1.
 * Spec: docs/superpowers/specs/2026-09-22-whatsapp-notifications-design.md
 *
 * AC1  Onboarding enqueues the welcome (congrats + QR + trial end) for the new site —
 *      only when the store opened live on its trial (one free trial per account,
 *      2026-09-25), with the store's own trial_ends_at, never created_at + 7 days.
 * AC2  Both payment activation paths enqueue ONE receipt, keyed by the order id,
 *      so verify-payment and the Razorpay webhook cannot both send it.
 * AC3  The sweep never filters on razorpay_status (AGENTS.md: it is the replay
 *      guard, not a paid flag) and reads the trial from site_subscriptions.trial_ends_at.
 * AC4  The webhook, cron and QR routes exist; the cron uses the shared gate.
 * AC5  The triggers never await the send: a Meta outage cannot slow or fail
 *      onboarding or a payment.
 * AC6  The migration creates the outbox with a unique idempotency key, RLS on,
 *      and no grants to anon/authenticated.
 * AC7  The QR image encodes the public menu URL and nothing else.
 *
 * Added 2026-10-03 (gaps found before go-live):
 * AC11 A store that opened without a trial gets its QR on WhatsApp when it goes
 *      live by paying — from both activation paths, never awaited, and sharing
 *      the welcome's key so a store gets one QR message ever.
 * AC12 The registry records the category Meta actually approved: the two trial
 *      templates are MARKETING (owner accepted 2026-10-03), the rest UTILITY.
 * AC13 The owner's phone comes from the verified Firebase token, server-side,
 *      on every login and at onboarding/payment — never only from the browser.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { createFakeDb, fakeClient, type FakeDb } from '../fixtures/fakeSupabase';

const holder = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: { from: (t: string) => fakeClient(holder.db).from(t) },
}));

import { GET as qrGet } from '@/app/api/qr/[slug]/route';
import { TEMPLATES } from '@/lib/notifications/whatsapp/templates';

const root = process.cwd();
const src = (p: string) => readFileSync(join(root, 'src', p), 'utf8');

describe('AC1 — welcome on onboarding', () => {
    const route = src('app/api/onboarding/complete/route.ts');
    it('enqueues the welcome event keyed by the site', () => {
        expect(route).toMatch(/enqueueAndSend\(\s*\{[\s\S]*?event:\s*'welcome'/);
        expect(route).toMatch(/key:\s*`welcome:\$\{site\.id\}`/);
    });
    it('sends the QR image URL and the trial end date', () => {
        expect(route).toMatch(/qrImageUrl/);
        expect(route).toMatch(/trialEndsOn/);
    });
    it("uses the store's own trial end, not a fixed length from now", () => {
        expect(route).not.toMatch(/TRIAL_DURATION_MS/);
        expect(route).toMatch(/trialEndsOn:\s*formatDateIST\(trialEnd\)/);
    });
    it('a store that opened without a trial (waits for payment) gets no welcome', () => {
        expect(route).toMatch(/if \(live\)\s*\{[\s\S]{0,400}?enqueueAndSend\(/);
    });
});

describe('AC2 — one receipt per order', () => {
    it('verify-payment enqueues the receipt keyed by the order id', () => {
        const route = src('app/api/subscription/verify-payment/route.ts');
        expect(route).toMatch(/event:\s*'payment_receipt'/);
        expect(route).toMatch(/key:\s*`receipt:\$\{razorpay_order_id\}`/);
    });
    it('the Razorpay webhook uses the same key, only after it activated the plan', () => {
        const route = src('app/api/webhooks/razorpay/route.ts');
        expect(route).toMatch(/event:\s*'payment_receipt'/);
        expect(route).toMatch(/key:\s*`receipt:\$\{orderId\}`/);
    });
});

describe('AC3 — sweep rules', () => {
    const sweep = src('lib/notifications/whatsapp/sweep.ts');
    it('never reads razorpay_status', () => {
        expect(sweep).not.toMatch(/razorpay_status/);
    });
    it("reads each store's own trial_ends_at, not created_at + a fixed length", () => {
        expect(sweep).toMatch(/trial_ends_at/);
        expect(sweep).not.toMatch(/TRIAL_DURATION_MS/);
    });
});

describe('AC4 — routes', () => {
    it('webhook, cron and QR routes exist', () => {
        for (const p of ['app/api/webhooks/whatsapp/route.ts', 'app/api/cron/whatsapp/route.ts', 'app/api/qr/[slug]/route.ts']) {
            expect(existsSync(join(root, 'src', p)), p).toBe(true);
        }
    });
    it('the cron route is behind authorizeCron', () => {
        expect(src('app/api/cron/whatsapp/route.ts')).toMatch(/authorizeCron\(req\)/);
    });
    it('the webhook verifies the signature over the raw body before parsing', () => {
        const w = src('app/api/webhooks/whatsapp/route.ts');
        const raw = w.indexOf('await req.text()');
        const verify = w.indexOf('verifyMetaSignature(');
        const parse = w.indexOf('JSON.parse(');
        expect(raw).toBeGreaterThan(-1);
        expect(verify).toBeGreaterThan(raw);
        expect(parse).toBeGreaterThan(verify);
    });
});

describe('AC5 — triggers never block on WhatsApp', () => {
    it.each([
        'app/api/onboarding/complete/route.ts',
        'app/api/subscription/verify-payment/route.ts',
        'app/api/webhooks/razorpay/route.ts',
    ])('%s calls enqueueAndSend without await', (p) => {
        const s = src(p);
        expect(s).toMatch(/enqueueAndSend\(/);
        expect(s).not.toMatch(/await\s+enqueueAndSend/);
    });
    it('enqueueAndSend returns void and swallows every failure', () => {
        const o = src('lib/notifications/whatsapp/outbox.ts');
        expect(o).toMatch(/export function enqueueAndSend\([^)]*\):\s*void/);
    });
});

describe('AC6 — migration', () => {
    const dir = join(root, 'supabase', 'migrations');
    const sql = readFileSync(join(dir, '062_notification_outbox.sql'), 'utf8').toLowerCase();
    it('creates the table with a unique idempotency key', () => {
        expect(sql).toMatch(/create table if not exists public\.notification_outbox/);
        expect(sql).toMatch(/idempotency_key\s+text\s+not null\s+unique/);
    });
    it('enables RLS and revokes the public roles', () => {
        expect(sql).toMatch(/alter table public\.notification_outbox enable row level security/);
        expect(sql).toMatch(/revoke all on (table )?public\.notification_outbox from (public, )?anon, authenticated/);
    });
    it('indexes the columns the dispatcher and webhook look up by', () => {
        expect(sql).toMatch(/on public\.notification_outbox\s*\(\s*wamid\s*\)/);
        expect(sql).toMatch(/on public\.notification_outbox\s*\(\s*status\s*,\s*next_attempt_at\s*\)/);
    });
});

describe('AC7 — QR image', () => {
    it('renders a PNG for a real shop, 404 for an unknown one, 400 for junk', async () => {
        holder.db = createFakeDb({ tables: { sites: [{ id: 's1', slug: 'anna-cafe', name: 'Anna Cafe' }] } });
        const ok = await qrGet(new NextRequest('https://vsite.in/api/qr/anna-cafe'), { params: { slug: 'anna-cafe' } });
        expect(ok.status).toBe(200);
        expect(ok.headers.get('content-type')).toBe('image/png');
        const bytes = new Uint8Array(await ok.arrayBuffer());
        expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);

        const missing = await qrGet(new NextRequest('https://vsite.in/api/qr/nobody'), { params: { slug: 'nobody' } });
        expect(missing.status).toBe(404);

        const junk = await qrGet(new NextRequest('https://vsite.in/api/qr/x'), { params: { slug: '../../etc' } });
        expect(junk.status).toBe(400);
    });

    it('encodes the public menu URL', () => {
        const r = src('app/api/qr/[slug]/route.ts');
        expect(r).toMatch(/\$\{SITE_URL\}\/shop\/\$\{slug\}/);
    });
});

describe('AC8 - account errors never lose messages', () => {
    it('the outbox trips a breaker for system/template/throttle classes', () => {
        const outboxSrc = src('lib/notifications/whatsapp/outbox.ts');
        expect(outboxSrc).toMatch(/result\.cls === 'system' \|\| result\.cls === 'template' \|\| result\.cls === 'throttle'/);
        expect(outboxSrc).toMatch(/Not this row's fault: keep its attempts/);
    });
});

describe('AC9 - alerts and monitoring fit the Sentry free plan', () => {
    it('exactly one cron monitor slug exists in the codebase', () => {
        expect(src('lib/notifications/whatsapp/monitor.ts')).toMatch(/slug: 'whatsapp-dispatch'/);
        expect(src('app/api/cron/whatsapp/route.ts').match(/monitorSlug:/g)?.length).toBe(2);
    });
    function alertSpans(code: string): string[] {
        const spans: string[] = [];
        const re = /\balert\(/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(code)) !== null) {
            let depth = 0;
            let i = m.index + m[0].length - 1;
            for (; i < code.length; i++) {
                if (code[i] === '(') depth++;
                else if (code[i] === ')' && --depth === 0) break;
            }
            spans.push(code.slice(m.index, i + 1));
        }
        return spans;
    }
    it('the PII scan flags a phone field and passes a clean call', () => {
        expect(alertSpans("alert('k', { id: String(x), phone: p })").some((x) => /phone/i.test(x))).toBe(true);
        expect(alertSpans("alert('k', { id: String(x) })").some((x) => /phone/i.test(x))).toBe(false);
    });
    it('alerts never carry a phone number field', () => {
        for (const f of ['alerts.ts', 'watchdog.ts', 'housekeeping.ts', 'accountEvents.ts', 'outbox.ts']) {
            for (const span of alertSpans(src(`lib/notifications/whatsapp/${f}`))) {
                expect(span, f).not.toMatch(/phone/i);
            }
        }
    });
});

describe('AC10 - migration 064', () => {
    const sql = readFileSync(join(root, 'supabase', 'migrations', '064_notification_health.sql'), 'utf8').toLowerCase();
    it('is service-role only with RLS on', () => {
        expect(sql).toMatch(/enable row level security/);
        expect(sql).toMatch(/revoke all on table public\.notification_health from public, anon, authenticated/);
    });
    it('is expand-only', () => {
        expect(sql).not.toMatch(/^\s*(drop|alter table [^;]* drop)/m);
    });
});

describe('AC11 - a no-trial store gets its QR when it goes live by paying', () => {
    it('the store_live template carries the QR as an image header', () => {
        expect(TEMPLATES.store_live).toMatchObject({ name: 'vsite_store_live_qr', category: 'UTILITY', headerImage: 'qrImageUrl' });
    });
    it.each([
        'app/api/subscription/verify-payment/route.ts',
        'app/api/webhooks/razorpay/route.ts',
    ])('%s sends it after activation, without await', (p) => {
        const s = src(p);
        expect(s).toMatch(/sendStoreLiveQr\(/);
        expect(s).not.toMatch(/await\s+sendStoreLiveQr/);
    });
    it('shares the welcome key, so a store gets one QR message ever', () => {
        expect(src('lib/notifications/whatsapp/storeLive.ts')).toMatch(/key:\s*`welcome:\$\{/);
    });
});

describe('AC12 - template categories match what Meta approved', () => {
    it('trial templates are MARKETING, everything else UTILITY', () => {
        const marketing = Object.entries(TEMPLATES).filter(([, d]) => d.category === 'MARKETING').map(([e]) => e).sort();
        expect(marketing).toEqual(['trial_ended', 'trial_ending']);
    });
});

describe('AC13 - the owner phone is captured server-side from the verified token', () => {
    it('/auth/continue fills a blank phone on every login', () => {
        const page = src('app/auth/continue/page.tsx');
        expect(page).toMatch(/phoneFromIdToken\(token\)/);
        expect(page).not.toMatch(/provisionUser\(supabaseServer,\s*\{\s*uid,\s*phone:\s*null\s*\}\)/);
        expect(page).toMatch(/backfillProfilePhone\(/);
    });
    it.each([
        'app/api/onboarding/complete/route.ts',
        'app/api/subscription/verify-payment/route.ts',
    ])('%s remembers the verified phone before WhatsApp looks it up', (p) => {
        const s = src(p);
        const remember = s.indexOf('rememberVerifiedPhone(');
        expect(remember).toBeGreaterThan(-1);
        expect(remember).toBeLessThan(s.indexOf('enqueueAndSend({'));
    });
});
