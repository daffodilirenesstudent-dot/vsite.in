# WhatsApp Notification Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Account-wide WhatsApp failures pause sending instead of losing messages, and the owner is told by Sentry email within minutes of any failure or missed run.

**Architecture:** A pure error classifier (`health.ts`) sorts every Meta error into message / retry / throttle / template / system. A small DB table (`notification_health`, store in `healthStore.ts`) holds circuit breakers, heartbeats and alert de-dup stamps. The outbox consults the breakers; `alerts.ts` reports to Sentry with fixed fingerprints; a watchdog, a housekeeping step and the webhook raise alerts; the cron route checks in to one Sentry Cron Monitor.

**Tech Stack:** Next.js 14 route handlers, TypeScript strict, Supabase (service role), `@sentry/nextjs` 10.53 (already installed), vitest with `tests/fixtures/fakeSupabase.ts`.

**Spec:** `docs/superpowers/specs/2026-10-02-whatsapp-hardening-design.md`

All paths below are relative to `apps/web/` unless they start with `docs/`. Run every command from `C:\Users\LENOVO\Desktop\vsite-whatsapp\apps\web`.

## Global Constraints

- TypeScript strict, no `any`, no `console.log` (use `logger` from `@/lib/platform/logger`).
- No new dependencies. Sentry is `@sentry/nextjs` (already a dependency).
- Never log or send to Sentry a phone number, token, or message content — ids, events, template names and Meta codes only.
- Sentry free plan: exactly **one** cron monitor, slug `whatsapp-dispatch`, schedule `*/10 * * * *`, check-in margin 5 min.
- Breaker durations: system 15 min, template 60 min, throttle 2 min; template status webhook PAUSED/DISABLED/REJECTED/FLAGGED: 6 h.
- Dispatch: limit 200 rows per run, concurrency 5, deadline 45 s.
- Watchdog thresholds: backlog = a due row whose `next_attempt_at` is older than 30 min; dead spike = ≥ 5 rows `dead` in the last hour; daily heartbeat older than 26 h.
- Alert de-dup: watchdog kinds at most once per hour per kind; `not_configured` once per 24 h; breaker alerts once per opening.
- Retention: delete outbox rows with `created_at` older than 90 days, 1,000 per batch, at most 10 batches per run.
- Migration `064_notification_health.sql` is expand-only; do not apply it (owner applies with 062/063).
- Breaker failures fail OPEN: if the breaker table cannot be read or written, sending proceeds as before.
- Tasks 3–8 append tests to `tests/api/whatsappHardening.test.ts`: put each task's `import` lines in the file's top import block (never mid-file), and do not import a name twice (`NextRequest` arrives in Task 7; Task 8 reuses it).
- TDD: failing test first, run it red, then implement. Do not edit a test to make it pass unless the spec changed the rule (Task 1 and Task 4 note where it did).

## Review Focus

1. **Token expires mid-run with 200 rows due** — expect exactly one Meta call, one alert, every row still sendable after the fix (no `dead`, attempts unchanged). Test in Task 4.
2. **Breaker table unavailable (DB error on `notification_health`)** — expect sending to continue normally and an error log, never a stuck queue. Test in Task 4.
3. **One template paused while others are fine** — expect only that template's rows held; receipts keep flowing. Test in Task 4.
4. **Sentry itself throws** — expect the send path and webhook to be unaffected. Test in Task 3.
5. **Daily run never happened yet (fresh deploy, no heartbeat row)** — expect no `daily_missed` alert. Test in Task 5.

---

### Task 1: Error classifier and client result

**Files:**
- Create: `src/lib/notifications/whatsapp/health.ts`
- Modify: `src/lib/notifications/whatsapp/client.ts` (replace `isRetryable` and the failure branch of `SendResult`)
- Modify: `src/lib/notifications/whatsapp/outbox.ts` (the failure branch at the end of `dispatchRow`)
- Test: `tests/unit/whatsappPrimitives.test.ts` (replace the `isRetryable` describe), `tests/api/whatsappOutbox.test.ts` (one test changes — spec rule change)

**Interfaces:**
- Produces:
  - `export type ErrorClass = 'message' | 'retry' | 'throttle' | 'template' | 'system'`
  - `export function classifyMetaError(code: number | null, httpStatus: number): ErrorClass`
  - `export const BREAKER_MS: { system: number; template: number; throttle: number }`
  - `export function breakerKeyFor(cls: ErrorClass, template: string): string | null` — `'system'` for system/throttle, `` `template:${template}` `` for template, `null` otherwise
  - `export function isOpen(breakers: Map<string, number>, key: string, nowMs: number): boolean`
  - `SendResult` failure becomes `{ ok: false; cls: ErrorClass; code: number | null; message: string }`

- [ ] **Step 1: Replace the `isRetryable` tests with classifier tests**

In `tests/unit/whatsappPrimitives.test.ts` change the import on line 17 to
`import { classifyMetaError, breakerKeyFor, isOpen, BREAKER_MS } from '@/lib/notifications/whatsapp/health';`
and replace the whole `describe('isRetryable', …)` block with:

```ts
describe('classifyMetaError (codes verified against Meta, 2026-10-02)', () => {
    const cases: Array<[number | null, number, string]> = [
        [190, 401, 'system'], [0, 401, 'system'], [10, 403, 'system'], [368, 400, 'system'],
        [131031, 400, 'system'], [131042, 400, 'system'], [131048, 400, 'system'], [133010, 400, 'system'],
        [132000, 400, 'template'], [132001, 404, 'template'], [132015, 400, 'template'], [132016, 400, 'template'],
        [4, 400, 'throttle'], [80007, 400, 'throttle'], [130429, 400, 'throttle'], [131057, 400, 'throttle'],
        [131026, 400, 'message'], [131047, 400, 'message'], [131009, 400, 'message'], [100, 400, 'message'],
        [131000, 500, 'retry'], [131056, 400, 'retry'], [133004, 503, 'retry'], [999999, 400, 'retry'],
        [null, 0, 'retry'], [null, 503, 'retry'], [null, 429, 'throttle'], [null, 401, 'system'], [null, 403, 'system'],
    ];
    for (const [code, http, cls] of cases) {
        it(`${code ?? 'no code'} / HTTP ${http} → ${cls}`, () => expect(classifyMetaError(code, http)).toBe(cls));
    }
});

describe('breaker keys', () => {
    it('system and throttle share the system breaker; template errors get their own', () => {
        expect(breakerKeyFor('system', 'vsite_x')).toBe('system');
        expect(breakerKeyFor('throttle', 'vsite_x')).toBe('system');
        expect(breakerKeyFor('template', 'vsite_x')).toBe('template:vsite_x');
        expect(breakerKeyFor('retry', 'vsite_x')).toBeNull();
        expect(breakerKeyFor('message', 'vsite_x')).toBeNull();
    });
    it('isOpen is true only before open_until', () => {
        const m = new Map([['system', NOW + 1000]]);
        expect(isOpen(m, 'system', NOW)).toBe(true);
        expect(isOpen(m, 'system', NOW + 1000)).toBe(false);
        expect(isOpen(m, 'template:x', NOW)).toBe(false);
    });
    it('durations match the spec', () => {
        expect(BREAKER_MS).toEqual({ system: 15 * 60_000, template: 60 * 60_000, throttle: 2 * 60_000 });
    });
});
```

- [ ] **Step 2: Run, confirm red**

Run: `npx vitest run tests/unit/whatsappPrimitives.test.ts`
Expected: FAIL — cannot resolve `@/lib/notifications/whatsapp/health`.

- [ ] **Step 3: Create `health.ts`**

