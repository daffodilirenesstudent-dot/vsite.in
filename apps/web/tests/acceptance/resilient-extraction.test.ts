/**
 * Resilient menu extraction — acceptance (docs/GOAL.md, AC1–AC12).
 *
 * The measured failure modes this suite pins down (2026-09-19):
 *   • the extract path holds ~7× the upload in RAM, so two maximum-size bodies
 *     from one account exhaust a 512MB instance;
 *   • every Pass 1 call reserved 16k tokens against the OpenAI per-minute limit,
 *     so a burst of signups was answered with 429 — and allSettled turned that
 *     into a menu with pages missing and a success message;
 *   • nothing stopped spend except an in-memory counter a deploy resets.
 *
 * The OpenAI client is a fake driven per test, so the code under test is ours:
 * admission, scheduling, the per-page fallback ladder and the route's answers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

process.env.OPENAI_API_KEY = 'sk-test';
process.env.EXTRACT_ADMISSION_WAIT_MS = '50';

vi.mock('server-only', () => ({}));

// ── Fake OpenAI ──────────────────────────────────────────────────────────────

interface FakeCall {
  model: string;
  max_tokens: number;
  images: string[];      // decoded marker text of each image in the call
  text: string;          // concatenated text parts
}
type FakeReply = { content: string; finish_reason?: string } | Error;

const calls: FakeCall[] = [];
const clientOptions: Array<Record<string, unknown>> = [];
let handler: (c: FakeCall) => FakeReply = () => ({ content: '{"items":[]}' });

function decodeMarker(url: string): string {
  const b64 = url.split('base64,')[1] ?? '';
  return Buffer.from(b64, 'base64').toString('latin1').replace(/[^\x20-\x7e]/g, '');
}

vi.mock('openai', () => ({
  default: class {
    constructor(o?: Record<string, unknown>) { clientOptions.push(o ?? {}); }
    chat = {
      completions: {
        create: async (params: {
          model: string; max_tokens: number;
          messages: Array<{ role: string; content: unknown }>;
        }) => {
          const user = params.messages.find(m => m.role === 'user');
          const parts = Array.isArray(user?.content) ? user?.content as Array<Record<string, unknown>> : [];
          const call: FakeCall = {
            model: params.model,
            max_tokens: params.max_tokens,
            images: parts.filter(p => p.type === 'image_url')
              .map(p => decodeMarker((p.image_url as { url: string }).url)),
            text: typeof user?.content === 'string' ? user.content
              : parts.filter(p => p.type === 'text').map(p => String(p.text)).join(' '),
          };
          calls.push(call);
          const reply = handler(call);
          if (reply instanceof Error) throw reply;
          return {
            choices: [{ message: { content: reply.content }, finish_reason: reply.finish_reason ?? 'stop' }],
            usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 },
          };
        },
      },
    };
  },
}));

function httpError(status: number, headers: Record<string, string> = {}): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status, headers });
}

/** Default behaviour: each image yields two items named after its marker. */
function itemsFor(call: FakeCall): FakeReply {
  if (call.text.startsWith('Write descriptions')) {
    const n = Number(/these (\d+) items/.exec(call.text)?.[1] ?? 0);
    return { content: JSON.stringify({ descriptions: Array.from({ length: n }, (_, i) => `desc ${i}`) }) };
  }
  const tuples = call.images.flatMap(m => [
    [`${m} dish A`, 100, 'Mains', 's', 'v', []],
    [`${m} dish B`, 120, 'Mains', 's', 'n', []],
  ]);
  return { content: JSON.stringify({ items: tuples }) };
}

// ── Auth + DB fakes ──────────────────────────────────────────────────────────

vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
  verifyFirebaseToken: vi.fn(async (t: string) => (t === 'bad' ? null : `uid-${t}`)),
}));

let sitesResult: { data: unknown[] | null; error: unknown } = { data: [], error: null };
vi.mock('@/lib/platform/db/supabase-server', () => ({
  supabaseServer: {
    from: vi.fn(() => ({
      select: () => ({ eq: async () => sitesResult }),
    })),
  },
}));

