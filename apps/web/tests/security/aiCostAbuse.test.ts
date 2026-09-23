/**
 * Cost-abuse suite for the AI routes.
 *
 * Every route here spends real money per call on a shared OPENAI_API_KEY.
 * Exhausting that key's rate limit or spend cap takes AI menu extraction — the
 * product's headline feature — offline for every paying customer at once. So
 * "an authenticated user can spend without bound" is a availability bug against
 * the whole tenancy, not just a billing surprise.
 *
 * Threat model: the attacker is an authenticated free-trial owner. Signup is one
 * phone number, so anything gated only on "is logged in" is effectively ungated.
 *
 * Finding 3 (HIGH) — /api/bulk-import/insert had no rate limit at all, and its
 * 15/day quota had three separate holes:
 *   (a) it charged `photosCount`, a number from the request body, while the cost
 *       was driven by `items.length` (up to 300 → six parallel GPT-4o-mini calls);
 *   (b) it charged AFTER the OpenAI spend and only on the success path, so an
 *       aborted connection or a failed insert did the work for free;
 *   (c) it incremented with a read-modify-write upsert, so N concurrent requests
 *       all read the same value and the counter landed on one increment.
 *
 * Finding 7 (MEDIUM) — the extract routes buffered the entire multipart body
 * into memory before any size check.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('server-only', () => ({}));
// These cases cover the flag-OFF path (pre-ai-page-limits behaviour), pinned
// explicitly so they stay meaningful after AI_PAGE_LIMITS goes live. The ON
// path is covered by tests/acceptance/ai-page-limits.test.ts.
vi.mock('@/lib/platform/productFlags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/platform/productFlags')>()),
  AI_PAGE_LIMITS: false,
}));
vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
    verifyFirebaseToken: vi.fn(async (t: string) => (t === 'good' ? 'user-1' : null)),
}));

type RlOpts = { limit: number; windowMs: number };
const rateLimit = vi.fn((_key: string, _opts: RlOpts) => ({ allowed: true, remaining: 9, retryAfterMs: 0 }));
vi.mock('@/lib/platform/rateLimit', () => ({
    rateLimit: (key: string, opts: RlOpts) => rateLimit(key, opts),
    getClientIp: () => '1.2.3.4',
}));

// ── OpenAI spy — the thing we are trying to keep from being called ──────────
const chatCreate = vi.fn(async () => ({
    choices: [{ message: { content: JSON.stringify({ descriptions: [] }) } }],
}));
const embeddingsCreate = vi.fn(async () => ({ data: [{ embedding: [0.1] }] }));
vi.mock('openai', () => ({
    default: class {
        chat = { completions: { create: chatCreate } };
        embeddings = { create: embeddingsCreate };
        constructor(_o?: unknown) { }
    },
}));

// ── Supabase with a real, observable quota row ──────────────────────────────
const quota = { value: 0 as number | null, casFailuresToInject: 0 };
const dbCalls: Array<{ table: string; op: string; args?: unknown; filters: Array<[string, unknown]> }> = [];
/** Order in which OpenAI vs the quota write happened — proves reserve-before-spend. */
const timeline: string[] = [];