```ts
/**
 * Which Meta errors are about one message and which are about the whole
 * account. Pure. Codes verified against Meta's Cloud API error-code reference
 * on 2026-10-02 (spec: docs/superpowers/specs/2026-10-02-whatsapp-hardening-design.md).
 *
 *   message  — this row can never succeed: dead
 *   retry    — this row may succeed later: back off
 *   throttle — the account is sending too fast: pause everything briefly
 *   template — this template is broken/paused: pause that template, alert
 *   system   — the account cannot send at all: pause everything, alert
 *
 * Unknown codes are `retry` (bounded by MAX_ATTEMPTS), never silently dead.
 */

export type ErrorClass = 'message' | 'retry' | 'throttle' | 'template' | 'system';

const SYSTEM = new Set([0, 3, 10, 190, 200, 368, 131005, 131031, 131042, 131045, 131048, 133010]);
const TEMPLATE = new Set([132000, 132001, 132005, 132007, 132012, 132015, 132016]);
const THROTTLE = new Set([4, 80007, 130429, 131057]);
const MESSAGE = new Set([100, 130472, 131008, 131009, 131021, 131026, 131047, 131051, 131052, 131053]);

export function classifyMetaError(code: number | null, httpStatus: number): ErrorClass {
    if (code !== null) {
        if (SYSTEM.has(code)) return 'system';
        if (TEMPLATE.has(code)) return 'template';
        if (THROTTLE.has(code)) return 'throttle';
        if (MESSAGE.has(code)) return 'message';
        return 'retry';
    }
    if (httpStatus === 401 || httpStatus === 403) return 'system';
    if (httpStatus === 429) return 'throttle';
    return 'retry';
}

const MIN = 60_000;
export const BREAKER_MS = { system: 15 * MIN, template: 60 * MIN, throttle: 2 * MIN };

export function breakerKeyFor(cls: ErrorClass, template: string): string | null {
    if (cls === 'system' || cls === 'throttle') return 'system';
    if (cls === 'template') return `template:${template}`;
    return null;
}

/** `breakers` maps key → open_until (ms). Expired entries are closed. */
export function isOpen(breakers: Map<string, number>, key: string, nowMs: number): boolean {
    const until = breakers.get(key);
    return until !== undefined && until > nowMs;
}
```

- [ ] **Step 4: Switch `client.ts` to the classifier**

In `src/lib/notifications/whatsapp/client.ts`: delete `RETRYABLE_CODES` and `isRetryable` (lines ~27–39), add `import { classifyMetaError, type ErrorClass } from './health';`, and change:

```ts
export type SendResult =
    | { ok: true; wamid: string }
    | { ok: false; cls: ErrorClass; code: number | null; message: string };
```
Network catch → `return { ok: false, cls: 'retry', code: null, message: err instanceof Error ? err.name : 'network' };`
Missing wamid → `return { ok: false, cls: 'retry', code: null, message: 'missing message id' };`
Error branch → `return { ok: false, cls: classifyMetaError(code, res.status), code, message };`
Update the doc comment above the deleted set to: `/** Failures are classified in health.ts; this file only reports them. */`

- [ ] **Step 5: Keep `dispatchRow` compiling — interim mapping**

In `src/lib/notifications/whatsapp/outbox.ts` replace
`const plan = planFailure(attempts, result.retryable, nowMs);`
with
`const plan = planFailure(attempts, result.cls !== 'message', nowMs);`
(Task 4 replaces this branch with breaker handling.)

- [ ] **Step 6: Update the one API test whose rule changed**

In `tests/api/whatsappOutbox.test.ts` replace the test `'a template error is permanent — dead on the first attempt'` with (spec: template errors no longer kill rows):

```ts
    it('a recipient error is permanent — dead on the first attempt', async () => {
        seedOwner();
        const id = await enqueue(receipt()) as string;
        fetchMock.mockResolvedValueOnce(metaErr(131026));
        expect(await dispatchRow(id, NOW)).toBe('dead');
        expect(outbox()[0]).toMatchObject({ status: 'dead', error_code: 131026 });
    });
```

- [ ] **Step 7: Run, confirm green**

Run: `npx vitest run tests/unit/whatsappPrimitives.test.ts tests/api/whatsappOutbox.test.ts tests/acceptance/whatsapp-notifications.test.ts && npx tsc --noEmit`
Expected: all PASS, tsc exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/notifications/whatsapp/health.ts src/lib/notifications/whatsapp/client.ts src/lib/notifications/whatsapp/outbox.ts tests/unit/whatsappPrimitives.test.ts tests/api/whatsappOutbox.test.ts
git commit -m "feat(whatsapp): classify Meta errors into message/retry/throttle/template/system"
```

---

### Task 2: Health store (breakers, heartbeats, alert de-dup) + migration 064

**Files:**
- Create: `supabase/migrations/064_notification_health.sql`
- Create: `src/lib/notifications/whatsapp/healthStore.ts`
- Modify: `tests/fixtures/fakeSupabase.ts` (upsert-merge on conflict; `range()`)
- Create: `tests/api/whatsappHardening.test.ts` (harness + store tests; later tasks append)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces (all in `healthStore.ts`, all server-only):
  - `readBreakers(): Promise<Map<string, number>>` — every row whose key is `system` or starts with `template:` and whose `open_until` is not null → key → open_until ms. Throws on DB error.
  - `openBreaker(key: string, o: { code: number | null; reason: string; untilMs: number; nowMs: number }): Promise<{ newlyOpened: boolean; openUntil: string }>` — newlyOpened is true when the row was absent, closed, or expired.
  - `closeBreaker(key: string, nowMs: number): Promise<void>` — sets `open_until` null.
  - `beat(key: string, nowMs: number): Promise<void>` — upserts `updated_at`.
  - `lastBeat(key: string): Promise<number | null>`
  - `claimAlert(kind: string, everyMs: number, nowMs: number): Promise<boolean>` — true at most once per `everyMs` per kind (row key `alert:<kind>`).
- fakeSupabase: `upsert(p, { onConflict })` without `ignoreDuplicates` merges into the existing row; `.range(from, to)` slices inclusive.

- [ ] **Step 1: Write the migration**

`supabase/migrations/064_notification_health.sql`:
```sql
-- 064 — WhatsApp notification health: circuit breakers, heartbeats, alert de-dup (2026-10-02)
--
-- Spec: docs/superpowers/specs/2026-10-02-whatsapp-hardening-design.md
-- Expand-only. Written only by the server (service_role) from
-- src/lib/notifications/whatsapp/healthStore.ts. No personal data.
--
-- key:  'system' | 'template:<name>'   circuit breakers (open_until null = closed)
--       'heartbeat:daily'              last daily run (updated_at)
--       'alert:<kind>'                 last time that alert fired (updated_at)
--
-- Rollback: DROP TABLE IF EXISTS public.notification_health;

