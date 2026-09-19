/**
 * Load: N simultaneous onboardings through the real extract route (AC13).
 *
 * Everything in the path is real except the network edges: auth and the store
 * query are stubbed, and OpenAI is a fake that behaves like the real service
 * where it matters here —
 *   • a sliding-window TOKENS-PER-MINUTE limiter that charges each request its
 *     input estimate + max_tokens at admission, and answers 429 with
 *     retry-after-ms and x-ratelimit-limit-tokens when the window is full;
 *   • the SDK's own retry behaviour for clients that did not disable it
 *     (maxRetries default 2, honouring retry-after-ms), so code that relied on
 *     silent SDK retries gets exactly those retries;
 *   • latency that grows with output length.
 *
 * Time is compressed 1:TIME_SCALE (default 20): a 60s rate window lasts 3s, and
 * every latency, Retry-After and backoff is divided the same way. Reported
 * durations are converted back to real-world seconds.
 *
 * The same file runs unchanged against the pre-change code (a git worktree) so
 * the before/after numbers come from one harness. Metrics are printed as a
 * single `LOAD_METRICS {json}` line.
 *
 * Opt-in: heavy enough (50 simulated browsers, ~200MB of photos) to starve the
 * rest of the suite of CPU when run in parallel with it. Run it on its own:
 *   RUN_LOAD=1 npx vitest run tests/load/onboardingExtract.load.test.ts
 * Every guarantee it measures is also pinned by the fast acceptance suite.
 *
 * Tunables (env): LOAD_USERS=50 LOAD_PHOTOS=10 LOAD_PHOTO_KB=400 LOAD_TPM=450000
 *                 LOAD_MINI_TPM=2000000 LOAD_TIME_SCALE=20 LOAD_ASSERT=1
 */

import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { NextRequest } from 'next/server';

const USERS = Number(process.env.LOAD_USERS ?? 50);
const PHOTOS = Number(process.env.LOAD_PHOTOS ?? 10);
const PHOTO_KB = Number(process.env.LOAD_PHOTO_KB ?? 400);
const TPM = Number(process.env.LOAD_TPM ?? 450_000);
const MINI_TPM = Number(process.env.LOAD_MINI_TPM ?? 2_000_000);
const SCALE = Number(process.env.LOAD_TIME_SCALE ?? 20);
const ITEMS_PER_PAGE = 15;
const WINDOW_MS = 60_000 / SCALE;
/** 512MB instance − ~200MB Next.js idle − 20% headroom (docs/PROGRESS.md). */
const USABLE_RAM_MB = 210;

// Hoisted: ESM imports run before ordinary top-level statements, and the
// scheduler reads its window when the route module loads. New code only — tell
// it the limits and window the fake enforces, and scale the admission wait.
// Old code ignores all of these.
vi.hoisted(() => {
  const scale = Number(process.env.LOAD_TIME_SCALE ?? 20);
  process.env.OPENAI_API_KEY = 'sk-load';
  process.env.OPENAI_RATE_WINDOW_MS = String(60_000 / scale);
  process.env.OPENAI_TPM_GPT_4O = String(Number(process.env.LOAD_TPM ?? 450_000));
  process.env.OPENAI_TPM_GPT_4O_MINI = String(Number(process.env.LOAD_MINI_TPM ?? 2_000_000));
  process.env.OPENAI_RPM_GPT_4O = '5000';
  process.env.OPENAI_RPM_GPT_4O_MINI = '5000';
  process.env.EXTRACT_ADMISSION_WAIT_MS = String(Math.round(10_000 / scale));
  process.env.EXTRACT_DEADLINE_MS = String(Math.round(50_000 / scale));
  process.env.EXTRACTION_DAILY_BUDGET_USD = '100000';
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
  verifyFirebaseToken: vi.fn(async (t: string) => `uid-${t}`),
}));
vi.mock('@/lib/platform/db/supabase-server', () => ({
  supabaseServer: { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) },
}));

// ── Fake OpenAI with a real TPM limiter ─────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

interface Lane { limit: number; entries: Array<{ t: number; tokens: number }>; maxReserved: number }
const lanes: Record<string, Lane> = {};
function laneFor(model: string): Lane {
  lanes[model] ??= { limit: model === 'gpt-4o-mini' ? MINI_TPM : TPM, entries: [], maxReserved: 0 };
  return lanes[model];
}