function tableMock(table: string) {
    const filters: Array<[string, unknown]> = [];
    let pending: { op: string; args?: unknown } | null = null;

    const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((c: string, v: unknown) => { filters.push([c, v]); return chain; }),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => {
            if (table === 'bulk_import_usage') {
                return { data: quota.value === null ? null : { photos_used: quota.value }, error: null };
            }
            if (table === 'sites') return { data: { id: 'site-1' }, error: null };
            return { data: null, error: null };
        }),
        single: vi.fn(async () => ({ data: null, error: null })),
        insert: vi.fn(async (a: unknown) => {
            dbCalls.push({ table, op: 'insert', args: a, filters: [...filters] });
            if (table === 'bulk_import_usage') {
                timeline.push('quota-write');
                if (quota.value !== null) return { data: null, error: { code: '23505' } };
                quota.value = (a as { photos_used: number }).photos_used;
            }
            return { data: null, error: null };
        }),
        update: vi.fn((a: unknown) => { pending = { op: 'update', args: a }; return chain; }),
        upsert: vi.fn(async (a: unknown) => {
            dbCalls.push({ table, op: 'upsert', args: a, filters: [...filters] });
            if (table === 'bulk_import_usage') timeline.push('quota-write');
            return { data: null, error: null };
        }),
        delete: vi.fn(() => { pending = { op: 'delete' }; return chain; }),
        then(resolve: (v: { data: unknown; error: null }) => void) {
            if (pending) {
                dbCalls.push({ table, op: pending.op, args: pending.args, filters: [...filters] });
                if (table === 'bulk_import_usage' && pending.op === 'update') {
                    timeline.push('quota-write');
                    // Emulate compare-and-swap: the update carries the value the
                    // caller read, and matches only if nothing moved since.
                    const expected = filters.find(([c]) => c === 'photos_used')?.[1];
                    if (quota.casFailuresToInject > 0) {
                        quota.casFailuresToInject--;
                        quota.value = (quota.value ?? 0) + 1;   // another writer won
                        pending = null;
                        return resolve({ data: [], error: null });
                    }
                    if (expected !== undefined && expected !== quota.value) {
                        pending = null;
                        return resolve({ data: [], error: null });
                    }
                    quota.value = (pending.args as { photos_used: number }).photos_used;
                }
                pending = null;
            }
            resolve({ data: [{ ok: 1 }], error: null });
        },
    };
    return chain;
}

vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: { from: vi.fn((t: string) => tableMock(t)), rpc: vi.fn(async () => ({ data: [], error: null })) },
}));

import { POST as bulkInsert } from '@/app/api/bulk-import/insert/route';

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8');

function items(n: number, withDescription = false) {
    return Array.from({ length: n }, (_, i) => ({
        name: `Dish ${i}`, price: 100,
        description: withDescription ? 'a description' : '',
        item_type: 'single', food_type: 'veg',
    }));
}