CREATE TABLE IF NOT EXISTS public.notification_health (
    key         text        PRIMARY KEY,
    open_until  timestamptz,
    reason      text,
    code        integer,
    opened_at   timestamptz,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_health ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_health FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_health TO service_role;
```

- [ ] **Step 2: Extend the fake** — in `tests/fixtures/fakeSupabase.ts`:

Add `let rangeN: [number, number] | null = null;` beside `limitN`. In `run()` insert/upsert loop replace the clash handling with:
```ts
                        if (clash) {
                            if (op === 'upsert' && upsertOpts.ignoreDuplicates) continue;
                            if (op === 'upsert') {
                                const existing = rows.find(r => r[clash] === p[clash]) as Row;
                                Object.assign(existing, p);
                                inserted.push(existing);
                                continue;
                            }
                            return { data: null, error: { message: 'duplicate key', code: '23505' } };
                        }
```
After `if (limitN !== null) out = out.slice(0, limitN);` add
`if (rangeN) out = out.slice(rangeN[0], rangeN[1] + 1);`
In the builder add `range(from: number, to: number) { rangeN = [from, to]; return b; },`.
Update the header comment's supported list to mention "upsert (merge or ignoreDuplicates)" and "range".

- [ ] **Step 3: Write the failing store tests** — create `tests/api/whatsappHardening.test.ts`:

```ts
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
```
Later tasks append `describe` blocks to this same file and use these names directly.

- [ ] **Step 4: Run, confirm red**

Run: `npx vitest run tests/api/whatsappHardening.test.ts`
Expected: FAIL — cannot resolve `@/lib/notifications/whatsapp/healthStore`.

- [ ] **Step 5: Implement `healthStore.ts`**

```ts
import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';

/**
 * `notification_health` (migration 064): circuit breakers, heartbeats and
 * alert de-dup stamps. No personal data. Callers decide what a DB failure
 * means — the outbox fails OPEN (keeps sending) when this throws.
 */

const TABLE = 'notification_health';
const iso = (ms: number) => new Date(ms).toISOString();

interface HealthRow { key: string; open_until: string | null; updated_at: string }

async function get(key: string): Promise<HealthRow | null> {
    const { data, error } = await supabaseServer.from(TABLE).select('key, open_until, updated_at').eq('key', key).maybeSingle();
    if (error) throw new Error(`health read failed: ${error.message}`);
    return (data as HealthRow | null) ?? null;
}

async function put(row: Record<string, unknown>): Promise<void> {
    const { error } = await supabaseServer.from(TABLE).upsert(row, { onConflict: 'key' });
    if (error) throw new Error(`health write failed: ${error.message}`);
}

export async function readBreakers(): Promise<Map<string, number>> {
    const { data, error } = await supabaseServer.from(TABLE).select('key, open_until, updated_at');
    if (error) throw new Error(`health read failed: ${error.message}`);
    const out = new Map<string, number>();
    for (const r of (data ?? []) as HealthRow[]) {
        if (!r.open_until || !(r.key === 'system' || r.key.startsWith('template:'))) continue;
        const t = Date.parse(r.open_until);
        if (Number.isFinite(t)) out.set(r.key, t);
    }
    return out;
}

export async function openBreaker(
    key: string,
    o: { code: number | null; reason: string; untilMs: number; nowMs: number },
): Promise<{ newlyOpened: boolean; openUntil: string }> {
    const prev = await get(key);
    const prevUntil = prev?.open_until ? Date.parse(prev.open_until) : 0;
    const newlyOpened = !(prevUntil > o.nowMs);
    const untilMs = Math.max(o.untilMs, newlyOpened ? 0 : prevUntil);
    await put({
        key, open_until: iso(untilMs), reason: o.reason.slice(0, 200), code: o.code,
        ...(newlyOpened ? { opened_at: iso(o.nowMs) } : {}), updated_at: iso(o.nowMs),
    });
    return { newlyOpened, openUntil: iso(untilMs) };
}

export async function closeBreaker(key: string, nowMs: number): Promise<void> {
    const { error } = await supabaseServer.from(TABLE).update({ open_until: null, updated_at: iso(nowMs) }).eq('key', key);
    if (error) throw new Error(`health write failed: ${error.message}`);
}

export async function beat(key: string, nowMs: number): Promise<void> {
    await put({ key, updated_at: iso(nowMs) });
}

export async function lastBeat(key: string): Promise<number | null> {
    const row = await get(key);
    const t = row ? Date.parse(row.updated_at) : NaN;
    return Number.isFinite(t) ? t : null;
}

export async function claimAlert(kind: string, everyMs: number, nowMs: number): Promise<boolean> {
    const key = `alert:${kind}`;
    const last = await lastBeat(key);
    if (last !== null && nowMs - last < everyMs) return false;
    await beat(key, nowMs);
    return true;
}
```

- [ ] **Step 6: Run, confirm green; run the existing WhatsApp suites too (fake changed)**

Run: `npx vitest run tests/api/whatsappHardening.test.ts tests/api/whatsappOutbox.test.ts tests/acceptance/whatsapp-notifications.test.ts && npx tsc --noEmit`
Expected: PASS, tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/064_notification_health.sql src/lib/notifications/whatsapp/healthStore.ts tests/fixtures/fakeSupabase.ts tests/api/whatsappHardening.test.ts
git commit -m "feat(whatsapp): notification_health store — breakers, heartbeats, alert de-dup (064)"
```

---

### Task 3: Sentry alerts

**Files:**
- Create: `src/lib/notifications/whatsapp/alerts.ts`
- Test: `tests/api/whatsappHardening.test.ts` (append)

**Interfaces:**
- Produces:
  - `export type AlertKind = 'breaker_open' | 'template_status' | 'quality_drop' | 'account_update' | 'backlog' | 'dead_spike' | 'not_configured' | 'daily_missed'`
  - `export type AlertDetail = Record<string, string | number | null>`
  - `export function alert(kind: AlertKind, detail: AlertDetail, level?: 'error' | 'warning'): void` — never throws.

- [ ] **Step 1: Append failing tests**

```ts
import { alert } from '@/lib/notifications/whatsapp/alerts';

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
```

- [ ] **Step 2: Run, confirm red** — `npx vitest run tests/api/whatsappHardening.test.ts` → FAIL, cannot resolve `alerts`.

- [ ] **Step 3: Implement `alerts.ts`**

```ts
import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/platform/logger';

/**
 * WhatsApp alerts → Sentry (free plan: email on new/regressed issues).
 * One fingerprint per kind (+ key), so repeats group into one issue and one
 * email. Callers de-dup further (healthStore.claimAlert / newlyOpened) to stay
 * inside the 5k events/month budget. Never pass a phone number, token or
 * message text in `detail`. Never throws.
 */

export type AlertKind =
    | 'breaker_open' | 'template_status' | 'quality_drop' | 'account_update'
    | 'backlog' | 'dead_spike' | 'not_configured' | 'daily_missed';

export type AlertDetail = Record<string, string | number | null>;

export function alert(kind: AlertKind, detail: AlertDetail, level: 'error' | 'warning' = 'error'): void {
    logger.error('[whatsapp-alert]', kind, JSON.stringify(detail));
    try {
        Sentry.captureMessage(`WhatsApp: ${kind}`, {
            level,
            fingerprint: ['whatsapp', kind, String(detail.key ?? '')],
            tags: { area: 'whatsapp', kind },
            extra: detail,
        });
    } catch {
        // Sentry being down must never break a send or a webhook.
    }
}
```

- [ ] **Step 4: Run, confirm green** — same command → PASS. `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/whatsapp/alerts.ts tests/api/whatsappHardening.test.ts
git commit -m "feat(whatsapp): Sentry alerts with stable fingerprints"
```

---

### Task 4: Breakers in the dispatcher

**Files:**
- Modify: `src/lib/notifications/whatsapp/outbox.ts` (`dispatchRow`, `DispatchOutcome`, `DispatchSummary`, `dispatchDue`)
- Modify: `tests/api/whatsappOutbox.test.ts` (harness: `notification_health` unique key, Sentry mock; the throttle test — spec rule change)
- Test: `tests/api/whatsappHardening.test.ts` (append)

**Interfaces:**
- Consumes: `classifyMetaError`, `breakerKeyFor`, `isOpen`, `BREAKER_MS` (Task 1); `readBreakers`, `openBreaker`, `closeBreaker` (Task 2); `alert` (Task 3).
- Produces:
  - `export type DispatchOutcome = 'sent' | 'failed' | 'dead' | 'skipped' | 'paused' | 'not_claimed' | 'not_configured'`
  - `export async function dispatchRow(id: string, nowMs?: number, breakers?: Map<string, number>): Promise<DispatchOutcome>` — when `breakers` is omitted it reads them (fail-open to an empty map). The map is mutated as breakers open/close so later rows in the same run see it.
  - `DispatchSummary` gains `paused: number`.

- [ ] **Step 1: Update the old harness and the rule-changed test**

In `tests/api/whatsappOutbox.test.ts`: add `vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureCheckIn: vi.fn() }));` after the notify mock; in `beforeEach` add `notification_health: []` to `tables` and `notification_health: ['key']` to `unique`. Replace the test `'a throttling error backs off; the next attempt is scheduled'` with:

```ts
    it('a throttling error pauses briefly without spending an attempt', async () => {
        seedOwner();
        const id = await enqueue(receipt()) as string;
        fetchMock.mockResolvedValueOnce(metaErr(130429));
        expect(await dispatchRow(id, NOW)).toBe('failed');
        expect(outbox()[0]).toMatchObject({ status: 'failed', attempts: 0, error_code: 130429 });
        expect(outbox()[0].next_attempt_at).toBe(new Date(NOW + 2 * 60_000).toISOString());
    });
```

- [ ] **Step 2: Append failing breaker tests to `tests/api/whatsappHardening.test.ts`**

```ts
import { enqueue, dispatchRow, dispatchDue } from '@/lib/notifications/whatsapp/outbox';

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
        fetchMock.mockResolvedValue(metaOk());
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
        fetchMock.mockResolvedValue(metaOk());
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
});
```

- [ ] **Step 3: Run, confirm red** — `npx vitest run tests/api/whatsappHardening.test.ts tests/api/whatsappOutbox.test.ts` → the new tests FAIL (no `paused`, rows retried per attempt, no breaker rows).

- [ ] **Step 4: Implement in `outbox.ts`**

Add imports:
```ts
import { BREAKER_MS, breakerKeyFor, isOpen, type ErrorClass } from './health';
import { readBreakers, openBreaker, closeBreaker } from './healthStore';
import { alert } from './alerts';
```
Change the outcome type:
```ts
export type DispatchOutcome = 'sent' | 'failed' | 'dead' | 'skipped' | 'paused' | 'not_claimed' | 'not_configured';
```
Add helpers above `dispatchRow`:
```ts
/** Breakers for this run. Fails OPEN: a health-table outage must not stop sending. */
async function loadBreakers(): Promise<Map<string, number>> {
    try {
        return await readBreakers();
    } catch (err) {
        logger.error('[whatsapp] breaker read failed — sending without breakers:', err instanceof Error ? err.message : 'unknown');
        return new Map();
    }
}

const BREAKER_DURATION: Record<'system' | 'template' | 'throttle', number> = BREAKER_MS;

/** Open the breaker for an account-level error. Returns open_until, or null if the store failed. */
async function trip(breakers: Map<string, number>, cls: ErrorClass, template: string, code: number | null, reason: string, nowMs: number): Promise<string | null> {
    const key = breakerKeyFor(cls, template);
    if (!key || (cls !== 'system' && cls !== 'template' && cls !== 'throttle')) return null;
    try {
        const r = await openBreaker(key, { code, reason, untilMs: nowMs + BREAKER_DURATION[cls], nowMs });
        breakers.set(key, Date.parse(r.openUntil));
        if (r.newlyOpened && cls !== 'throttle') alert('breaker_open', { key, code });
        return r.openUntil;
    } catch (err) {
        logger.error('[whatsapp] breaker write failed:', err instanceof Error ? err.message : 'unknown');
        return null;
    }
}

/** A send succeeded: any expired breaker this row was gated by has recovered. */
async function recover(breakers: Map<string, number>, template: string, nowMs: number): Promise<void> {
    for (const key of ['system', `template:${template}`]) {
        if (!breakers.has(key)) continue;
        breakers.delete(key);
        try {
            await closeBreaker(key, nowMs);
            logger.info('[whatsapp] recovered:', key);
        } catch (err) {
            logger.error('[whatsapp] breaker close failed:', err instanceof Error ? err.message : 'unknown');
        }
    }
}
```
Change the signature and the start of `dispatchRow`:
```ts
export async function dispatchRow(id: string, nowMs: number = Date.now(), breakers?: Map<string, number>): Promise<DispatchOutcome> {
    const config = whatsappConfig();
    if (!config) return 'not_configured';
    const gates = breakers ?? await loadBreakers();
    if (isOpen(gates, 'system', nowMs)) return 'paused';
```
Right after `if (!row) return 'not_claimed';` add:
```ts
    const templateKey = `template:${row.template}`;
    if (isOpen(gates, templateKey, nowMs)) {
        await finish(id, { status: 'failed', next_attempt_at: new Date(gates.get(templateKey) as number).toISOString(), last_error: 'paused' });
        return 'paused';
    }
```
Replace the success branch's `return 'sent';` with `await recover(gates, row.template, nowMs); return 'sent';` (keep the `finish` call before it).
Replace the whole failure tail (from `const plan = planFailure(` to the end of the function) with:
```ts
    if (result.cls === 'system' || result.cls === 'template' || result.cls === 'throttle') {
        const until = await trip(gates, result.cls, row.template, result.code, result.message, nowMs);
        if (until) {
            // Not this row's fault: keep its attempts, retry when the breaker closes.
            await finish(id, { status: 'failed', next_attempt_at: until, last_error: result.message, error_code: result.code });
            return 'failed';
        }
    }
    const plan = planFailure(attempts, result.cls !== 'message', nowMs);
    await finish(id, {
        status: plan.status, attempts, next_attempt_at: plan.nextAttemptAt,
        last_error: result.message, error_code: result.code,
    });
    if (plan.status === 'dead') {
        logger.warn('[whatsapp] message dead:', row.event, 'row', id, 'code', result.code);
    }
    return plan.status;
```
In `DispatchSummary` add `paused: number;`, initialise `paused: 0` in `dispatchDue`, load breakers once (`const breakers = await loadBreakers();` after the config check), pass `breakers` to `dispatchRow(id, nowMs, breakers)`, and count `else if (outcome === 'paused') summary.paused++;`. Also update the cron route's dispatch placeholder object to include `paused: 0` (it lists every summary field for `task=sweep`).

- [ ] **Step 5: Run, confirm green**

Run: `npx vitest run tests/api/whatsappHardening.test.ts tests/api/whatsappOutbox.test.ts tests/acceptance/whatsapp-notifications.test.ts tests/unit/whatsappPrimitives.test.ts && npx tsc --noEmit`
Expected: PASS, tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications/whatsapp/outbox.ts src/app/api/cron/whatsapp/route.ts tests/api/whatsappOutbox.test.ts tests/api/whatsappHardening.test.ts
git commit -m "feat(whatsapp): circuit breakers — account errors pause sending instead of losing messages"
```

---

### Task 5: Throughput (pool of 5, 200 per run) and the watchdog

**Files:**
- Modify: `src/lib/notifications/whatsapp/outbox.ts` (`dispatchDue`)
- Create: `src/lib/notifications/whatsapp/watchdog.ts`
- Test: `tests/api/whatsappHardening.test.ts` (append)

**Interfaces:**
- Consumes: `lastBeat`, `claimAlert` (Task 2); `alert` (Task 3); `isOpen` (Task 1).
- Produces:
  - `dispatchDue` default `limit` 200, sends with concurrency 5.
  - `export async function runWatchdog(nowMs: number, breakers: Map<string, number>): Promise<string[]>` — returns the alert kinds it fired. Never throws (logs instead).
  - `dispatchDue` calls `runWatchdog(nowMs, breakers)` after sending and returns `alerts: string[]` in `DispatchSummary`.

- [ ] **Step 1: Append failing tests**

```ts
import { runWatchdog } from '@/lib/notifications/whatsapp/watchdog';

describe('throughput', () => {
    it('sends up to 200 rows per run, 5 at a time, each row once', async () => {
        seedOwner();
        for (let i = 0; i < 230; i++) await enqueue(receipt(`receipt:${i}`));
        let inFlight = 0, peak = 0;
        fetchMock.mockImplementation(async () => {
            inFlight++; peak = Math.max(peak, inFlight);
            await new Promise(r => setTimeout(r, 1));
            inFlight--;
            return metaOk(`wamid.${Math.random()}`);
        });
        const r = await dispatchDue({ nowMs: NOW });
        expect(r.sent).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(200);
        expect(peak).toBe(5);
        expect(outbox().filter(o => o.status === 'queued')).toHaveLength(30);
    });
});

describe('watchdog', () => {
    it('alerts on a backlog older than 30 minutes, once per hour', async () => {
        seedOwner();
        await enqueue(receipt('receipt:old'));
        outbox()[0].next_attempt_at = new Date(NOW - 45 * MIN).toISOString();
        expect(await runWatchdog(NOW, new Map())).toEqual(['backlog']);
        expect(await runWatchdog(NOW + 10 * MIN, new Map())).toEqual([]);
    });

    it('stays quiet about the backlog while the system breaker is open (already alerted)', async () => {
        seedOwner();
        await enqueue(receipt('receipt:old'));
        outbox()[0].next_attempt_at = new Date(NOW - 45 * MIN).toISOString();
        expect(await runWatchdog(NOW, new Map([['system', NOW + MIN]]))).toEqual([]);
    });

    it('alerts when 5 or more rows died in the last hour', async () => {
        for (let i = 0; i < 5; i++) {
            outbox().push({ id: `d${i}`, idempotency_key: `k${i}`, status: 'dead', updated_at: new Date(NOW - 10 * MIN).toISOString(), created_at: new Date(NOW - 20 * MIN).toISOString() });
        }
        expect(await runWatchdog(NOW, new Map())).toEqual(['dead_spike']);
    });

    it('alerts when the daily heartbeat is older than 26 hours', async () => {
        health().push({ key: 'heartbeat:daily', updated_at: new Date(NOW - 27 * HOUR).toISOString(), open_until: null });
        expect(await runWatchdog(NOW, new Map())).toEqual(['daily_missed']);
    });

    it('does not alert before the first daily run ever happened', async () => {
        expect(await runWatchdog(NOW, new Map())).toEqual([]);
    });

    it('never throws when the database fails', async () => {
        holder.db.failNext = { table: 'notification_outbox', op: 'select' };
        await expect(runWatchdog(NOW, new Map())).resolves.toEqual([]);
    });
});
```

- [ ] **Step 2: Run, confirm red** — `npx vitest run tests/api/whatsappHardening.test.ts` → FAIL (watchdog missing; 50-row limit; sequential).

- [ ] **Step 3: Implement `watchdog.ts`**

```ts
import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { logger } from '@/lib/platform/logger';
import { alert, type AlertKind } from './alerts';
import { claimAlert, lastBeat } from './healthStore';
import { isOpen } from './health';

/**
 * Runs after every dispatch (every 10 min). Catches what no single send can
 * see: a queue that is not draining, a burst of permanent failures, a daily
 * job that stopped. Each alert kind fires at most once an hour.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
export const BACKLOG_MS = 30 * MIN;
export const DEAD_SPIKE = 5;
export const DAILY_MISSED_MS = 26 * HOUR;

export async function runWatchdog(nowMs: number, breakers: Map<string, number>): Promise<string[]> {
    const fired: string[] = [];
    const fire = async (kind: AlertKind, detail: Record<string, string | number | null>) => {
        if (await claimAlert(kind, HOUR, nowMs)) { alert(kind, detail); fired.push(kind); }
    };
    try {
        if (!isOpen(breakers, 'system', nowMs)) {
            const { data, error } = await supabaseServer
                .from('notification_outbox').select('id, next_attempt_at')
                .in('status', ['queued', 'failed'])
                .lt('next_attempt_at', new Date(nowMs - BACKLOG_MS).toISOString())
                .order('next_attempt_at', { ascending: true }).limit(1);
            if (error) throw new Error(error.message);
            const oldest = (data ?? [])[0] as { next_attempt_at: string } | undefined;
            if (oldest) await fire('backlog', { oldestMinutes: Math.round((nowMs - Date.parse(oldest.next_attempt_at)) / MIN) });
        }

        const { data: dead, error: deadErr } = await supabaseServer
            .from('notification_outbox').select('id')
            .eq('status', 'dead')
            .gt('updated_at', new Date(nowMs - HOUR).toISOString())
            .limit(DEAD_SPIKE);
        if (deadErr) throw new Error(deadErr.message);
        if ((dead ?? []).length >= DEAD_SPIKE) await fire('dead_spike', { deadLastHour: (dead ?? []).length });

        const daily = await lastBeat('heartbeat:daily');
        if (daily !== null && nowMs - daily > DAILY_MISSED_MS) {
            await fire('daily_missed', { hoursSinceDaily: Math.round((nowMs - daily) / HOUR) });
        }
    } catch (err) {
        logger.error('[whatsapp] watchdog failed:', err instanceof Error ? err.message : 'unknown');
    }
    return fired;
}
```

- [ ] **Step 4: Pool + watchdog in `dispatchDue`**

In `outbox.ts` add `import { runWatchdog } from './watchdog';`, add `alerts: string[]` to `DispatchSummary` (initialise `alerts: []`), change `const limit = opts.limit ?? 50;` to `?? 200`, and replace the `for (const id of ids) { … }` loop with:

```ts
    const CONCURRENCY = 5;
    let next = 0;
    const worker = async () => {
        while (next < ids.length && Date.now() <= deadline) {
            const id = ids[next++];
            summary.attempted++;
            let outcome: DispatchOutcome;
            try {
                outcome = await dispatchRow(id, nowMs, breakers);
            } catch (err) {
                logger.error('[whatsapp] dispatch error for row', id, err instanceof Error ? err.message : 'unknown');
                continue;
            }
            if (outcome === 'sent') summary.sent++;
            else if (outcome === 'failed') summary.failed++;
            else if (outcome === 'dead') summary.dead++;
            else if (outcome === 'skipped') summary.skipped++;
            else if (outcome === 'paused') summary.paused++;
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
    summary.alerts = await runWatchdog(nowMs, breakers);
```
Also, when the system breaker is open at the start of a run (`isOpen(breakers, 'system', nowMs)`), skip the select and the loop, set `summary.paused` to the number of due ids found (select them as today, then count), and still run the watchdog. Add `alerts: []` to the cron route's `task=sweep` placeholder object.

Note on the token-expiry test from Task 4: rows 2–20 now race in 5 workers; the first 190 opens the breaker and mutates `breakers`, but up to 4 other workers may already be past the `isOpen` check. Make the Task 4 test robust by asserting `fetchMock` was called **at most 5** times, `captureMessage` exactly once, and no row `dead` with attempts 0 — update that test's two expectations accordingly in this step (`toHaveBeenCalledTimes(1)` → `expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(5)`; `r.paused` → `expect(r.paused + r.failed).toBe(20)`). This is a consequence of the spec's concurrency requirement, not a weakened guarantee: no message is lost and one alert fires.

- [ ] **Step 5: Run, confirm green** — `npx vitest run tests/api/whatsappHardening.test.ts tests/api/whatsappOutbox.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications/whatsapp/outbox.ts src/lib/notifications/whatsapp/watchdog.ts src/app/api/cron/whatsapp/route.ts tests/api/whatsappHardening.test.ts
git commit -m "feat(whatsapp): send 5 at a time, 200 per run; watchdog for backlog, dead spikes, missed daily run"
```

---

### Task 6: Sweep pagination and daily housekeeping (heartbeat, retention, not-configured)

**Files:**
- Modify: `src/lib/notifications/whatsapp/sweep.ts` (both queries page with `.range`)
- Create: `src/lib/notifications/whatsapp/housekeeping.ts`
- Modify: `src/app/api/cron/whatsapp/route.ts` (daily task calls housekeeping)
- Test: `tests/api/whatsappHardening.test.ts` (append)

**Interfaces:**
- Consumes: `beat`, `claimAlert` (Task 2); `alert` (Task 3); `whatsappConfig` (client.ts).
- Produces:
  - `runSweep(nowMs)` pages 500 rows at a time until a short page (no 1,000 cap).
  - `export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000`
  - `export async function runHousekeeping(nowMs: number): Promise<{ purged: number }>` — purges, then writes `heartbeat:daily`, then the not-configured check. Never throws.

- [ ] **Step 1: Append failing tests**

```ts
import { runSweep } from '@/lib/notifications/whatsapp/sweep';
import { runHousekeeping } from '@/lib/notifications/whatsapp/housekeeping';

describe('sweep pagination', () => {
    it('enqueues every due store, beyond one page', async () => {
        for (let i = 0; i < 1200; i++) {
            holder.db.tables.profiles.push({ id: `u${i}`, phone_number: '+919800000001' });
            holder.db.tables.sites.push({ id: `s${i}`, user_id: `u${i}`, name: `Shop ${i}`, slug: `shop-${i}` });
            holder.db.tables.site_subscriptions.push({ site_id: `s${i}`, user_id: `u${i}`, store_expires_at: null, trial_ends_at: new Date(NOW + 24 * HOUR).toISOString() });
        }
        const r = await runSweep(NOW);
        expect(r.enqueued).toBe(1200);
    });
});

describe('housekeeping', () => {
    it('deletes outbox rows older than 90 days and keeps newer ones', async () => {
        outbox().push({ id: 'old', idempotency_key: 'a', status: 'read', created_at: new Date(NOW - 91 * DAY).toISOString() });
        outbox().push({ id: 'new', idempotency_key: 'b', status: 'read', created_at: new Date(NOW - 89 * DAY).toISOString() });
        const r = await runHousekeeping(NOW);
        expect(r.purged).toBe(1);
        expect(outbox().map(o => o.id)).toEqual(['new']);
    });

    it('writes the daily heartbeat', async () => {
        await runHousekeeping(NOW);
        expect(health().find(h => h.key === 'heartbeat:daily')?.updated_at).toBe(new Date(NOW).toISOString());
    });

    it('warns once a day when production has no WhatsApp config', async () => {
        delete process.env.WHATSAPP_ACCESS_TOKEN;
        vi.stubEnv('NODE_ENV', 'production');
        await runHousekeeping(NOW);
        await runHousekeeping(NOW + HOUR);
        vi.unstubAllEnvs();
        expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
        expect(sentry.captureMessage.mock.calls[0][1]).toMatchObject({ level: 'warning', fingerprint: ['whatsapp', 'not_configured', ''] });
    });

    it('never throws when the database fails', async () => {
        holder.db.failNext = { table: 'notification_outbox', op: 'select' };
        await expect(runHousekeeping(NOW)).resolves.toEqual({ purged: 0 });
    });
});
```

- [ ] **Step 2: Run, confirm red** — FAIL (housekeeping missing; sweep stops at 1,000).

- [ ] **Step 3: Paginate `sweep.ts`**

Replace `const QUERY_CAP = 1000;` with `const PAGE = 500;` and add:
```ts
/** Pages a window query until a short page. Bounded windows keep this small. */
async function pageAll<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, label: string): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await query(from, from + PAGE - 1);
        if (error) throw new Error(`sweep ${label} query failed: ${error.message}`);
        const rows = (data ?? []) as T[];
        out.push(...rows);
        if (rows.length < PAGE) return out;
    }
}
```
Replace the `Promise.all([...])` block, the two `if (…Res.error)` lines, the two `as unknown as` casts and the cap warning with:
```ts
    const [trialSubs, planSubs] = await Promise.all([
        pageAll<TrialSub>((from, to) => supabaseServer
            .from('site_subscriptions')
            .select('site_id, user_id, store_expires_at, trial_ends_at, sites!inner(name)')
            .gt('trial_ends_at', w.trialEnds.gt)
            .lte('trial_ends_at', w.trialEnds.lte)
            .order('site_id', { ascending: true })
            .range(from, to), 'trial'),
        pageAll<PlanSub>((from, to) => supabaseServer
            .from('site_subscriptions')
            .select('site_id, user_id, store_expires_at, sites!inner(name)')
            .gt('store_expires_at', w.planExpires.gt)
            .lte('store_expires_at', w.planExpires.lte)
            .order('site_id', { ascending: true })
            .range(from, to), 'plan'),
    ]);
