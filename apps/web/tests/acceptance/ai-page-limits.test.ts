/**
 * AI menu page limits per store — acceptance (docs/GOAL.md, AC1–AC11).
 * Contract: docs/features/ai-page-limits/contract.md (signed 2026-09-23).
 *
 * Every test here runs with AI_PAGE_LIMITS mocked ON explicitly, so the suite
 * stays valid after the go-live flip. The flag-OFF behaviour (AC10) lives in
 * ai-page-limits-flag-off.test.ts.
 *
 * The database is an in-memory fake whose RPCs apply exactly the semantics of
 * migration 057 (a single conditional UPDATE per reserve), so the code under
 * test is ours: the ledger wrapper, the period resolver and the routes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

process.env.OPENAI_API_KEY = 'sk-test';
process.env.EXTRACT_ADMISSION_WAIT_MS = '50';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/platform/productFlags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/platform/productFlags')>()),
  AI_PAGE_LIMITS: true,
}));

// ── Fake OpenAI ──────────────────────────────────────────────────────────────

interface FakeCall { model: string; images: string[]; text: string }
const calls: FakeCall[] = [];

function decodeMarker(url: string): string {
  const b64 = url.split('base64,')[1] ?? '';
  return Buffer.from(b64, 'base64').toString('latin1').replace(/[^\x20-\x7e]/g, '');
}

function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status, headers: {} });
}

/** Each image yields two items named after its marker; a marker containing "bad" is refused (non-retryable). */
function reply(call: FakeCall): { content: string } | Error {
  if (call.text.startsWith('Write descriptions')) {
    const n = Number(/these (\d+) items/.exec(call.text)?.[1] ?? 0);
    return { content: JSON.stringify({ descriptions: Array.from({ length: n }, (_, i) => `desc ${i}`) }) };
  }
  if (call.images.some(m => m.includes('bad'))) return httpError(400);
  const tuples = call.images.flatMap(m => [
    [`${m} dish A`, 100, 'Mains', 's', 'v', []],
    [`${m} dish B`, 120, 'Mains', 's', 'n', []],
  ]);
  return { content: JSON.stringify({ items: tuples }) };
}

vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: async (params: { model: string; messages: Array<{ role: string; content: unknown }> }) => {
          const user = params.messages.find(m => m.role === 'user');
          const parts = Array.isArray(user?.content) ? user?.content as Array<Record<string, unknown>> : [];
          const call: FakeCall = {
            model: params.model,
            images: parts.filter(p => p.type === 'image_url').map(p => decodeMarker((p.image_url as { url: string }).url)),
            text: typeof user?.content === 'string' ? user.content
              : parts.filter(p => p.type === 'text').map(p => String(p.text)).join(' '),
          };
          calls.push(call);
          const r = reply(call);
          if (r instanceof Error) throw r;
          return {
            choices: [{ message: { content: r.content }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
          };
        },
      },
    };
  },
}));

vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
  verifyFirebaseToken: vi.fn(async (t: string) => (t === 'bad' ? null : `uid-${t}`)),
}));

// ── Fake database (tables + the three RPCs of migration 057) ─────────────────

interface SiteRow { id: string; user_id: string; created_at: string; site_subscriptions: { store_expires_at: string | null } | null }
interface UsageRow {
  id: string; kind: string; user_id: string; site_id: string | null; period_key: string;
  period_ends_at: string | null; pages_used: number; pages_refunded: number; page_limit: number;
}

const db = { sites: [] as SiteRow[], usage: [] as UsageRow[], down: false, sitesDown: false, throws: false, empty: false };
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const tableReads: string[] = [];
let seq = 0;

