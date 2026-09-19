/**
 * Abuse: what one logged-in account can do to the extract route.
 *
 *   A. one chunked 200MB upload (no Content-Length)
 *   B. five parallel 30MB uploads (each within the pre-change 30MB cap)
 *   C. ten scans of 15 ultra-dense pages (300 dishes a page), one after another
 *
 * Runs unchanged against the pre-change code (git worktree, LOAD_ASSERT=0) for
 * the before/after comparison. Server-side peak RAM is measured against the RSS
 * baseline taken after every client-side byte already exists. OpenAI is a fake
 * that prices tokens like the real one.
 *
 * Opt-in (allocates ~350MB of attack payloads): RUN_LOAD=1 npx vitest run tests/load/extractAbuse.load.test.ts Prints one `ABUSE_METRICS {json}` line
 * and appends it to $LOAD_METRICS_FILE when set.
 */

import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { NextRequest } from 'next/server';

vi.hoisted(() => {
  process.env.OPENAI_API_KEY = 'sk-abuse';
  process.env.EXTRACT_ADMISSION_WAIT_MS = '200';
  process.env.OPENAI_TPM_GPT_4O = '100000000';
  process.env.OPENAI_TPM_GPT_4O_MINI = '100000000';
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
  verifyFirebaseToken: vi.fn(async (t: string) => `uid-${t}`),
}));
vi.mock('@/lib/platform/db/supabase-server', () => ({
  supabaseServer: { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) },
}));

const MB = 1024 * 1024;
const DENSE_ITEMS_PER_PAGE = 300;
const PRICE: Record<string, [number, number]> = { 'gpt-4o': [2.5, 10], 'gpt-4o-mini': [0.15, 0.6] };
const IMAGE_TOKENS: Record<string, number> = { 'gpt-4o': 765, 'gpt-4o-mini': 25_501 };
const fake = { calls: 0, costUsd: 0 };

type Msg = { role: string; content: unknown };

vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: async (params: { model: string; max_tokens?: number; messages: Msg[] }) => {
          fake.calls++;
          const user = params.messages.find(m => m.role === 'user');
          const parts = Array.isArray(user?.content) ? user.content as Array<Record<string, unknown>> : [];
          const images = parts.filter(p => p.type === 'image_url').length;
          const text = typeof user?.content === 'string' ? user.content : '';
          const maxTokens = params.max_tokens ?? 4096;
          let content: string;
          let wanted: number;
          const describe = /these (\d+) items/.exec(text);
          if (describe) {
            const n = Number(describe[1]);
            content = JSON.stringify({ descriptions: Array.from({ length: n }, (_, i) => `Placeholder ${i}`) });
            wanted = n * 25;
          } else {
            const tuples = Array.from({ length: images * DENSE_ITEMS_PER_PAGE },
              (_, k) => [`Dense dish ${crypto.randomUUID().slice(0, 8)} ${k}`, 100 + k, 'Mains', 's', 'v', []]);
            content = JSON.stringify({ items: tuples });
            wanted = tuples.length * 22;
          }
          const out = Math.min(wanted, maxTokens);
          if (wanted > maxTokens) content = content.slice(0, Math.floor(content.length * (maxTokens / wanted)));
          const input = 400 + Math.ceil(text.length / 4) + images * (IMAGE_TOKENS[params.model] ?? 765);
          const [pin, pout] = PRICE[params.model] ?? PRICE['gpt-4o'];
          fake.costUsd += (input * pin + out * pout) / 1e6;
          return {
            choices: [{ message: { content }, finish_reason: wanted > maxTokens ? 'length' : 'stop' }],
            usage: { prompt_tokens: input, completion_tokens: out },
          };
        },
      },
    };
  },
}));

import { POST as extractPost } from '@/app/api/onboarding/extract/route';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function jpeg(bytes: number, tag: string): Uint8Array<ArrayBuffer> {
  const b = crypto.randomBytes(bytes);
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(tag)]).copy(b, 0);
  return Uint8Array.from(b);
}

async function multipart(photos: Uint8Array<ArrayBuffer>[]): Promise<{ bytes: Uint8Array; type: string }> {
  const fd = new FormData();
  fd.append('shopName', 'Placeholder Cafe');
  photos.forEach((p, i) => fd.append('photos', new File([p], `p${i}.jpg`, { type: 'image/jpeg' })));
  const r = new Response(fd);
  return { bytes: new Uint8Array(await r.arrayBuffer()), type: r.headers.get('content-type') ?? '' };
}

