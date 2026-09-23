/**
 * AI menu page limits — AC10 backward compatibility.
 *
 * With AI_PAGE_LIMITS mocked OFF explicitly, onboarding and bulk upload behave
 * exactly as they did before the feature: no page ledger, no new request
 * headers, no new response keys, and the old per-day bulk quota. The flag is
 * mocked rather than read from its default so this suite stays valid after
 * the go-live flip.
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
  AI_PAGE_LIMITS: false,
}));

const calls: string[] = [];
vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: async (params: { messages: Array<{ role: string; content: unknown }> }) => {
          const user = params.messages.find(m => m.role === 'user');
          const text = typeof user?.content === 'string' ? user.content : '';
          calls.push(text ? 'describe' : 'extract');
          const content = text.startsWith('Write descriptions')
            ? JSON.stringify({ descriptions: Array.from({ length: Number(/these (\d+) items/.exec(text)?.[1] ?? 0) }, () => 'desc') })
            : JSON.stringify({ items: [['Placeholder Dish', 100, 'Mains', 's', 'v', []]] });
          return { choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100 } };
        },
      },
    };
  },
}));

vi.mock('@/lib/auth/verifyFirebaseToken', () => ({
  verifyFirebaseToken: vi.fn(async (t: string) => `uid-${t}`),
}));

const tableReads: string[] = [];
const rpcCalls: string[] = [];
vi.mock('@/lib/platform/db/supabase-server', () => {
  const builder = (table: string) => {
    tableReads.push(table);
    const b = {
      select: () => b, eq: () => b, is: () => b, order: () => b, limit: () => b,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
    };
    return b;
  };
  return {
    supabaseServer: {
      from: (t: string) => builder(t),
      rpc: (fn: string) => { rpcCalls.push(fn); return Promise.resolve({ data: null, error: null }); },
    },
  };
});

import { __resetUploadAdmission } from '@/lib/platform/uploadAdmission';
import { __resetRateScheduler } from '@/lib/menu/openaiScheduler';
import { __resetAiSpend } from '@/lib/menu/aiSpendGuard';
import { POST as onboardingExtract } from '@/app/api/onboarding/extract/route';
import { POST as bulkExtract } from '@/app/api/bulk-import/extract/route';

const SRC = join(__dirname, '..', '..', 'src');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

function photo(marker: string): File {
  const bytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(marker)]);
  return new File([new Uint8Array(bytes)], `${marker}.jpg`, { type: 'image/jpeg' });
}

function onboardingReq(token: string, n: number): NextRequest {
  const fd = new FormData();
  fd.append('shopName', 'Placeholder Cafe');
  for (let i = 0; i < n; i++) fd.append('photos', photo(`p${i}`));
  return new NextRequest('http://localhost/api/onboarding/extract', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
}

function bulkReq(token: string, n: number): NextRequest {
  const fd = new FormData();
  for (let i = 0; i < n; i++) fd.append('photos', photo(`b${i}`));
  return new NextRequest('http://localhost/api/bulk-import/extract', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
}

let seq = 0;
const freshToken = () => `off${Date.now()}-${seq++}`;

beforeEach(() => {
  calls.length = 0;
  tableReads.length = 0;
  rpcCalls.length = 0;
  delete process.env.EXTRACTION_USER_DAILY_BUDGET_USD;
  __resetUploadAdmission();
  __resetRateScheduler();
  __resetAiSpend();
});

describe('AC10: with AI_PAGE_LIMITS OFF, everything behaves as before', () => {
  it('AC10: two 15-photo onboarding scans both succeed, with no page ledger and no pages key', async () => {
    const t = freshToken();
    for (let i = 0; i < 2; i++) {
      const res = await onboardingExtract(onboardingReq(t, 15));
      expect(res.status).toBe(200);
      expect(await res.json()).not.toHaveProperty('pages');
    }
    expect(rpcCalls).toHaveLength(0);
    expect(tableReads).not.toContain('ai_page_usage');
  });

  it('AC10: bulk extract needs no store id and answers with the old shape', async () => {
    const res = await bulkExtract(bulkReq(freshToken(), 2));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['items', 'photosProcessed', 'success']);
    expect(rpcCalls).toHaveLength(0);
    expect(tableReads).not.toContain('ai_page_usage');
  });

  it('AC10: bulk extract keeps only the global spend guard (the per-user cap is behind the flag)', async () => {
    process.env.EXTRACTION_USER_DAILY_BUDGET_USD = '0';
    const res = await bulkExtract(bulkReq(freshToken(), 1));
    expect(res.status).toBe(200);
  });

  it('AC10: the allowance route reports limits as not enforced, without touching the database', async () => {
    const { GET } = await import('@/app/api/bulk-import/allowance/route');
    const res = await GET(new NextRequest('http://localhost/api/bulk-import/allowance?siteId=s1', { headers: { Authorization: 'Bearer x' } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, enforced: false });
    expect(tableReads).toHaveLength(0);
  });

  it("AC10: the modal's flag-OFF path keeps today's photo-only picker and daily quota", () => {
    const src = read('components', 'manage', 'BulkImportModal.tsx');
    expect(src).toMatch(/accept="image\/\*"/);
    expect(src).toMatch(/bulk_import_usage/);
    expect(src).toMatch(/Daily limit reached/);
    expect(src).toMatch(/photos used/);
  });

  it('AC10: /complete binds pages only when the flag is on', () => {
    const src = read('app', 'api', 'onboarding', 'complete', 'route.ts');
    const binds = src.match(/bindOnboardingPages\(/g) ?? [];
    const guarded = src.match(/if \(AI_PAGE_LIMITS\)[\s\S]{0,400}bindOnboardingPages\(/g) ?? [];
    expect(binds.length).toBe(guarded.length);
  });

  it('AC10: bulk insert still meters the old daily quota when the flag is off', () => {
    const src = read('app', 'api', 'bulk-import', 'insert', 'route.ts');
    expect(src).toMatch(/reserveQuota\(userId, day, units\)/);
    expect(src).toMatch(/if \(!AI_PAGE_LIMITS\)[\s\S]{0,200}reserveQuota|AI_PAGE_LIMITS \?[\s\S]{0,200}reserveQuota/);
  });
});