const fake = {
  calls: 0, rejected429: 0, sdkRetries: 0, outputTokens: 0, inputTokens: 0, costUsd: 0,
};

/** OpenAI's published per-image token cost at detail:'high' for a 4:3 photo. */
const IMAGE_TOKENS: Record<string, number> = { 'gpt-4o': 765, 'gpt-4o-mini': 25_501 };
const PRICE: Record<string, [number, number]> = { 'gpt-4o': [2.5, 10], 'gpt-4o-mini': [0.15, 0.6] };

function admit(model: string, tokens: number): { ok: true } | { ok: false; retryAfterMs: number } {
  const lane = laneFor(model);
  const now = Date.now();
  lane.entries = lane.entries.filter(e => now - e.t < WINDOW_MS);
  const used = lane.entries.reduce((s, e) => s + e.tokens, 0);
  if (used + tokens > lane.limit) {
    const oldest = lane.entries[0];
    return { ok: false, retryAfterMs: oldest ? Math.max(1, oldest.t + WINDOW_MS - now) : 1 };
  }
  lane.entries.push({ t: now, tokens });
  lane.maxReserved = Math.max(lane.maxReserved, used + tokens);
  return { ok: true };
}

function rateLimitError(model: string, retryAfterMs: number): Error {
  return Object.assign(new Error('429 rate limit'), {
    status: 429,
    headers: {
      'retry-after-ms': String(Math.ceil(retryAfterMs)),
      'x-ratelimit-limit-tokens': String(laneFor(model).limit),
    },
  });
}

/** Marker bytes sit right after the JPEG header; decode only the prefix. */
function markerOf(url: string): string {
  const b64 = url.slice(url.indexOf('base64,') + 7, url.indexOf('base64,') + 7 + 96);
  const m = /U\d+P\d+/.exec(Buffer.from(b64, 'base64').toString('latin1'));
  return m ? m[0] : 'unknown';
}

type Msg = { role: string; content: unknown };

async function serve(params: { model: string; max_tokens?: number; messages: Msg[] }) {
  const user = params.messages.find(m => m.role === 'user');
  const parts = Array.isArray(user?.content) ? user.content as Array<Record<string, unknown>> : [];
  const images = parts.filter(p => p.type === 'image_url').map(p => markerOf((p.image_url as { url: string }).url));
  const text = typeof user?.content === 'string' ? user.content : '';
  const system = String(params.messages.find(m => m.role === 'system')?.content ?? '');

  const inputTokens = Math.ceil((system.length + text.length) / 4) + images.length * (IMAGE_TOKENS[params.model] ?? 765);
  const maxTokens = params.max_tokens ?? 4096;
  const gate = admit(params.model, inputTokens + maxTokens);
  if (!gate.ok) { fake.rejected429++; throw rateLimitError(params.model, gate.retryAfterMs); }

  let content: string;
  let outTokens: number;
  const describe = /these (\d+) items/.exec(text);
  if (describe) {
    const n = Number(describe[1]);
    content = JSON.stringify({ descriptions: Array.from({ length: n }, (_, i) => `Placeholder description ${i}`) });
    outTokens = n * 25;
  } else if (images.length > 0) {
    const tuples = images.flatMap(m => Array.from({ length: ITEMS_PER_PAGE },
      (_, k) => [`${m} dish ${k}`, 100 + k, 'Mains', 's', k % 2 ? 'v' : 'n', []]));
    content = JSON.stringify({ items: tuples });
    outTokens = tuples.length * 22;
  } else {
    content = '{"items":[]}';
    outTokens = 5;
  }
  const finish = outTokens > maxTokens ? 'length' : 'stop';
  // Latency grows with output: ~1.5s + 12ms/token in real time.
  await sleep((1500 + Math.min(outTokens, maxTokens) * 12) / SCALE);

  fake.inputTokens += inputTokens;
  fake.outputTokens += Math.min(outTokens, maxTokens);
  const [pin, pout] = PRICE[params.model] ?? PRICE['gpt-4o'];
  fake.costUsd += (inputTokens * pin + Math.min(outTokens, maxTokens) * pout) / 1e6;
  return {
    choices: [{ message: { content }, finish_reason: finish }],
    usage: { prompt_tokens: inputTokens, completion_tokens: Math.min(outTokens, maxTokens) },
  };
}