function reserve(a: Record<string, unknown>) {
  const pages = Number(a.p_pages), limit = Number(a.p_limit);
  let row: UsageRow | undefined;
  if (a.p_kind === 'onboarding') {
    row = db.usage.find(u => u.kind === 'onboarding' && u.user_id === a.p_user_id && u.site_id === null);
    if (!row) {
      row = { id: `b${seq++}`, kind: 'onboarding', user_id: String(a.p_user_id), site_id: null, period_key: '', period_ends_at: null, pages_used: 0, pages_refunded: 0, page_limit: limit };
      db.usage.push(row);
    }
  } else {
    if (!db.sites.some(s => s.id === a.p_site_id && s.user_id === a.p_user_id)) {
      return [{ ok: false, reason: 'not_owner', bucket_id: null, pages_used: 0, page_limit: 0 }];
    }
    row = db.usage.find(u => u.site_id === a.p_site_id && u.kind === a.p_kind && u.period_key === a.p_period_key);
    if (!row) {
      row = { id: `b${seq++}`, kind: String(a.p_kind), user_id: String(a.p_user_id), site_id: String(a.p_site_id), period_key: String(a.p_period_key), period_ends_at: (a.p_period_ends_at as string) ?? null, pages_used: 0, pages_refunded: 0, page_limit: limit };
      db.usage.push(row);
    }
  }
  if (row.pages_used + pages <= limit) {
    row.pages_used += pages;
    return [{ ok: true, reason: 'ok', bucket_id: row.id, pages_used: row.pages_used, page_limit: limit }];
  }
  return [{ ok: false, reason: 'limit', bucket_id: row.id, pages_used: row.pages_used, page_limit: limit }];
}

function rpc(fn: string, args: Record<string, unknown>) {
  rpcCalls.push({ fn, args });
  if (db.throws) throw new Error('fetch failed');
  if (db.empty) return Promise.resolve(undefined);
  if (db.down) return Promise.resolve({ data: null, error: { message: 'down' } });
  if (fn === 'reserve_ai_pages') return Promise.resolve({ data: reserve(args), error: null });
  if (fn === 'refund_ai_pages') {
    const row = db.usage.find(u => u.id === args.p_bucket_id);
    const n = Number(args.p_pages);
    if (row && n > 0) { const back = Math.min(n, row.pages_used); row.pages_used -= back; row.pages_refunded += back; }
    return Promise.resolve({ data: row?.pages_used ?? null, error: null });
  }
  if (fn === 'bind_onboarding_pages') {
    const owns = db.sites.some(s => s.id === args.p_site_id && s.user_id === args.p_user_id);
    const row = db.usage.find(u => u.kind === 'onboarding' && u.user_id === args.p_user_id && u.site_id === null);
    if (owns && row) row.site_id = String(args.p_site_id);
    return Promise.resolve({ data: null, error: null });
  }
  return Promise.resolve({ data: null, error: null });
}

/** Chainable, awaitable query builder over the fake tables. */
function from(table: string) {
  tableReads.push(table);
  const filters: Array<[string, unknown]> = [];
  const rows = (): Array<Record<string, unknown>> => {
    const src = table === 'sites' ? db.sites : table === 'ai_page_usage' ? db.usage : [];
    return (src as unknown as Array<Record<string, unknown>>).filter(r => filters.every(([k, v]) => r[k] === v));
  };
  const failed = () => (table === 'sites' ? db.sitesDown : table === 'ai_page_usage' ? db.down : false);
  const b = {
    select: () => b,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return b; },
    is: (k: string, v: unknown) => { filters.push([k, v]); return b; },
    order: () => b,
    limit: () => b,
    maybeSingle: async () => (failed() ? { data: null, error: { message: 'down' } } : { data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(failed() ? { data: null, error: { message: 'down' } } : { data: rows(), error: null }).then(res, rej),
  };
  return b;
}

vi.mock('@/lib/platform/db/supabase-server', () => ({
  supabaseServer: { from: (t: string) => from(t), rpc: (fn: string, a: Record<string, unknown>) => rpc(fn, a) },
}));

// ── Imports under test (after mocks) ─────────────────────────────────────────

import { __resetUploadAdmission } from '@/lib/platform/uploadAdmission';
import { __resetRateScheduler } from '@/lib/menu/openaiScheduler';
import { __resetAiSpend } from '@/lib/menu/aiSpendGuard';
import {
  ONBOARDING_PAGE_LIMIT, TRIAL_BULK_PAGE_LIMIT, PAID_BULK_PAGE_LIMIT,
  resolveBulkAllowance, planBulkPdf, bulkAllowanceView,
} from '@/lib/menu/aiPageLimits';
import { reserveBulkPages, bindOnboardingPages } from '@/lib/menu/aiPageLedger';
import { POST as onboardingExtract } from '@/app/api/onboarding/extract/route';
import { POST as bulkExtract } from '@/app/api/bulk-import/extract/route';
import { POST as bulkInsert } from '@/app/api/bulk-import/insert/route';
import { GET as allowanceGet } from '@/app/api/bulk-import/allowance/route';

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const SRC = join(__dirname, '..', '..', 'src');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

function photo(marker: string): File {
  const bytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(marker)]);
  return new File([new Uint8Array(bytes)], `${marker}.jpg`, { type: 'image/jpeg' });
}