// ── Imports under test (after mocks) ─────────────────────────────────────────

import { boundBody } from '@/lib/platform/boundedBody';
import {
  admitUpload, uploadBudgetBytes, __resetUploadAdmission,
} from '@/lib/platform/uploadAdmission';
import { createRateScheduler, __resetRateScheduler } from '@/lib/menu/openaiScheduler';
import { recordAiUsage, aiSpendAllowed, __resetAiSpend } from '@/lib/menu/aiSpendGuard';
import { extractMenuPages, extractMenuItems } from '@/lib/menu/menuExtractor';
import { POST as extractPost } from '@/app/api/onboarding/extract/route';

const MB = 1024 * 1024;

function page(marker: string): { buffer: Buffer; mime: string } {
  return { buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(marker)]), mime: 'image/jpeg' };
}

function photoFile(marker: string): File {
  return new File([page(marker).buffer], `${marker}.jpg`, { type: 'image/jpeg' });
}

function extractRequest(token: string, markers: string[], shopName = 'Placeholder Cafe'): NextRequest {
  const fd = new FormData();
  fd.append('shopName', shopName);
  for (const m of markers) fd.append('photos', photoFile(m));
  return new NextRequest('http://localhost/api/onboarding/extract', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
}

let tokenSeq = 0;
const freshToken = () => `t${Date.now()}-${tokenSeq++}`;

beforeEach(() => {
  calls.length = 0;
  handler = itemsFor;
  sitesResult = { data: [], error: null };
  delete process.env.EXTRACTION_DAILY_BUDGET_USD;
  __resetUploadAdmission();
  __resetRateScheduler();
  __resetAiSpend();
});

// =============================================================================
// AC1 — bounded body
// =============================================================================
describe('AC1: an oversized body is refused without being buffered', () => {
  function endlessBody(counter: { pulled: number }): ReadableStream<Uint8Array> {
    const chunk = new Uint8Array(64 * 1024);
    return new ReadableStream({
      pull(c) {
        counter.pulled += chunk.length;
        if (counter.pulled > 50 * MB) { c.close(); return; }
        c.enqueue(chunk);
      },
    });
  }

  it('boundBody stops reading at limit + one chunk, even with no Content-Length', async () => {
    const counter = { pulled: 0 };
    const req = new Request('http://x/', {
      method: 'POST', body: endlessBody(counter),
      headers: { 'content-type': 'multipart/form-data; boundary=zz' },
      duplex: 'half',
    } as RequestInit);
    const bounded = boundBody(req, 1 * MB);
    await expect(bounded.request.formData()).rejects.toBeTruthy();
    expect(bounded.exceeded()).toBe(true);
    expect(counter.pulled).toBeLessThanOrEqual(1 * MB + 4 * 64 * 1024);
  });

  it('the route answers a chunked 50MB upload with 413 after reading only the limit', async () => {
    const counter = { pulled: 0 };
    const req = new NextRequest('http://localhost/api/onboarding/extract', {
      method: 'POST', body: endlessBody(counter),
      headers: { Authorization: `Bearer ${freshToken()}`, 'content-type': 'multipart/form-data; boundary=zz' },
      duplex: 'half',
    } as ConstructorParameters<typeof NextRequest>[1]);
    const res = await extractPost(req);
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe('PAYLOAD_TOO_LARGE');
    expect(counter.pulled).toBeLessThanOrEqual(16 * MB);
    expect(calls).toHaveLength(0);
  });
});

// =============================================================================
// AC2 / AC3 — admission
// =============================================================================
describe('AC2: uploads are admitted against a memory budget', () => {
  it('the budget reflects the measured ~7x amplification of a 200MB allowance', () => {
    const b = uploadBudgetBytes();
    expect(b).toBeGreaterThan(20 * MB);
    expect(b).toBeLessThan(40 * MB);
  });

  it('refuses with busy + retryAfter when full, and admits once released', async () => {
    const full = await admitUpload({ userId: 'a', bytes: uploadBudgetBytes(), maxWaitMs: 0 });
    expect(full.ok).toBe(true);
    const refused = await admitUpload({ userId: 'b', bytes: 1024, maxWaitMs: 30 });
    expect(refused).toMatchObject({ ok: false, reason: 'busy' });
    if (!refused.ok) expect(refused.retryAfterSec).toBeGreaterThan(0);
    if (full.ok) full.ticket.release();
    expect((await admitUpload({ userId: 'b', bytes: 1024, maxWaitMs: 0 })).ok).toBe(true);
  });

  it('a waiting upload is admitted as soon as room frees up', async () => {
    const full = await admitUpload({ userId: 'a', bytes: uploadBudgetBytes(), maxWaitMs: 0 });
    const waiting = admitUpload({ userId: 'c', bytes: 1024, maxWaitMs: 2000 });
    setTimeout(() => { if (full.ok) full.ticket.release(); }, 20);
    expect((await waiting).ok).toBe(true);
  });

  it('the route returns 503 BUSY with Retry-After and never reads the body', async () => {
    await admitUpload({ userId: 'hog', bytes: uploadBudgetBytes(), maxWaitMs: 0 });
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({ pull(c) { pulled++; c.enqueue(new Uint8Array(1024)); } });
    const req = new NextRequest('http://localhost/api/onboarding/extract', {
      method: 'POST', body,
      headers: { Authorization: `Bearer ${freshToken()}`, 'content-type': 'multipart/form-data; boundary=zz' },
      duplex: 'half',
    } as ConstructorParameters<typeof NextRequest>[1]);
    const res = await extractPost(req);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('BUSY');
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(pulled).toBeLessThanOrEqual(1);
  });
});

describe('AC3: one scan per user at a time', () => {
  it('a second concurrent scan by the same user gets 409 SCAN_IN_PROGRESS', async () => {
    const token = freshToken();
    await admitUpload({ userId: `uid-${token}`, bytes: 1024, maxWaitMs: 0 });
    const res = await extractPost(extractRequest(token, ['p1']));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('SCAN_IN_PROGRESS');
    expect(calls).toHaveLength(0);
  });
});

// =============================================================================
// AC4–AC7 — per-page extraction and the fallback ladder
// =============================================================================
describe('AC4: each photo is extracted on its own, and fails on its own', () => {
  it('one call per page', async () => {
    await extractMenuPages([page('p0'), page('p1'), page('p2')]);
    const pass1 = calls.filter(c => c.images.length > 0);
    expect(pass1).toHaveLength(3);
    expect(pass1.every(c => c.images.length === 1)).toBe(true);
  });

  it('a page that fails everywhere is reported; the other pages survive', async () => {
    handler = (c) => (c.images[0]?.includes('p1') ? httpError(500) : itemsFor(c));
    const report = await extractMenuPages([page('p0'), page('p1'), page('p2')]);
    const names = report.items.map(i => i.name);
    expect(names.some(n => n.includes('p0'))).toBe(true);
    expect(names.some(n => n.includes('p2'))).toBe(true);
    expect(names.some(n => n.includes('p1'))).toBe(false);
    expect(report.failedPages).toEqual([1]);
  });

  it('the route returns 200 with partial:true and 1-based failedPhotos', async () => {
    handler = (c) => (c.images[0]?.includes('q2') ? httpError(500) : itemsFor(c));
    const res = await extractPost(extractRequest(freshToken(), ['q1', 'q2', 'q3']));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partial).toBe(true);
    expect(body.failedPhotos).toEqual([2]);
    expect(body.items.length).toBe(4);
  });
});