vi.mock('openai', () => ({
  default: class {
    maxRetries: number;
    constructor(o?: { maxRetries?: number }) { this.maxRetries = o?.maxRetries ?? 2; }
    chat = {
      completions: {
        create: async (params: { model: string; max_tokens?: number; messages: Msg[] }) => {
          // What the real SDK does for a client that kept its default retries:
          // retry 429s up to maxRetries, sleeping retry-after-ms when given.
          for (let attempt = 0; ; attempt++) {
            fake.calls++;
            try {
              return await serve(params);
            } catch (err) {
              const e = err as { status?: number; headers?: Record<string, string> };
              if (e.status !== 429 || attempt >= this.maxRetries) throw err;
              fake.sdkRetries++;
              const ms = Number(e.headers?.['retry-after-ms']);
              await sleep(Number.isFinite(ms) && ms > 0 && ms < 60_000 / SCALE ? ms : (500 * 2 ** attempt) / SCALE);
            }
          }
        },
      },
    };
  },
}));

import { POST as extractPost } from '@/app/api/onboarding/extract/route';

// ── The crowd ────────────────────────────────────────────────────────────────

function photo(user: number, page: number): File {
  const body = crypto.randomBytes(PHOTO_KB * 1024);
  const head = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`U${user}P${page}`)]);
  head.copy(body, 0);
  return new File([new Uint8Array(body)], `u${user}p${page}.jpg`, { type: 'image/jpeg' });
}

interface Outcome { status: number; items: number; attempts: number; doneMs: number; failedPhotos: number }

interface Upload { bytes: Uint8Array; contentType: string; photos: number }

/** Serialise the way a browser does: real multipart bytes plus Content-Length. */
async function encode(files: File[]): Promise<Upload> {
  const fd = new FormData();
  fd.append('shopName', 'Placeholder Cafe');
  for (const f of files) fd.append('photos', f);
  const encoded = new Response(fd);
  return {
    bytes: new Uint8Array(await encoded.arrayBuffer()),
    contentType: encoded.headers.get('content-type') ?? '',
    photos: files.length,
  };
}

function lazyBody(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (offset >= bytes.byteLength) { c.close(); return; }
      c.enqueue(bytes.subarray(offset, offset + 64 * 1024));
      offset += 64 * 1024;
    },
  });
}

async function onboard(user: number, upload: Upload): Promise<Outcome> {
  const t0 = Date.now();

  // Same patience as the real client (QUEUE_MAX_MS in onboarding/page.tsx).
  const giveUpAt = t0 + (12 * 60_000) / SCALE;
  for (let attempt = 1; Date.now() < giveUpAt; attempt++) {
    const res = await extractPost(new NextRequest('http://localhost/api/onboarding/extract', {
      method: 'POST',
      headers: {
        Authorization: `Bearer u${user}`,
        'content-type': upload.contentType,
        'content-length': String(upload.bytes.byteLength),
        'x-photo-count': String(upload.photos),
      },
      // Streamed lazily in 64KB views, like bytes arriving on a socket: memory
      // is only spent if the server actually reads the body.
      body: lazyBody(upload.bytes),
      duplex: 'half',
    } as ConstructorParameters<typeof NextRequest>[1]));
    const body = await res.json() as { code?: string; items?: unknown[]; failedPhotos?: number[] };
    if ((res.status === 503 && body.code === 'BUSY') || (res.status === 409 && body.code === 'SCAN_IN_PROGRESS')) {
      const wait = (Number(res.headers.get('Retry-After')) || 5) * 1000 / SCALE + Math.random() * 2000 / SCALE;

      await sleep(wait);
      continue;
    }
    return {
      status: res.status, items: body.items?.length ?? 0, attempts: attempt,
      doneMs: Date.now() - t0, failedPhotos: body.failedPhotos?.length ?? 0,
    };
  }
  // QUEUE_GAVE_UP: the owner is offered the skip path. Nothing was spent.
  return { status: 0, items: 0, attempts: -1, doneMs: Date.now() - t0, failedPhotos: 0 };
}