let tokenSeq = 0;
const freshToken = () => `t${Date.now()}-${tokenSeq++}`;
const uidOf = (token: string) => `uid-${token}`;

function onboardingReq(token: string, markers: string[], headers: Record<string, string> = {}): NextRequest {
  const fd = new FormData();
  fd.append('shopName', 'Placeholder Cafe');
  for (const m of markers) fd.append('photos', photo(m));
  return new NextRequest('http://localhost/api/onboarding/extract', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, ...headers }, body: fd,
  });
}

function bulkReq(token: string, siteId: string | null, markers: string[], headers: Record<string, string> = {}): NextRequest {
  const fd = new FormData();
  for (const m of markers) fd.append('photos', photo(m));
  return new NextRequest('http://localhost/api/bulk-import/extract', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(siteId ? { 'X-Site-Id': siteId } : {}), ...headers },
    body: fd,
  });
}

function allowanceReq(token: string, siteId: string): NextRequest {
  return new NextRequest(`http://localhost/api/bulk-import/allowance?siteId=${siteId}`, {
    method: 'GET', headers: { Authorization: `Bearer ${token}` },
  });
}

/** A store for `token`'s user. `paidUntil` is store_expires_at relative to now. */
function addSite(token: string, opts: { ageDays: number; paidUntilMs?: number }): string {
  const id = `site-${seq++}`;
  db.sites.push({
    id, user_id: uidOf(token),
    created_at: new Date(Date.now() - opts.ageDays * DAY).toISOString(),
    site_subscriptions: opts.paidUntilMs === undefined ? null : { store_expires_at: new Date(Date.now() + opts.paidUntilMs).toISOString() },
  });
  return id;
}

const bucketOf = (siteId: string) => db.usage.find(u => u.site_id === siteId && u.kind !== 'onboarding');
const openOnboarding = (token: string) => db.usage.find(u => u.kind === 'onboarding' && u.user_id === uidOf(token) && u.site_id === null);
const markers = (n: number, p = 'p') => Array.from({ length: n }, (_, i) => `${p}${i}`);

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  tableReads.length = 0;
  db.sites = []; db.usage = []; db.down = false; db.sitesDown = false; db.throws = false; db.empty = false;
  delete process.env.EXTRACTION_USER_DAILY_BUDGET_USD;
  __resetUploadAdmission();
  __resetRateScheduler();
  __resetAiSpend();
});