```
The profiles lookup `.in('id', userIds)` must also chunk: split `userIds` into chunks of 500 and merge the results into the `phones` map (one query per chunk, same select).

- [ ] **Step 4: Implement `housekeeping.ts`**

```ts
import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { logger } from '@/lib/platform/logger';
import { alert } from './alerts';
import { beat, claimAlert } from './healthStore';
import { whatsappConfig } from './client';

/**
 * Daily duties after the sweep: drop message history older than 90 days (it
 * holds phone numbers — DPDP Act), record the daily heartbeat the watchdog
 * checks, and warn if production has no WhatsApp config. Never throws.
 */

export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const BATCH = 1000;
const MAX_BATCHES = 10;

export async function runHousekeeping(nowMs: number): Promise<{ purged: number }> {
    let purged = 0;
    try {
        const cutoff = new Date(nowMs - RETENTION_MS).toISOString();
        for (let i = 0; i < MAX_BATCHES; i++) {
            const { data, error } = await supabaseServer.from('notification_outbox').select('id').lt('created_at', cutoff).limit(BATCH);
            if (error) throw new Error(error.message);
            const ids = ((data ?? []) as Array<{ id: string }>).map(r => r.id);
            if (ids.length === 0) break;
            const { error: delErr } = await supabaseServer.from('notification_outbox').delete().in('id', ids);
            if (delErr) throw new Error(delErr.message);
            purged += ids.length;
            if (ids.length < BATCH) break;
        }
    } catch (err) {
        logger.error('[whatsapp] retention purge failed:', err instanceof Error ? err.message : 'unknown');
    }
    try {
        await beat('heartbeat:daily', nowMs);
        if (process.env.NODE_ENV === 'production' && !whatsappConfig() && await claimAlert('not_configured', 24 * 60 * 60 * 1000, nowMs)) {
            alert('not_configured', {}, 'warning');
        }
    } catch (err) {
        logger.error('[whatsapp] heartbeat failed:', err instanceof Error ? err.message : 'unknown');
    }
    return { purged };
}
```

- [ ] **Step 5: Call it from the cron route**

In `src/app/api/cron/whatsapp/route.ts` import `runHousekeeping` and, in the no-task (daily) path only, after `runSweep()`:
```ts
        const housekeeping = task ? { purged: 0 } : await runHousekeeping(Date.now());