function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let off = 0;
  return new ReadableStream({
    pull(c) {
      if (off >= bytes.byteLength) { c.close(); return; }
      c.enqueue(bytes.subarray(off, off + 256 * 1024));
      off += 256 * 1024;
    },
  });
}

function post(token: string, body: { bytes: Uint8Array; type: string }, declareLength: boolean) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'content-type': body.type };
  if (declareLength) headers['content-length'] = String(body.bytes.byteLength);
  return extractPost(new NextRequest('http://localhost/api/onboarding/extract', {
    method: 'POST', headers, body: stream(body.bytes), duplex: 'half',
  } as ConstructorParameters<typeof NextRequest>[1]));
}

async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; peakMb: number; ms: number }> {
  (globalThis as { gc?: () => void }).gc?.();
  await sleep(200);
  const base = process.memoryUsage().rss;
  let peak = base;
  const t = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  const t0 = Date.now();
  const result = await fn();
  const ms = Date.now() - t0;
  clearInterval(t);
  peak = Math.max(peak, process.memoryUsage().rss);
  return { result, peakMb: Math.round((peak - base) / MB), ms };
}

describe.skipIf(process.env.RUN_LOAD !== '1')('abuse by one logged-in account', () => {
  it('A/B/C', async () => {
    // A — one chunked 200MB body (no Content-Length).
    const huge = await multipart(Array.from({ length: 100 }, (_, i) => jpeg(2 * MB, `A${i}`)));
    const a = await measure(() => post('attacker-a', huge, false));

    // B — five parallel 30MB bodies, each declaring its length.
    const thirty = await Promise.all(Array.from({ length: 5 }, (_, j) =>
      multipart(Array.from({ length: 15 }, (_, i) => jpeg(Math.floor(1.95 * MB), `B${j}-${i}`)))));
    fake.costUsd = 0;
    const b = await measure(() => Promise.all(thirty.map((body, j) => post(`attacker-b${j}`, body, true))));
    const bCost = fake.costUsd;

    // C — ten dense scans from one account, sequentially.
    const dense = await multipart(Array.from({ length: 15 }, (_, i) => jpeg(400 * 1024, `C${i}`)));
    fake.costUsd = 0;
    const cStatuses: number[] = [];
    for (let i = 0; i < 10; i++) cStatuses.push((await post('attacker-c', dense, true)).status);
    const cCost = fake.costUsd;

    const metrics = {
      A_chunked200MB: { status: a.result.status, serverPeakRamMb: a.peakMb, ms: a.ms },
      B_fiveParallel30MB: {
        statuses: b.result.map(r => r.status), serverPeakRamMb: b.peakMb, openaiCostUsd: Math.round(bCost * 1000) / 1000,
      },
      C_tenDenseScans: {
        statuses: cStatuses, openaiCostUsd: Math.round(cCost * 1000) / 1000,
        costPerAcceptedScanUsd: Math.round((cCost / Math.max(1, cStatuses.filter(s => s === 200 || s === 422).length)) * 1000) / 1000,
      },
    };
    console.info(`ABUSE_METRICS ${JSON.stringify(metrics)}`);
    if (process.env.LOAD_METRICS_FILE) appendFileSync(process.env.LOAD_METRICS_FILE, `${JSON.stringify(metrics)}\n`);
    if (process.env.LOAD_ASSERT === '0') return;
    // A/B: refused before the body is buffered — no RAM spike, nothing spent.
    expect(metrics.A_chunked200MB.status).toBe(413);
    expect(metrics.B_fiveParallel30MB.statuses.every(st => st === 413)).toBe(true);
    expect(metrics.B_fiveParallel30MB.openaiCostUsd).toBe(0);
    // C: the per-scan output budget bounds each scan; the per-user cap stops the account.
    expect(metrics.C_tenDenseScans.costPerAcceptedScanUsd).toBeLessThan(0.7);
    expect(metrics.C_tenDenseScans.openaiCostUsd).toBeLessThan(1.5);
    expect(cStatuses.slice(-3).every(st => st === 429)).toBe(true);
  }, 600_000);
});