describe('AC5: truncated output is recovered, not discarded', () => {
  const full = JSON.stringify({ items: [['A', 10, '', 's', 'v', []], ['B', 20, '', 's', 'v', []], ['C', 30, '', 's', 'v', []]] });
  const cut = full.slice(0, full.indexOf('["C"') + 6);

  it('finish_reason "length" retries the page with a larger budget', async () => {
    handler = (c) => {
      if (c.text.startsWith('Write descriptions')) return itemsFor(c);
      return c.max_tokens <= 2500 ? { content: cut, finish_reason: 'length' } : { content: full };
    };
    const report = await extractMenuPages([page('p0')]);
    expect(report.items.map(i => i.name).sort()).toEqual(['A', 'B', 'C']);
    const pass1 = calls.filter(c => c.images.length > 0);
    expect(pass1[1].max_tokens).toBeGreaterThan(2500);
  });

  it('when even the retry is cut off, complete items are salvaged', async () => {
    handler = (c) => (c.text.startsWith('Write descriptions') ? itemsFor(c) : { content: cut, finish_reason: 'length' });
    const report = await extractMenuPages([page('p0')]);
    expect(report.items.map(i => i.name).sort()).toEqual(['A', 'B']);
    expect(report.failedPages).toEqual([]);
  });
});