// =============================================================================
describe('AC1: onboarding allows at most 15 pages per store', () => {
  it('AC1: the limit is 15', () => {
    expect(ONBOARDING_PAGE_LIMIT).toBe(15);
  });

  it('AC1: a fresh owner scans 15 pages and is told 0 are left', async () => {
    const t = freshToken();
    const res = await onboardingExtract(onboardingReq(t, markers(15)));
    expect(res.status).toBe(200);
    expect((await res.json()).pages).toEqual({ used: 15, limit: 15, left: 0 });
  });

  it('AC1: a scan that would pass 15 is refused with PAGE_LIMIT and pages left, before any AI call', async () => {
    const t = freshToken();
    expect((await onboardingExtract(onboardingReq(t, markers(13)))).status).toBe(200);
    calls.length = 0;
    const res = await onboardingExtract(onboardingReq(t, markers(3, 'q')));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('PAGE_LIMIT');
    expect(body.pagesLeft).toBe(2);
    expect(calls).toHaveLength(0);
  });

  it('AC1: an X-Photo-Count above what is left is refused before the body is read', async () => {
    const t = freshToken();
    expect((await onboardingExtract(onboardingReq(t, markers(13)))).status).toBe(200);
    calls.length = 0;
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) { pulled += 1; c.enqueue(new Uint8Array(1024)); if (pulled > 100) c.close(); },
    });
    const req = new NextRequest('http://localhost/api/onboarding/extract', {
      method: 'POST', body, duplex: 'half',
      headers: { Authorization: `Bearer ${t}`, 'X-Photo-Count': '5', 'content-type': 'multipart/form-data; boundary=zz' },
    } as ConstructorParameters<typeof NextRequest>[1]);
    const res = await onboardingExtract(req);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PAGE_LIMIT');
    expect(pulled).toBeLessThanOrEqual(2);
    expect(calls).toHaveLength(0);
  });

  it('AC1: an owner who never completes onboarding cannot re-scan past 15', async () => {
    const t = freshToken();
    expect((await onboardingExtract(onboardingReq(t, markers(8)))).status).toBe(200);
    expect((await onboardingExtract(onboardingReq(t, markers(7, 'r')))).status).toBe(200);
    const res = await onboardingExtract(onboardingReq(t, ['s0']));
    expect(res.status).toBe(403);
    expect((await res.json()).pagesLeft).toBe(0);
    expect(db.usage.filter(u => u.kind === 'onboarding')).toHaveLength(1);
  });

  it('AC1: once the pages are bound to the new store, the next store gets a fresh 15', async () => {
    const t = freshToken();
    expect((await onboardingExtract(onboardingReq(t, markers(15)))).status).toBe(200);
    const siteId = addSite(t, { ageDays: 0 });
    await bindOnboardingPages(uidOf(t), siteId);
    expect(openOnboarding(t)).toBeUndefined();
    const res = await onboardingExtract(onboardingReq(t, markers(4, 'n')));
    expect(res.status).toBe(200);
    expect((await res.json()).pages).toEqual({ used: 4, limit: 15, left: 11 });
  });

  it('AC1: a ledger outage fails closed with PAGE_LIMIT_UNAVAILABLE and no AI spend', async () => {
    db.down = true;
    const res = await onboardingExtract(onboardingReq(freshToken(), markers(2)));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('PAGE_LIMIT_UNAVAILABLE');
    expect(calls).toHaveLength(0);
  });

  it('AC1: a database client that throws still fails closed, with no AI spend', async () => {
    const t = freshToken();
    expect((await onboardingExtract(onboardingReq(t, markers(1)))).status).toBe(200);
    db.throws = true;
    calls.length = 0;
    const res = await onboardingExtract(onboardingReq(t, markers(1, 'k')));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('PAGE_LIMIT_UNAVAILABLE');
    expect(calls).toHaveLength(0);
  });

  it('AC1: binding and refunding are best effort: a throwing client never breaks the request', async () => {
    const t = freshToken();
    const siteId = addSite(t, { ageDays: 0 });
    db.throws = true;
    await expect(bindOnboardingPages(uidOf(t), siteId)).resolves.toBeUndefined();
    const { refundPages } = await import('@/lib/menu/aiPageLedger');
    await expect(refundPages('b-missing', 2)).resolves.toBeUndefined();
    db.throws = false;
    db.empty = true;
    await expect(bindOnboardingPages(uidOf(t), siteId)).resolves.toBeUndefined();
    await expect(refundPages('b-missing', 2)).resolves.toBeUndefined();
  });

  it('AC1: /complete binds the onboarding pages to the store it creates, behind the flag', () => {
    const src = read('app', 'api', 'onboarding', 'complete', 'route.ts');
    expect(src).toMatch(/if \(AI_PAGE_LIMITS\)[\s\S]{0,400}bindOnboardingPages\(userId, site\.id\)/);
  });

  it('AC1: Back then Continue with the same photos does not scan (or charge) again', async () => {
    const { needsRescan } = await import('@/app/onboarding/rescan');
    expect(needsRescan({ photoKey: 'a|b', lastScannedKey: 'a|b', itemCount: 12 })).toBe(false);
    expect(needsRescan({ photoKey: 'a|b|c', lastScannedKey: 'a|b', itemCount: 12 })).toBe(true);
    expect(needsRescan({ photoKey: 'a|b', lastScannedKey: 'a|b', itemCount: 0 })).toBe(true);
    expect(needsRescan({ photoKey: 'a|b', lastScannedKey: null, itemCount: 0 })).toBe(true);
    const src = read('app', 'onboarding', 'page.tsx');
    expect(src).toMatch(/AI_PAGE_LIMITS && !needsRescan\(/);
  });

  it('AC1: out of pages with dishes already read, the owner keeps them instead of losing them', () => {
    const src = read('app', 'onboarding', 'page.tsx');
    expect(src).toMatch(/Continue with my \{items\.length\} dishes/);
    // Skip (which empties the menu) is not offered when read dishes can be kept.
    expect(src).toMatch(/canKeepItems \? \(/);
  });

  it('AC1: the onboarding screen explains PAGE_LIMIT with the pages left', () => {
    expect(read('app', 'onboarding', 'scanMessages.ts')).toMatch(/PAGE_LIMIT:\s*\{/);
    expect(read('app', 'onboarding', 'page.tsx')).toMatch(/pagesLeft/);
  });
});

// =============================================================================
describe('AC2: a trial store gets 2 bulk pages for the whole trial', () => {
  it('AC2: a trial store resolves to 2 pages under one never-resetting key', () => {
    const now = Date.now();
    const created = new Date(now - 2 * DAY).toISOString();
    const a = resolveBulkAllowance({ siteCreatedAt: created, storeExpiresAt: null, now });
    expect(a).toMatchObject({ state: 'trial', kind: 'bulk_trial', limit: TRIAL_BULK_PAGE_LIMIT, periodKey: 'trial', resetsAt: null });
    expect(TRIAL_BULK_PAGE_LIMIT).toBe(2);
    const later = resolveBulkAllowance({ siteCreatedAt: created, storeExpiresAt: null, now: now + 4 * DAY });
    expect(later.periodKey).toBe(a.periodKey);
  });

  it('AC2: the third trial page is refused', async () => {
    const t = freshToken();
    const siteId = addSite(t, { ageDays: 2 });
    const ok = await bulkExtract(bulkReq(t, siteId, markers(2)));
    expect(ok.status).toBe(200);
    expect((await ok.json()).pages).toMatchObject({ state: 'trial', used: 2, limit: 2, left: 0 });
    calls.length = 0;
    const res = await bulkExtract(bulkReq(t, siteId, ['x0']));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'PAGE_LIMIT', state: 'trial', pagesLeft: 0 });
    expect(calls).toHaveLength(0);
  });
});