```
and spread `...housekeeping` into `summary`.

- [ ] **Step 6: Run, confirm green** — `npx vitest run tests/api/whatsappHardening.test.ts tests/api/whatsappOutbox.test.ts && npx tsc --noEmit` → PASS. (The existing `runSweep` tests must still pass unchanged.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/notifications/whatsapp/sweep.ts src/lib/notifications/whatsapp/housekeeping.ts src/app/api/cron/whatsapp/route.ts tests/api/whatsappHardening.test.ts
git commit -m "feat(whatsapp): sweep pages every store; daily heartbeat, 90-day retention, not-configured warning"
```

---

### Task 7: Sentry Cron Monitor check-in (dispatch only)

**Files:**
- Modify: `src/app/api/cron/whatsapp/route.ts`
- Test: `tests/api/whatsappHardening.test.ts` (append)

**Interfaces:**
- Consumes: the cron route's existing `handle(req)`.
- Produces: `export const DISPATCH_MONITOR = { slug: 'whatsapp-dispatch', config: { schedule: { type: 'crontab', value: '*/10 * * * *' }, checkinMargin: 5, maxRuntime: 2, timezone: 'Etc/UTC' } } as const` exported from the route module's sibling `src/lib/notifications/whatsapp/monitor.ts` (route files may only export handlers and route config).