describe.skipIf(process.env.RUN_LOAD !== '1')(`AC13: ${USERS} simultaneous onboardings`, () => {
  it('complete without crashing, losing items or exceeding the rate limit', async () => {
    // Client-side bytes are built before the memory baseline, so peak RAM below
    // is what the server added, not what the simulated browsers hold.
    const crowd = await Promise.all(Array.from({ length: USERS },
      (_, u) => encode(Array.from({ length: PHOTOS }, (_, p) => photo(u, p)))));

    // New code exposes its admission budget; the old code has none.
    let admissionStats: (() => { inFlightBytes: number; budgetBytes: number }) | null = null;
    try {
      const mod = await import('@/lib/platform/uploadAdmission');
      admissionStats = mod.uploadAdmissionStats;
    } catch { admissionStats = null; }

    const gc = (globalThis as { gc?: () => void }).gc;
    gc?.();
    await sleep(100);
    const baseRss = process.memoryUsage().rss;
    let peakRss = baseRss;
    let peakAdmitted = 0;
    const sampler = setInterval(() => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
      if (admissionStats) peakAdmitted = Math.max(peakAdmitted, admissionStats().inFlightBytes);
    }, 5);

    // Tally why pages failed, from the extractor's own warning line.
    const failureReasons: Record<string, number> = {};
    const realWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const m = /pages failed: (.*)$/.exec(String(args[0] ?? ''));
      if (m) for (const r of m[1].split(',')) failureReasons[r] = (failureReasons[r] ?? 0) + 1;
      else realWarn(...args);
    };

    const t0 = Date.now();
    const outcomes = await Promise.all(crowd.map((upload, u) => onboard(u, upload)));
    const wallMs = Date.now() - t0;
    clearInterval(sampler);
    console.warn = realWarn;

    const expectedItems = USERS * PHOTOS * ITEMS_PER_PAGE;
    const gotItems = outcomes.reduce((s, o) => s + o.items, 0);
    const byStatus: Record<string, number> = {};
    for (const o of outcomes) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    const complete = outcomes.filter(o => o.status === 200 && o.items === PHOTOS * ITEMS_PER_PAGE).length;
    const doneTimes = outcomes.map(o => o.doneMs).sort((a, b) => a - b);
    const realSec = (ms: number) => Math.round((ms * SCALE) / 100) / 10;
    const addedPeakMb = Math.round((peakRss - baseRss) / 1024 / 1024);

    const metrics = {
      users: USERS, photos: PHOTOS, photoKb: PHOTO_KB, tpm: TPM,
      completeMenus: complete,
      menusWithMissingItems: outcomes.filter(o => o.status === 200 && o.items < PHOTOS * ITEMS_PER_PAGE).length,
      failedRequests: outcomes.filter(o => o.status !== 200).length,
      statusCounts: byStatus,
      itemsExpected: expectedItems,
      itemsReturned: gotItems,
      itemsLostPct: Math.round(((expectedItems - gotItems) / expectedItems) * 1000) / 10,
      openaiCalls: fake.calls,
      openai429s: fake.rejected429,
      sdkSilentRetries: fake.sdkRetries,
      maxTokensReservedInWindow: lanes['gpt-4o']?.maxReserved ?? 0,
      tpmRespected: (lanes['gpt-4o']?.maxReserved ?? 0) <= TPM,
      costUsd: Math.round(fake.costUsd * 1000) / 1000,
      costPerCompleteMenuUsd: complete ? Math.round((fake.costUsd / complete) * 10000) / 10000 : null,
      peakAddedRamMb: addedPeakMb,
      usableRamMb: USABLE_RAM_MB,
      wouldExhaustInstance: addedPeakMb > USABLE_RAM_MB,
      peakAdmittedUploadMb: admissionStats ? Math.round((peakAdmitted / 1024 / 1024) * 10) / 10 : null,
      admissionBudgetUploadMb: admissionStats ? Math.round((admissionStats().budgetBytes / 1024 / 1024) * 10) / 10 : null,
      realSecondsFirstDone: realSec(doneTimes[0] ?? 0),
      realSecondsMedianDone: realSec(doneTimes[Math.floor(doneTimes.length / 2)] ?? 0),
      realSecondsLastDone: realSec(doneTimes[doneTimes.length - 1] ?? 0),
      realSecondsWall: realSec(wallMs),
      pageFailureReasons: failureReasons,
    };
    console.info(`LOAD_METRICS ${JSON.stringify(metrics)}`);
    if (process.env.LOAD_METRICS_FILE) appendFileSync(process.env.LOAD_METRICS_FILE, `${JSON.stringify(metrics)}
`);

    if (process.env.LOAD_ASSERT === '0') return;
    expect(metrics.completeMenus).toBe(USERS);
    expect(metrics.itemsReturned).toBe(expectedItems);
    expect(metrics.tpmRespected).toBe(true);
    if (admissionStats) expect(peakAdmitted).toBeLessThanOrEqual(admissionStats().budgetBytes);
  }, 600_000);
});