describe('AC6: a rate-limited page falls back to the other model pool', () => {
  it('gpt-4o 429 twice → gpt-4o-mini', async () => {
    handler = (c) => (c.model === 'gpt-4o' && c.images.length
      ? httpError(429, { 'retry-after-ms': '5' })
      : itemsFor(c));
    const report = await extractMenuPages([page('p0')]);
    expect(report.items.length).toBe(2);
    const pass1 = calls.filter(c => c.images.length > 0).map(c => c.model);
    expect(pass1).toEqual(['gpt-4o', 'gpt-4o', 'gpt-4o-mini']);
  });
});

describe('AC7: right-sized reservations and an honest client', () => {
  it('first attempt per page asks for at most 2,500 output tokens', async () => {
    await extractMenuPages([page('p0'), page('p1')]);
    for (const c of calls.filter(x => x.images.length > 0)) expect(c.max_tokens).toBeLessThanOrEqual(2500);
  });

  it('the OpenAI client sets an explicit timeout and disables hidden SDK retries', async () => {
    await extractMenuPages([page('p0')]);
    const opts = clientOptions[clientOptions.length - 1];
    expect(Number(opts.timeout)).toBeGreaterThan(0);
    expect(Number(opts.timeout)).toBeLessThanOrEqual(60_000);
    expect(opts.maxRetries).toBe(0);
  });
});

// =============================================================================
// AC8 — token scheduler
// =============================================================================
describe('AC8: the scheduler keeps reservations inside the rate window', () => {
  it('a reservation that would exceed the window waits for it to roll', async () => {
    const s = createRateScheduler({ windowMs: 200 });
    s.setLimits('m', { tokens: 1000, requests: 100 });
    (await s.acquire('m', 600)).ok();
    const t0 = Date.now();
    (await s.acquire('m', 600)).ok();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(150);
  });

  it('learns a lower limit from x-ratelimit headers', () => {
    const s = createRateScheduler({ windowMs: 60_000 });
    s.setLimits('m', { tokens: 1_000_000, requests: 1000 });
    s.learn('m', { 'x-ratelimit-limit-tokens': '30000', 'x-ratelimit-limit-requests': '500' });
    expect(s.stats('m').tokenLimit).toBeLessThanOrEqual(30_000);
  });

  it('honours retry-after before admitting anything else on that model', async () => {
    const s = createRateScheduler({ windowMs: 60_000 });
    s.setLimits('m', { tokens: 1_000_000, requests: 1000 });
    s.rateLimited('m', { 'retry-after-ms': '120' });
    const t0 = Date.now();
    (await s.acquire('m', 10)).ok();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(100);
  });

  it('gives up at the deadline instead of queueing forever', async () => {
    const s = createRateScheduler({ windowMs: 10_000 });
    s.setLimits('m', { tokens: 100, requests: 100 });
    (await s.acquire('m', 100)).ok();
    await expect(s.acquire('m', 100, { deadline: Date.now() + 40 })).rejects.toMatchObject({ code: 'SCHEDULER_TIMEOUT' });
  });
});