- [ ] **Step 1: Append failing tests**

```ts
import { NextRequest } from 'next/server';
import { POST as cronPost } from '@/app/api/cron/whatsapp/route';

describe('cron check-in (one monitor: whatsapp-dispatch)', () => {
    const url = 'https://vsite.in/api/cron/whatsapp?task=dispatch';
    const auth = { authorization: `Bearer ${ENV.CRON_SECRET}` };

    it('checks in in_progress then ok around a dispatch run', async () => {
        const res = await cronPost(new NextRequest(url, { method: 'POST', headers: auth }));
        expect(res.status).toBe(200);
        expect(sentry.captureCheckIn).toHaveBeenNthCalledWith(1,
            { monitorSlug: 'whatsapp-dispatch', status: 'in_progress' },
            expect.objectContaining({ schedule: { type: 'crontab', value: '*/10 * * * *' }, checkinMargin: 5 }));
        expect(sentry.captureCheckIn).toHaveBeenNthCalledWith(2,
            { checkInId: 'checkin-1', monitorSlug: 'whatsapp-dispatch', status: 'ok' });
    });

    it('checks in error when the run fails', async () => {
        holder.db.failNext = { table: 'notification_outbox', op: 'update' }; // reclaim step throws
        const res = await cronPost(new NextRequest(url, { method: 'POST', headers: auth }));
        expect(res.status).toBe(500);
        expect(sentry.captureCheckIn).toHaveBeenLastCalledWith({ checkInId: 'checkin-1', monitorSlug: 'whatsapp-dispatch', status: 'error' });
    });

    it('the daily run does not use a monitor (free plan has one)', async () => {
        await cronPost(new NextRequest('https://vsite.in/api/cron/whatsapp', { method: 'POST', headers: auth }));
        expect(sentry.captureCheckIn).not.toHaveBeenCalled();
    });

    it('an unauthorised call never checks in', async () => {
        await cronPost(new NextRequest(url, { method: 'POST' }));
        expect(sentry.captureCheckIn).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run, confirm red** — FAIL (no check-ins).

- [ ] **Step 3: Implement**

Create `src/lib/notifications/whatsapp/monitor.ts`:
```ts
/**
 * The one Sentry Cron Monitor (free plan allows one). pg_cron calls dispatch
 * every 10 minutes; if a check-in is missed by 5 minutes, Sentry emails.
 * The daily run is covered by the watchdog's heartbeat check instead.
 */
