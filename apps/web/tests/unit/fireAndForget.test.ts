/**
 * Fire-and-forget Supabase writes must handle rejection, not just `{ error }`.
 *
 * ── The bug these tests pin down ────────────────────────────────────────────
 * Several server paths kick off a write they deliberately don't await, and read
 * the outcome with a lone `.then(({ error }) => ...)`. That handles a PostgREST
 * error, which arrives IN BAND as a resolved `{ data, error }` — but a transport
 * failure (DNS, TCP reset, TLS, an aborted fetch, Supabase restarting) does not
 * resolve. It REJECTS.
 *
 * A rejection with no rejection handler attached, on a promise nobody awaits, is
 * an unhandled rejection. Node has defaulted to `--unhandled-rejections=throw`
 * since v15, and this app runs Node 22: the process exits, code 1. `.do/app.yaml`
 * pins `instance_count: 1`, so that is not one dropped notification — it is every
 * customer's QR menu, every dashboard and the payment routes going dark until the
 * platform restarts the container.
 *
 * `notify()` is the one that matters most: /api/subscription/verify-payment calls
 * it, un-awaited, immediately after activating a paid plan.
 *
 * ── Why the fix is two-argument `then`, not `.catch()` ──────────────────────
 * `PostgrestBuilder implements PromiseLike` — it declares `then(onfulfilled,
 * onrejected)` and NOTHING else. There is no `.catch()` on the builder, so the
 * reflexive fix is itself a TypeError. The second argument to `then` is the only
 * rejection handler these chains can carry before they are awaited or wrapped.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('server-only', () => ({}));

/** Records how each fire-and-forget chain was subscribed to. */
interface Subscription {
    onRejected: ((reason: unknown) => unknown) | null | undefined;
}
const subscriptions: Subscription[] = [];

/** A PromiseLike shaped exactly like PostgrestBuilder: `then` only, no `catch`. */
function rejectingBuilder() {
    return {
        then(
            _onFulfilled?: ((v: unknown) => unknown) | null,
            onRejected?: ((reason: unknown) => unknown) | null,
        ) {
            subscriptions.push({ onRejected });
            return { then() { /* terminal */ } };
        },
    };
}

vi.mock('@/lib/platform/db/supabase-server', () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'select', 'insert', 'update', 'delete', 'upsert', 'eq', 'lt', 'gt', 'is']) {
        chain[m] = vi.fn(() => chain);
    }
    chain.then = rejectingBuilder().then;
    return {
        supabaseServer: {
            from: vi.fn(() => chain),
            rpc: vi.fn(async () => ({ error: null })),
        },
    };
});

import { notify } from '@/lib/notifications/notify';

const SERVER_FILES = [
    'lib/notifications/notify.ts',
    'app/api/cron/cleanup/route.ts',
    'app/api/manage/payments/razorpay/connect/route.ts',
    'app/api/orders/finalize-payment/route.ts',
    'app/api/orders/[id]/route.ts',
];

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

/**
 * True when the statement containing offset `i` is governed by `await`.
 *
 * An awaited chain is NOT the bug: its rejection propagates into the enclosing
 * try/catch, or out of the route handler where Next.js turns it into a 500. Only
 * a chain nobody awaits becomes an unhandled rejection that exits the process,
 * so flagging awaited ones would be demanding a change that fixes nothing.
 */
function isAwaited(source: string, i: number): boolean {
    // Walk backwards to the head of this statement, tracking bracket depth so
    // the argument objects and call parens in the middle of the chain are
    // skipped. Only text at depth 0 belongs to the statement itself — which is
    // where an `await` governing the whole chain would sit.
    let depth = 0;
    let head = '';
    for (let j = i - 1; j >= 0; j--) {
        const c = source[j];
        if (c === ')' || c === '}' || c === ']') { depth++; continue; }
        if (c === '(' || c === '{' || c === '[') {
            if (depth === 0) break;          // escaped into the enclosing block
            depth--;
            continue;
        }
        if (depth > 0) continue;
        if (c === ';') break;                // previous statement
        head = c + head;
    }
    return /\bawait\b/.test(head);
}

/**
 * Every un-awaited `.then(` in `source` that is missing a rejection handler.
 *
 * Balances (), {} and [] from the opening paren of `.then(`, so a comma seen at
 * depth exactly 1 is genuinely `then`'s second argument and not a comma inside
 * an object literal, an arrow body or a nested call. A trailing `.catch(` counts
 * too, for any chain that has been wrapped into a real Promise first.
 */
function thenCallsWithoutRejectionHandler(source: string): number[] {
    const offenders: number[] = [];
    const needle = '.then(';
    for (let i = source.indexOf(needle); i !== -1; i = source.indexOf(needle, i + 1)) {
        let depth = 0;
        let hasSecondArg = false;
        let j = i + needle.length - 1;      // at the '('
        for (; j < source.length; j++) {
            const c = source[j];
            if (c === '(' || c === '{' || c === '[') depth++;
            else if (c === ')' || c === '}' || c === ']') {
                depth--;
                if (depth === 0) break;
            } else if (c === ',' && depth === 1) hasSecondArg = true;
        }
        const tail = source.slice(j + 1, j + 30).trimStart();
        if (hasSecondArg || tail.startsWith('.catch(') || isAwaited(source, i)) continue;
        offenders.push(source.slice(0, i).split('\n').length);
    }
    return offenders;
}

beforeEach(() => {
    subscriptions.length = 0;
});

describe('notify() — the revenue-path fire-and-forget', () => {
    it('attaches a rejection handler to the insert', () => {
        notify({ userId: 'user-1', type: 'subscription_activated', title: 'Plan activated' });
        expect(subscriptions).toHaveLength(1);
        expect(
            typeof subscriptions[0].onRejected,
            'a lone .then(onFulfilled) leaves a transport failure unhandled, which exits Node',
        ).toBe('function');
    });

    it('swallows a transport rejection instead of rethrowing it', () => {
        notify({ userId: 'user-1', type: 'subscription_activated', title: 'Plan activated' });
        const onRejected = subscriptions[0].onRejected as (r: unknown) => unknown;
        expect(() => onRejected(new TypeError('fetch failed'))).not.toThrow();
    });

    it('returns synchronously — callers must never be blocked on it', () => {
        expect(notify({ userId: 'u', type: 'order_paid', title: 't' })).toBeUndefined();
    });
});

describe('server fire-and-forget chains carry a rejection handler', () => {
    it.each(SERVER_FILES)('%s', (file) => {
        const offenders = thenCallsWithoutRejectionHandler(src(file));
        expect(
            offenders,
            `${file}: .then() without a rejection handler at line(s) ${offenders.join(', ')} — ` +
            'an un-awaited Supabase chain that rejects will exit the process',
        ).toEqual([]);
    });

    it('does not call .catch() directly on a Supabase builder', () => {
        // `.catch()` on a real Promise (e.g. sendEmailDirect(...)) is fine — it
        // is only the Postgrest builder that lacks the method, so look for a
        // supabase chain terminating in .catch rather than any .catch at all.
        for (const file of SERVER_FILES) {
            expect(src(file), `${file}: PostgrestBuilder has no .catch()`)
                .not.toMatch(/supabaseServer[\s\S]{0,400}?\)\s*\.catch\(/);
        }
    });
});