// =============================================================================
describe('AC3: an expired unpaid store gets 0 bulk pages', () => {
  it('AC3: a store 8 days old with no payment resolves to expired, limit 0', () => {
    const now = Date.now();
    const a = resolveBulkAllowance({ siteCreatedAt: new Date(now - 8 * DAY).toISOString(), storeExpiresAt: null, now });
    expect(a).toMatchObject({ state: 'expired', limit: 0 });
  });

  it('AC3: a lapsed paid store is expired too', () => {
    const now = Date.now();
    const a = resolveBulkAllowance({ siteCreatedAt: new Date(now - 60 * DAY).toISOString(), storeExpiresAt: new Date(now - 1000).toISOString(), now });
    expect(a.state).toBe('expired');
  });

  it('AC3: the route refuses before the body is read, with no AI', async () => {
    const t = freshToken();
    const siteId = addSite(t, { ageDays: 8 });
    const res = await bulkExtract(bulkReq(t, siteId, ['e0']));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'PAGE_LIMIT', state: 'expired', pagesLeft: 0 });
    expect(calls).toHaveLength(0);
    expect(rpcCalls.filter(c => c.fn === 'reserve_ai_pages')).toHaveLength(0);
  });

  it('AC3: the modal offers "Pay ₹299" to /manage/subscription and keeps adding by hand', () => {
    const v = bulkAllowanceView({ state: 'expired', limit: 0, left: 0, resetsAt: null });
    expect(v.canUpload).toBe(false);
    expect(v.exhausted?.title).toBe('Your trial has ended');
    expect(v.exhausted?.cta).toEqual({ label: 'Pay ₹299', href: '/manage/subscription' });
    expect(v.handAddLabel).toBe('Add items by hand instead');
    const used = bulkAllowanceView({ state: 'trial', limit: 2, left: 0, resetsAt: null });
    expect(used.exhausted?.cta?.href).toBe('/manage/subscription');
  });
});