export const DISPATCH_MONITOR = {
    slug: 'whatsapp-dispatch',
    config: { schedule: { type: 'crontab', value: '*/10 * * * *' }, checkinMargin: 5, maxRuntime: 2, timezone: 'Etc/UTC' },
} as const;
```
In the route add `import * as Sentry from '@sentry/nextjs';` and `import { DISPATCH_MONITOR } from '@/lib/notifications/whatsapp/monitor';`. After the auth check:
```ts
    const monitored = task === 'dispatch';
    let checkInId: string | undefined;
    if (monitored) {
        try {
            checkInId = Sentry.captureCheckIn({ monitorSlug: DISPATCH_MONITOR.slug, status: 'in_progress' }, DISPATCH_MONITOR.config);
        } catch { /* monitoring must never block sending */ }
    }
    const checkOut = (status: 'ok' | 'error') => {
        if (!monitored || !checkInId) return;
        try { Sentry.captureCheckIn({ checkInId, monitorSlug: DISPATCH_MONITOR.slug, status }); } catch { /* ignore */ }
    };
```
Call `checkOut('ok')` just before the success `return`, and `checkOut('error')` in the `catch` before its `return`. Replace the existing `console.error` in that catch with `logger.error` (hard rule: no console in new code paths you touch).

- [ ] **Step 4: Run, confirm green** — `npx vitest run tests/api/whatsappHardening.test.ts tests/api/whatsappOutbox.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/whatsapp/monitor.ts src/app/api/cron/whatsapp/route.ts tests/api/whatsappHardening.test.ts
git commit -m "feat(whatsapp): Sentry cron check-in for the 10-minute dispatch"
```

---

### Task 8: Webhook — template status, number quality, account updates

**Files:**
- Create: `src/lib/notifications/whatsapp/accountEvents.ts`
- Modify: `src/app/api/webhooks/whatsapp/route.ts`
- Test: `tests/api/whatsappHardening.test.ts` (append)

**Interfaces:**
- Consumes: `openBreaker`, `closeBreaker` (Task 2); `alert` (Task 3).
- Produces: `export async function applyAccountEvent(field: string, value: Record<string, unknown>, nowMs: number): Promise<void>` — handles `message_template_status_update`, `phone_number_quality_update`, `account_update`; ignores anything else; throws only on DB error (webhook then answers 500 so Meta retries).
  - `export const TEMPLATE_HOLD_MS = 6 * 60 * 60 * 1000`

- [ ] **Step 1: Append failing tests**

```ts
import crypto from 'node:crypto';                                   // top import block
import { POST as webhookPost } from '@/app/api/webhooks/whatsapp/route';  // top import block (NextRequest already imported in Task 7)

