/**
 * Head-to-head: the EXISTING matcher vs the NEW matcher, both run live, now,
 * on identical inputs.
 *
 * OLD replicates /api/images/match exactly as it stood before this branch:
 *   1. matchByKeyword(), accepted at confidence >= 0.75
 *   2. otherwise text-embedding-3-small on the query
 *   3. match_default_image RPC, threshold 0.35, top 5
 *   4. gpt-4o-mini rerank when top < 0.65 and the gap to #2 is < 0.10
 *   5. fall back to the low-confidence keyword hit, else null
 *
 * NEW is src/lib/menu/conceptMatcher via the shipped code path.
 *
 * Read-only. Makes real OpenAI calls (a few thousand embedding tokens).
 * Run: npx vite-node -c vitest.config.ts scripts/head-to-head-image-matching.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { matchByKeyword } from '../src/lib/menu/defaultImages';
import { buildImageIndex, matchImage, dishConcepts, isNonVegImage } from '../src/lib/menu/conceptMatcher';
import { DIET } from '../src/lib/menu/conceptVocabulary';

const env = Object.fromEntries(
  fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
) as Record<string, string>;

const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const nameOf = (u: string) => (u.split('/').pop() ?? '').replace(/\.(jpeg|jpg|png|webp)$/i, '');

async function rest<T>(p: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${SB}/rest/v1/${p}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

interface RpcHit { image_url: string; description: string; similarity: number }

/** The existing pipeline, faithfully. */
async function oldMatch(query: string): Promise<string | null> {
  const safe = query.slice(0, 500).toLowerCase();
  const kw = matchByKeyword(safe);
  if (kw && (kw.confidence ?? 1) >= 0.75) return nameOf(kw.image_url);

  let vector: number[];
  try {
    const e = await openai.embeddings.create({ model: 'text-embedding-3-small', input: safe });
    vector = e.data[0].embedding;
  } catch {
    return kw ? nameOf(kw.image_url) : null;
  }

  let data: RpcHit[] = [];
  try {
    data = await rest<RpcHit[]>('rpc/match_default_image', {
      method: 'POST',
      body: JSON.stringify({ query_embedding: vector, match_threshold: 0.35, match_count: 5 }),
    });
  } catch {
    return kw ? nameOf(kw.image_url) : null;
  }
  if (!data.length) return kw ? nameOf(kw.image_url) : null;

  const [top, runnerUp] = data;
  let chosen = top;
  if (top.similarity < 0.65 && runnerUp && top.similarity - runnerUp.similarity < 0.10) {
    try {
      const prompt = `User typed: "${query}"\n\nWhich of these dishes is the best match?\n`
        + data.map((d, i) => `${i}: ${d.description.split('\n')[0]}`).join('\n')
        + `\n\nReply with just the index number (0-${data.length - 1}). If none match well, reply "none".`;
      const r = await openai.chat.completions.create({
        model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 5,
      });
      const reply = r.choices[0]?.message?.content?.trim() ?? '';
      const idx = parseInt(reply, 10);
      if (Number.isFinite(idx) && idx >= 0 && idx < data.length) chosen = data[idx];
      else if (reply.toLowerCase().startsWith('none')) return kw ? nameOf(kw.image_url) : null;
    } catch { /* keep top */ }
  }
  return nameOf(chosen.image_url);
}

const isVeg = (s: string) => {
  const cs = dishConcepts(s);
  return cs.some((c) => DIET[c] === 'v') && !cs.some((c) => DIET[c] === 'nv');
};

async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < xs.length) { const k = i++; out[k] = await f(xs[k]); }
  }));
  return out;
}

async function main() {
  const lib = await rest<Array<{ image_url: string }>>('default_images?select=image_url&limit=1000');
  const index = buildImageIndex([...new Set(lib.map((r) => nameOf(r.image_url)))]);

  const limit = Number(process.env.N ?? 400);
  const prods = await rest<Array<{ name: string }>>('products?select=name&limit=1000');
  const more = await rest<Array<{ name: string }>>('products?select=name&limit=1000&offset=1000');
  const names = [...new Set([...prods, ...more].map((p) => (p.name ?? '').trim().toLowerCase()).filter(Boolean))]
    .slice(0, limit);

  console.log(`head-to-head on ${names.length} distinct production item names\n`);

  const tOld = Date.now();
  const oldRes = await pool(names, 8, oldMatch);
  const oldMs = Date.now() - tOld;

  const tNew = Date.now();
  const newRes = names.map((n) => { const m = matchImage(n, index); return m.decision === 'abstain' ? null : m.image; });
  const newMs = Date.now() - tNew;

  let oldViol = 0, newViol = 0, oldCov = 0, newCov = 0, agree = 0;
  const oldOnlyViol: string[] = [];
  const bothWrongFixed: string[] = [];

  names.forEach((n, i) => {
    const o = oldRes[i]; const w = newRes[i];
    if (o) oldCov++; if (w) newCov++;
    if (o === w) agree++;
    if (isVeg(n)) {
      if (o && isNonVegImage(o)) { oldViol++; oldOnlyViol.push(`${n}\n        OLD -> ${o}   NEW -> ${w ?? '(abstain)'}`); }
      if (w && isNonVegImage(w)) newViol++;
    }
    if (o && w && o !== w) bothWrongFixed.push(`${n}\n        OLD -> ${o}\n        NEW -> ${w}`);
  });

  const pc = (x: number) => `${((100 * x) / names.length).toFixed(1)}%`;
  console.log('════ RESULTS ════');
  console.log(`veg item shown NON-VEG image   OLD ${oldViol}   NEW ${newViol}`);
  console.log(`coverage                        OLD ${oldCov} (${pc(oldCov)})   NEW ${newCov} (${pc(newCov)})`);
  console.log(`identical answer                ${agree} (${pc(agree)})`);
  console.log(`\nlatency  OLD ${oldMs} ms total (${(oldMs / names.length).toFixed(1)} ms/item, 8-way parallel, network)`);
  console.log(`         NEW ${newMs} ms total (${(newMs / names.length).toFixed(3)} ms/item, serial, no network)`);
  console.log(`         speedup ~${Math.round(oldMs / Math.max(newMs, 1))}x\n`);
  console.log(`── DIET VIOLATIONS THE OLD MATCHER PRODUCES LIVE (${oldViol}) ──`);
  oldOnlyViol.slice(0, 20).forEach((s) => console.log(`  ! ${s}`));
  console.log(`\n── SAMPLE DISAGREEMENTS (${bothWrongFixed.length} total, first 20) ──`);
  bothWrongFixed.slice(0, 20).forEach((s) => console.log(`  ~ ${s}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