// =============================================================================
describe('AC4: a paid store gets 5 bulk pages per billing month', () => {
  it('AC4: the monthly allowance is 5 and resets on the payment date', () => {
    const now = Date.now();
    const E = new Date(now + 10 * DAY).toISOString();
    const a = resolveBulkAllowance({ siteCreatedAt: new Date(now - 40 * DAY).toISOString(), storeExpiresAt: E, now });
    expect(a).toMatchObject({ state: 'paid', kind: 'bulk_paid', limit: PAID_BULK_PAGE_LIMIT, resetsAt: E });
    expect(PAID_BULK_PAGE_LIMIT).toBe(5);
  });

  it('AC4: an early renewal keeps the same month, so it cannot reset pages', () => {
    const now = Date.now();
    const created = new Date(now - 40 * DAY).toISOString();
    const before = resolveBulkAllowance({ siteCreatedAt: created, storeExpiresAt: new Date(now + 10 * DAY).toISOString(), now });
    const after = resolveBulkAllowance({ siteCreatedAt: created, storeExpiresAt: new Date(now + 40 * DAY).toISOString(), now });
    expect(after.periodKey).toBe(before.periodKey);
    expect(after.resetsAt).toBe(before.resetsAt);
  });

  it('AC4: a store paid during its trial uses the paid rules', () => {
    const now = Date.now();
    const a = resolveBulkAllowance({ siteCreatedAt: new Date(now - 2 * DAY).toISOString(), storeExpiresAt: new Date(now + 25 * DAY).toISOString(), now });
    expect(a.state).toBe('paid');
    expect(a.limit).toBe(5);
  });

  it('AC4: the sixth page in a month is refused and the reset date is returned', async () => {
    const t = freshToken();
    const siteId = addSite(t, { ageDays: 40, paidUntilMs: 12 * DAY });
    const ok = await bulkExtract(bulkReq(t, siteId, markers(5)));
    expect(ok.status).toBe(200);
    const res = await bulkExtract(bulkReq(t, siteId, ['y0']));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'PAGE_LIMIT', state: 'paid', pagesLeft: 0, pageLimit: 5 });
    expect(typeof body.resetsAt).toBe('string');
  });

  it('AC4: the allowance route reports pages left and the reset date', async () => {
    const t = freshToken();
    const siteId = addSite(t, { ageDays: 40, paidUntilMs: 12 * DAY });
    await bulkExtract(bulkReq(t, siteId, markers(2)));
    const res = await allowanceGet(allowanceReq(t, siteId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, enforced: true, state: 'paid', limit: 5, used: 2, left: 3 });
    expect(typeof body.resetsAt).toBe('string');
  });

  it('AC4: the modal shows "N of M left" and the reset date', () => {
    const v = bulkAllowanceView({ state: 'paid', limit: 5, left: 3, resetsAt: '2026-10-12T06:00:00.000Z' });
    expect(v.chip).toBe('3 of 5 left');
    expect(v.sub).toBe('Resets on 12 Oct');
    const used = bulkAllowanceView({ state: 'paid', limit: 5, left: 0, resetsAt: '2026-10-12T06:00:00.000Z' });
    expect(used.exhausted?.title).toBe('Monthly pages used');
    expect(used.exhausted?.body).toContain('12 Oct');
  });
});