function insertReq(body: unknown) {
    return new NextRequest('https://vsite.in/api/bulk-import/insert', {
        method: 'POST',
        headers: new Headers({ Authorization: 'Bearer good' }),
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    dbCalls.length = 0;
    timeline.length = 0;
    quota.value = 0;
    quota.casFailuresToInject = 0;
    chatCreate.mockClear();
    embeddingsCreate.mockClear();
    chatCreate.mockImplementation(async () => {
        timeline.push('openai');
        return { choices: [{ message: { content: JSON.stringify({ descriptions: [] }) } }] };
    });
    embeddingsCreate.mockImplementation(async () => {
        timeline.push('openai');
        return { data: [{ embedding: [0.1] }] };
    });
    rateLimit.mockReturnValue({ allowed: true, remaining: 9, retryAfterMs: 0 });
});

describe('Finding 3: bulk-import/insert has a rate limit', () => {
    it('calls rateLimit keyed on the authenticated uid', async () => {
        await bulkInsert(insertReq({ siteId: 'site-1', photosCount: 1, items: items(2, true) }));
        expect(rateLimit).toHaveBeenCalled();
        expect(String(rateLimit.mock.calls[0][0])).toContain('user-1');
    });

    it('returns 429 and spends nothing when the limiter denies', async () => {
        rateLimit.mockReturnValue({ allowed: false, remaining: 0, retryAfterMs: 60_000 });
        const res = await bulkInsert(insertReq({ siteId: 'site-1', photosCount: 1, items: items(300) }));
        expect(res.status).toBe(429);
        expect(chatCreate).not.toHaveBeenCalled();
        expect(embeddingsCreate).not.toHaveBeenCalled();
    });
});

describe('Finding 3(a): the quota meters the work, not a client-supplied number', () => {
    it('charges more for 300 description-less items than for 2', async () => {
        quota.value = 0;
        await bulkInsert(insertReq({ siteId: 'site-1', photosCount: 1, items: items(2) }));
        const small = quota.value!;

        quota.value = 0;
        await bulkInsert(insertReq({ siteId: 'site-1', photosCount: 1, items: items(300) }));
        const large = quota.value!;

        // Same photosCount, 150x the AI work. If these are equal, the meter is
        // reading the request body instead of the workload.
        expect(large).toBeGreaterThan(small);
    });

    it('refuses the request when the work would exceed the daily allowance', async () => {
        quota.value = 15;
        const res = await bulkInsert(insertReq({ siteId: 'site-1', photosCount: 1, items: items(300) }));
        expect(res.status).toBe(429);
        expect((await res.json()).code).toBe('QUOTA_EXCEEDED');
        expect(chatCreate).not.toHaveBeenCalled();
    });
});

describe('Finding 3(b): the quota is charged BEFORE the spend', () => {
    it('writes the reservation before the first OpenAI call', async () => {
        await bulkInsert(insertReq({ siteId: 'site-1', photosCount: 1, items: items(60) }));
        const firstWrite = timeline.indexOf('quota-write');
        const firstSpend = timeline.indexOf('openai');
        expect(firstWrite, 'quota must be written').toBeGreaterThanOrEqual(0);
        expect(firstSpend, 'OpenAI must be called').toBeGreaterThanOrEqual(0);
        expect(firstWrite).toBeLessThan(firstSpend);
    });
});

describe('Finding 3(c): the increment is a compare-and-swap, not a blind write', () => {
    it('constrains the update on the value it read', async () => {
        quota.value = 3;
        await bulkInsert(insertReq({ siteId: 'site-1', photosCount: 1, items: items(10) }));
        const update = dbCalls.find(c => c.table === 'bulk_import_usage' && c.op === 'update');
        expect(update, 'quota must be updated via UPDATE, not a blind upsert').toBeDefined();
        // Without this predicate two concurrent requests both write `read + n`
        // and one increment is silently lost.
        expect(update!.filters).toContainEqual(['photos_used', 3]);
    });

    it('retries and still charges when a concurrent writer wins the race', async () => {
        quota.value = 0;
        quota.casFailuresToInject = 1;   // first CAS loses
        const res = await bulkInsert(insertReq({ siteId: 'site-1', photosCount: 1, items: items(10) }));
        expect(res.status).toBe(200);
        // The other writer's +1 is intact AND our reservation landed on top.
        expect(quota.value!).toBeGreaterThan(1);
    });

    it('never uses a bare upsert for the counter', () => {
        const s = src('app/api/bulk-import/insert/route.ts');
        expect(s).not.toMatch(/photos_used:\s*photosUsed\s*\+\s*photosCount/);
    });
});

// =============================================================================
// Finding 7 — body size
// =============================================================================
describe('Finding 7: upload routes bound the body before buffering it', () => {
    const uploadRoutes = [
        'app/api/onboarding/extract/route.ts',
        'app/api/bulk-import/extract/route.ts',
    ];

    it.each(uploadRoutes)('%s checks content-length before request.formData()', (f) => {
        const s = src(f);
        const lenCheck = s.search(/content-length/i);
        const formData = s.search(/await\s+request\.formData\(\)/);
        expect(lenCheck, `${f} must read content-length`).toBeGreaterThanOrEqual(0);
        expect(formData).toBeGreaterThanOrEqual(0);
        expect(lenCheck, 'the size check must precede the buffering call').toBeLessThan(formData);
    });

    it.each(uploadRoutes)('%s no longer claims Vercel caps the body', (f) => {
        // The routes are on DigitalOcean; the ~4.5MB platform cap they relied on
        // does not exist there. A stale comment is how the assumption survives.
        expect(src(f)).not.toMatch(/Vercel platform caps request body/);
    });
});