// =============================================================================
// AC9 — dedup
// =============================================================================
describe('AC9: dedup keeps section-relative names', () => {
  it('"Plain 60" under two sections is two items; one with no section merges', async () => {
    handler = (c) => (c.text.startsWith('Write descriptions') ? itemsFor(c) : {
      content: JSON.stringify({ items: [
        ['Plain', 60, 'Dosa', 's', 'v', []],
        ['Plain', 60, 'Uthappam', 's', 'v', []],
        ['Plain', 60, '', 's', 'v', []],
      ] }),
    });
    const items = await extractMenuItems('menu text');
    expect(items.map(i => i.category).sort()).toEqual(['Dosa', 'Uthappam']);
  });
});

// =============================================================================
// AC10 / AC11 — money is checked before it is spent
// =============================================================================
describe('AC10: daily AI spend guard', () => {
  it('records usage and closes when the budget is spent', () => {
    process.env.EXTRACTION_DAILY_BUDGET_USD = '0.01';
    expect(aiSpendAllowed()).toBe(true);
    recordAiUsage('gpt-4o', { prompt_tokens: 10_000, completion_tokens: 10_000 });
    expect(aiSpendAllowed()).toBe(false);
  });

  it('the route answers 503 AI_PAUSED without calling OpenAI', async () => {
    process.env.EXTRACTION_DAILY_BUDGET_USD = '0.01';
    recordAiUsage('gpt-4o', { prompt_tokens: 10_000, completion_tokens: 10_000 });
    const res = await extractPost(extractRequest(freshToken(), ['p1']));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('AI_PAUSED');
    expect(calls).toHaveLength(0);
  });
});

describe('AC11: store eligibility is checked before any AI spend', () => {
  it('a user at the store limit is refused at extract', async () => {
    sitesResult = {
      data: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, created_at: '2020-01-01T00:00:00Z', site_subscriptions: [] })),
      error: null,
    };
    const res = await extractPost(extractRequest(freshToken(), ['p1']));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PLAN_LIMIT');
    expect(calls).toHaveLength(0);
  });

  it('fails closed when the store count cannot be read', async () => {
    sitesResult = { data: null, error: { message: 'down' } };
    const res = await extractPost(extractRequest(freshToken(), ['p1']));
    expect(res.status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});

// =============================================================================
// AC12 — the onboarding screen
// =============================================================================
describe('AC12: the onboarding screen explains what happened and what to do', () => {
  const SRC = join(__dirname, '..', '..', 'src');
  const page = () => readFileSync(join(SRC, 'app', 'onboarding', 'page.tsx'), 'utf8');
  const messages = () => readFileSync(join(SRC, 'app', 'onboarding', 'scanMessages.ts'), 'utf8');
  const route = () => readFileSync(join(SRC, 'app', 'api', 'onboarding', 'extract', 'route.ts'), 'utf8');

  it('every error code the extract route emits has an English and a Tamil message', () => {
    const codes = Array.from(new Set(Array.from(route().matchAll(/code: '([A-Z_]+)'/g), m => m[1])));
    expect(codes.length).toBeGreaterThan(5);
    const src = messages();
    for (const code of codes) {
      const entry = new RegExp(`${code}:\\s*\\{[^}]*en:[^}]*ta:\\s*'[^']*[\\u0B80-\\u0BFF]`);
      expect(src, `missing bilingual message for ${code}`).toMatch(entry);
    }
  });

  it('BUSY and SCAN_IN_PROGRESS are retried automatically, honouring Retry-After', () => {
    const src = page();
    expect(src).toMatch(/BUSY/);
    expect(src).toMatch(/Retry-After/);
  });

  it('a partial scan is disclosed to the owner', () => {
    expect(page()).toMatch(/failedPhotos/);
  });

  it('there is a way forward without a scan', () => {
    expect(page()).toMatch(/handleSkipScan/);
  });

  it('photos can be dropped on desktop without the browser navigating away', () => {
    const src = page();
    expect(src).toMatch(/onDrop=/);
    expect(src).toMatch(/addEventListener\('dragover'/);
  });

  it('the remove-photo control is visible on touch screens', () => {
    expect(page()).not.toMatch(/opacity-0 transition-opacity group-hover:opacity-100 active:opacity-100/);
  });
});