// =============================================================================
describe('AC5: pages are reserved atomically before any AI call', () => {
  it('AC5: 20 concurrent one-page reservations on a paid store: exactly 5 succeed', async () => {
    const t = freshToken();
    const siteId = addSite(t, { ageDays: 40, paidUntilMs: 12 * DAY });
    const allowance = resolveBulkAllowance({ siteCreatedAt: db.sites[0].created_at, storeExpiresAt: db.sites[0].site_subscriptions!.store_expires_at, now: Date.now() });
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveBulkPages(uidOf(t), siteId, allowance, 1)));
    expect(results.filter(r => r.ok)).toHaveLength(5);
    expect(results.filter(r => !r.ok && r.reason === 'limit')).toHaveLength(15);
    expect(bucketOf(siteId)?.pages_used).toBe(5);
  });

  it('AC5: the reservation happens before the first OpenAI call', async () => {
    const t = freshToken();
    const siteId = addSite(t, { ageDays: 40, paidUntilMs: 12 * DAY });
    let reservedAtFirstCall: number | null = null;
    const origPush = calls.push.bind(calls);
    calls.push = (...c: FakeCall[]) => {
      if (reservedAtFirstCall === null) reservedAtFirstCall = bucketOf(siteId)?.pages_used ?? 0;
      return origPush(...c);
    };
    await bulkExtract(bulkReq(t, siteId, markers(2)));
    calls.push = origPush;
    expect(reservedAtFirstCall).toBe(2);
  });

  it('AC5: migration 057 changes the counter only through the conditional UPDATE', () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '057_ai_page_usage.sql'), 'utf8');
    expect(sql).toMatch(/pages_used \+ p_pages <= p_limit/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.reserve_ai_pages[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toMatch(/\b(DROP|RENAME)\b(?![^\n]*--)/);
    expect(sql).not.toMatch(/ALTER TABLE (?!public\.ai_page_usage)/);
  });

  it('AC5: no route reads pages_used and writes it back', () => {
    for (const f of [['app', 'api', 'onboarding', 'extract', 'route.ts'], ['app', 'api', 'bulk-import', 'extract', 'route.ts'], ['lib', 'menu', 'aiPageLedger.ts']]) {
      expect(read(...f)).not.toMatch(/\.update\(\s*\{[^}]*pages_used/);
    }
  });
});

// =============================================================================
describe('AC6: pages the AI fails to read are refunded', () => {
  it('AC6: one unreadable page out of three is given back', async () => {
    const t = freshToken();
    const siteId = addSite(t, { ageDays: 40, paidUntilMs: 12 * DAY });
    const res = await bulkExtract(bulkReq(t, siteId, ['g0', 'bad1', 'g2']));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pages).toMatchObject({ used: 2, left: 3 });
    expect(body.failedPhotos).toEqual([2]);
    expect(bucketOf(siteId)).toMatchObject({ pages_used: 2, pages_refunded: 1 });
    expect(rpcCalls.filter(c => c.fn === 'refund_ai_pages')).toHaveLength(1);
  });

  it('AC6: a scan where every page fails is refunded in full', async () => {
    const t = freshToken();
    const res = await onboardingExtract(onboardingReq(t, ['bad0', 'bad1']));
    expect(res.status).toBe(422);
    expect(openOnboarding(t)).toMatchObject({ pages_used: 0, pages_refunded: 2 });
  });

  it('AC6: a fully read scan makes no refund call', async () => {
    const t = freshToken();
    await onboardingExtract(onboardingReq(t, markers(3)));
    expect(rpcCalls.filter(c => c.fn === 'refund_ai_pages')).toHaveLength(0);
  });
});