function signed(body: unknown) {
    const raw = JSON.stringify(body);
    const sig = 'sha256=' + crypto.createHmac('sha256', ENV.WHATSAPP_APP_SECRET).update(raw).digest('hex');
    return new NextRequest('https://vsite.in/api/webhooks/whatsapp', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': sig, 'content-type': 'application/json' } });
}
const change = (field: string, value: Record<string, unknown>) => ({ object: 'whatsapp_business_account', entry: [{ id: 'waba', changes: [{ field, value }] }] });

describe('webhook account events', () => {
    it('a paused template opens its breaker and alerts', async () => {
        const res = await webhookPost(signed(change('message_template_status_update', { event: 'PAUSED', message_template_name: 'vsite_welcome_qr', reason: 'LOW_QUALITY' })));
        expect(res.status).toBe(200);
        expect(health().find(h => h.key === 'template:vsite_welcome_qr')).toBeTruthy();
        expect(sentry.captureMessage.mock.calls[0][1]).toMatchObject({ fingerprint: ['whatsapp', 'template_status', 'template:vsite_welcome_qr'] });
    });

    it('APPROVED closes that template breaker without an alert', async () => {
        await webhookPost(signed(change('message_template_status_update', { event: 'DISABLED', message_template_name: 'vsite_plan_expired' })));
        sentry.captureMessage.mockReset();
        await webhookPost(signed(change('message_template_status_update', { event: 'APPROVED', message_template_name: 'vsite_plan_expired' })));
        expect(health().find(h => h.key === 'template:vsite_plan_expired')?.open_until).toBeNull();
        expect(sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('a quality downgrade warns; an upgrade does not', async () => {
        await webhookPost(signed(change('phone_number_quality_update', { event: 'DOWNGRADE', current_limit: 'TIER_250', display_phone_number: '919000000000' })));
        await webhookPost(signed(change('phone_number_quality_update', { event: 'UPGRADE', current_limit: 'TIER_1K' })));
        expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
        const payload = JSON.stringify(sentry.captureMessage.mock.calls[0]);
        expect(payload).toContain('quality_drop');
        expect(payload).not.toContain('919000000000'); // never our number in Sentry
    });

    it('an account restriction alerts', async () => {
        await webhookPost(signed(change('account_update', { event: 'ACCOUNT_RESTRICTION' })));
        expect(sentry.captureMessage.mock.calls[0][0]).toBe('WhatsApp: account_update');
    });

    it('still rejects an unsigned body before reading any field', async () => {
        const req = new NextRequest('https://vsite.in/api/webhooks/whatsapp', { method: 'POST', body: JSON.stringify(change('account_update', { event: 'ACCOUNT_RESTRICTION' })) });
        expect((await webhookPost(req)).status).toBe(401);
        expect(sentry.captureMessage).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run, confirm red** — FAIL (fields ignored).

- [ ] **Step 3: Implement `accountEvents.ts`**

```ts
import 'server-only';
import { alert } from './alerts';
import { closeBreaker, openBreaker } from './healthStore';

/**
 * Meta webhook fields about the account rather than one message. Subscribe
 * them in App Dashboard → WhatsApp → Configuration → Webhook fields.
 * Never forwards a phone number (display_phone_number is dropped).
 */

export const TEMPLATE_HOLD_MS = 6 * 60 * 60 * 1000;
const BAD_TEMPLATE = new Set(['PAUSED', 'DISABLED', 'REJECTED', 'FLAGGED', 'PENDING_DELETION']);
const BAD_QUALITY = new Set(['FLAGGED', 'DOWNGRADE']);
const BAD_ACCOUNT = new Set(['DISABLED_UPDATE', 'ACCOUNT_RESTRICTION', 'ACCOUNT_VIOLATION', 'ACCOUNT_DELETED']);

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v.slice(0, 100) : null);

export async function applyAccountEvent(field: string, value: Record<string, unknown>, nowMs: number): Promise<void> {
    const event = str(value.event);
    if (!event) return;

    if (field === 'message_template_status_update') {
        const name = str(value.message_template_name);
        if (!name) return;
        const key = `template:${name}`;
        if (BAD_TEMPLATE.has(event)) {
            await openBreaker(key, { code: null, reason: `${event} ${str(value.reason) ?? ''}`.trim(), untilMs: nowMs + TEMPLATE_HOLD_MS, nowMs });
            alert('template_status', { key, event, reason: str(value.reason) });
        } else if (event === 'APPROVED' || event === 'REINSTATED') {
            await closeBreaker(key, nowMs);
        }
        return;
    }
    if (field === 'phone_number_quality_update') {
        if (BAD_QUALITY.has(event)) alert('quality_drop', { event, currentLimit: str(value.current_limit) }, 'warning');
        return;
    }
    if (field === 'account_update') {
        if (BAD_ACCOUNT.has(event)) alert('account_update', { event });
    }
}
```

- [ ] **Step 4: Wire into the webhook**

In `route.ts`: import `applyAccountEvent`; widen the change type to `value?: { statuses?: MetaStatus[]; messages?: unknown[] } & Record<string, unknown>`; in the loop collect `const accountChanges: Array<{ field: string; value: Record<string, unknown> }> = [];` — for `change.field !== 'messages'`, push `{ field: change.field, value: change.value }` when both exist and `continue`. Inside the existing `try`, before applying statuses:
```ts
        for (const c of accountChanges) await applyAccountEvent(c.field, c.value, Date.now());
```
Update the header comment: subscribe `messages`, `message_template_status_update`, `phone_number_quality_update`, `account_update`.

- [ ] **Step 5: Run, confirm green** — `npx vitest run tests/api/whatsappHardening.test.ts tests/api/whatsappOutbox.test.ts tests/acceptance/whatsapp-notifications.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications/whatsapp/accountEvents.ts src/app/api/webhooks/whatsapp/route.ts tests/api/whatsappHardening.test.ts
git commit -m "feat(whatsapp): webhook handles template status, number quality and account updates"
```

---

### Task 9: Acceptance criteria, docs, exit check

**Files:**
- Modify: `tests/acceptance/whatsapp-notifications.test.ts` (append AC8–AC10)
- Modify: `docs/whatsapp-setup.md`, `AGENTS.md`, `docs/PROGRESS.md`, `docs/PLAN.md`

**Interfaces:**
- Consumes: everything above.
- Produces: none.

- [ ] **Step 1: Append acceptance tests**

```ts
describe('AC8 — account errors never lose messages', () => {
    it('the outbox trips a breaker for system/template/throttle classes', () => {
        const outboxSrc = src('lib/notifications/whatsapp/outbox.ts');
        expect(outboxSrc).toMatch(/result\.cls === 'system' \|\| result\.cls === 'template' \|\| result\.cls === 'throttle'/);
        expect(outboxSrc).toMatch(/Not this row's fault: keep its attempts/);
    });
});

describe('AC9 — alerts and monitoring fit the Sentry free plan', () => {
    it('exactly one cron monitor slug exists in the codebase', () => {
        expect(src('lib/notifications/whatsapp/monitor.ts')).toMatch(/slug: 'whatsapp-dispatch'/);
        expect(src('app/api/cron/whatsapp/route.ts').match(/monitorSlug:/g)?.length).toBe(2); // in_progress + close
    });
    it('alerts never carry a phone number field', () => {
        for (const f of ['alerts.ts', 'watchdog.ts', 'housekeeping.ts', 'accountEvents.ts', 'outbox.ts']) {
            const s = src(`lib/notifications/whatsapp/${f}`);
            expect(s, f).not.toMatch(/alert\([^)]*(phone|to_phone|display_phone_number)/);
        }
    });
});

describe('AC10 — migration 064', () => {
    const sql = readFileSync(join(root, 'supabase', 'migrations', '064_notification_health.sql'), 'utf8').toLowerCase();
    it('is service-role only with RLS on', () => {
        expect(sql).toMatch(/enable row level security/);
        expect(sql).toMatch(/revoke all on table public\.notification_health from public, anon, authenticated/);
    });
    it('is expand-only', () => {
        expect(sql).not.toMatch(/^\s*(drop|alter table [^;]* drop)/m);
    });
});
```
Run: `npx vitest run tests/acceptance/whatsapp-notifications.test.ts` → PASS (features exist by now; if any fail, fix the implementation, not the test).

- [ ] **Step 2: Runbook** — in `docs/whatsapp-setup.md`:
  - Step 3 (Supabase): after 062, apply `064_notification_health.sql`; then the Vault secret; then 063.
  - Step 4 (Meta webhook): subscribe four fields: `messages`, `message_template_status_update`, `phone_number_quality_update`, `account_update`.
  - New section "Alerts (Sentry, free plan)": (1) Sentry → Alerts → Create → Issues → "A new issue is created" OR "issue changes state from resolved to unresolved", filter tag `area` equals `whatsapp`, action: email you. (2) Sentry → Crons: the `whatsapp-dispatch` monitor appears after the first run; set its alert to email you on missed/failed check-ins. (3) Budget: free plan is 5k events/month shared with the app; WhatsApp alerts are de-duplicated to a few per incident.
  - Operating table: add rows — "breaker_open system 190 → new System User token; sending resumes by itself within 15 min", "template_status PAUSED → fix wording in WhatsApp Manager; APPROVED reopens it".

- [ ] **Step 3: AGENTS.md** — append under "## WhatsApp notification layer":
```
- **Account-level Meta errors pause, they do not kill.** health.ts classifies
  every code (verified 2026-10-02). system/template/throttle → breaker in
  notification_health (064), row back to `failed` with attempts unchanged.
  Do not "simplify" these back to dead rows: a 190 would destroy the queue.
- **133010 is OUR number not registered**, not "recipient not on WhatsApp".
- **Breakers fail open.** If notification_health is unreadable, sending continues.
- **Sentry free plan = one cron monitor** (`whatsapp-dispatch`). The daily run
  is watched through `heartbeat:daily` by the watchdog, not a second monitor.
```

- [ ] **Step 4: PLAN.md / PROGRESS.md** — prepend to `docs/PLAN.md` a short entry pointing at this plan file with status; prepend to `docs/PROGRESS.md` a dated entry: what shipped (Tasks 1–8 one line each), verification numbers from Step 5, owner actions (apply 064 with 062/063, Sentry alert rule, subscribe 3 more webhook fields).

- [ ] **Step 5: Exit check**

Run:
```
npx vitest run
npx tsc --noEmit
npm run lint
```
Expected: vitest — only the 69 pre-existing `tests/unit/claude-hooks/*` failures (they need the gitignored `.claude/`); tsc exit 0; lint 0 errors. Record the exact numbers in PROGRESS.md.

- [ ] **Step 6: Commit**

```bash
git add tests/acceptance/whatsapp-notifications.test.ts ../../docs/whatsapp-setup.md ../../AGENTS.md ../../docs/PROGRESS.md ../../docs/PLAN.md
git commit -m "docs(whatsapp): hardening runbook, gotchas, acceptance AC8–AC10"
```