// =============================================================================
describe('AC7: the counter survives a restart', () => {
  it('AC7: a fresh module instance still refuses the over-limit scan', async () => {
    const t = freshToken();
    expect((await onboardingExtract(onboardingReq(t, markers(15)))).status).toBe(200);
    vi.resetModules();
    const fresh = await import('@/app/api/onboarding/extract/route');
    const res = await fresh.POST(onboardingReq(t, ['z0']));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PAGE_LIMIT');
  });

  it('AC7: the ledger keeps no counters in process memory', () => {
    const src = read('lib', 'menu', 'aiPageLedger.ts');
    expect(src).toMatch(/supabaseServer\.rpc\(/);
    expect(src).not.toMatch(/new Map\(|^let /m);
  });
});

// =============================================================================
describe('AC8: bulk upload accepts PDF, one page per PDF page', () => {
  it('AC8: a PDF longer than what is left is refused with a clear message', () => {
    const r = planBulkPdf(4, 1);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.message).toBe('This PDF has 4 pages. You have 1 page left. Upload a photo of just the page you need.');
    expect(planBulkPdf(2, 2).ok).toBe(true);
  });

  it('AC8: the modal accepts PDFs and turns them into pages in the browser', () => {
    const src = read('components', 'manage', 'BulkImportModal.tsx');
    expect(src).toMatch(/image\/\*,application\/pdf/);
    expect(src).toMatch(/pdfToPageImages\(/);
    expect(src).toMatch(/planBulkPdf\(/);
  });

  it('AC8: the server is the backstop: 5 pages with 2 left are refused', async () => {
    const t = freshToken();
    const siteId = addSite(t, { ageDays: 40, paidUntilMs: 12 * DAY });
    expect((await bulkExtract(bulkReq(t, siteId, markers(3)))).status).toBe(200);
    calls.length = 0;
    const res = await bulkExtract(bulkReq(t, siteId, markers(5, 'w')));
    expect(res.status).toBe(403);
    expect((await res.json()).pagesLeft).toBe(2);
    expect(calls).toHaveLength(0);
  });
});

// =============================================================================
describe('AC9: bulk extract enforces the per-user AI spend cap', () => {
  it('AC9: an account over its own daily cap is refused with no reservation and no AI', async () => {
    process.env.EXTRACTION_USER_DAILY_BUDGET_USD = '0';
    const t = freshToken();
    const siteId = addSite(t, { ageDays: 40, paidUntilMs: 12 * DAY });
    const res = await bulkExtract(bulkReq(t, siteId, ['c0']));
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('DAILY_SCAN_LIMIT');
    expect(calls).toHaveLength(0);
    expect(rpcCalls).toHaveLength(0);
  });

  it('AC9: bulk spend is charged to the account, so the cap bites on the next scan', async () => {
    process.env.EXTRACTION_USER_DAILY_BUDGET_USD = '0.001';
    const t = freshToken();
    const siteId = addSite(t, { ageDays: 40, paidUntilMs: 12 * DAY });
    expect((await bulkExtract(bulkReq(t, siteId, ['c1']))).status).toBe(200);
    const res = await bulkExtract(bulkReq(t, siteId, ['c2']));
    expect(res.status).toBe(429);
  });

  it('AC9: bulk insert is capped per account too', async () => {
    process.env.EXTRACTION_USER_DAILY_BUDGET_USD = '0';
    const t = freshToken();
    const siteId = addSite(t, { ageDays: 40, paidUntilMs: 12 * DAY });
    const req = new NextRequest('http://localhost/api/bulk-import/insert', {
      method: 'POST', headers: { Authorization: `Bearer ${t}`, 'content-type': 'application/json' },
      body: JSON.stringify({ siteId, photosCount: 1, items: [{ name: 'Placeholder Dosa', price: 50 }] }),
    });
    const res = await bulkInsert(req);
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('DAILY_SCAN_LIMIT');
    expect(tableReads).not.toContain('bulk_import_usage');
  });
});

// =============================================================================
describe("AC11: an owner cannot draw on another owner's store", () => {
  it("AC11: bulk extract with someone else's store is 404, with no reservation and no AI", async () => {
    const owner = freshToken();
    const siteId = addSite(owner, { ageDays: 40, paidUntilMs: 12 * DAY });
    const res = await bulkExtract(bulkReq(freshToken(), siteId, ['o0']));
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
    expect(rpcCalls.filter(c => c.fn === 'reserve_ai_pages')).toHaveLength(0);
  });

  it('AC11: bulk extract without a store id is refused when limits are on', async () => {
    const res = await bulkExtract(bulkReq(freshToken(), null, ['o1']));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('SITE_REQUIRED');
  });

  it("AC11: the allowance route will not describe someone else's store", async () => {
    const siteId = addSite(freshToken(), { ageDays: 2 });
    const res = await allowanceGet(allowanceReq(freshToken(), siteId));
    expect(res.status).toBe(404);
  });

  it('AC11: the reserve and bind functions check ownership in SQL too', () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', '057_ai_page_usage.sql'), 'utf8');
    expect(sql).toMatch(/s\.id = p_site_id AND s\.user_id = p_user_id/);
    expect(sql.match(/s\.id = p_site_id AND s\.user_id = p_user_id/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
