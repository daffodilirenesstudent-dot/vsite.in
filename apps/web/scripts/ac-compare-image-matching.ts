/**
 * Runs the SAME acceptance criteria against BOTH matchers.
 *
 * This is the apples-to-apples comparison: identical inputs, identical
 * expectations, one old pipeline (keyword tiers + text-embedding-3-small +
 * pgvector RPC + gpt-4o-mini rerank) and one new pipeline (concept matcher).
 *
 * Run: npx vite-node -c vitest.config.ts scripts/ac-compare-image-matching.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { matchByKeyword } from '../src/lib/menu/defaultImages';
import { buildImageIndex, matchImage, isNonVegImage } from '../src/lib/menu/conceptMatcher';

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
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return r.json() as Promise<T>;
}
interface RpcHit { image_url: string; description: string; similarity: number }

async function oldMatch(query: string): Promise<string | null> {
  const safe = query.slice(0, 500).toLowerCase();
  const kw = matchByKeyword(safe);
  if (kw && (kw.confidence ?? 1) >= 0.75) return nameOf(kw.image_url);
  let vector: number[];
  try {
    vector = (await openai.embeddings.create({ model: 'text-embedding-3-small', input: safe })).data[0].embedding;
  } catch { return kw ? nameOf(kw.image_url) : null; }
  let data: RpcHit[] = [];
  try {
    data = await rest<RpcHit[]>('rpc/match_default_image', {
      method: 'POST', body: JSON.stringify({ query_embedding: vector, match_threshold: 0.35, match_count: 5 }),
    });
  } catch { return kw ? nameOf(kw.image_url) : null; }
  if (!data.length) return kw ? nameOf(kw.image_url) : null;
  const [top, second] = data;
  let chosen = top;
  if (top.similarity < 0.65 && second && top.similarity - second.similarity < 0.10) {
    try {
      const r = await openai.chat.completions.create({
        model: 'gpt-4o-mini', temperature: 0, max_tokens: 5,
        messages: [{ role: 'user', content: `User typed: "${query}"\n\nWhich of these dishes is the best match?\n`
          + data.map((d, i) => `${i}: ${d.description.split('\n')[0]}`).join('\n')
          + `\n\nReply with just the index number (0-${data.length - 1}). If none match well, reply "none".` }],
      });
      const reply = r.choices[0]?.message?.content?.trim() ?? '';
      const idx = parseInt(reply, 10);
      if (Number.isFinite(idx) && idx >= 0 && idx < data.length) chosen = data[idx];
      else if (reply.toLowerCase().startsWith('none')) return kw ? nameOf(kw.image_url) : null;
    } catch { /* keep top */ }
  }
  return nameOf(chosen.image_url);
}

type Exp =
  | { kind: 'is'; v: string } | { kind: 'oneOf'; v: string[] }
  | { kind: 'not'; v: RegExp } | { kind: 'abstain' } | { kind: 'veg' };

const C: Array<[string, string, Exp]> = [
  // AC1 safety
  ...(['dal fry', 'daal fry', 'dal tadka', 'veg fried rice', 'veg schezwan noodles',
    'veg. noodles', 'tomato soup', 'sweet corn soup', 'mushroom tikka', 'tandoori gobi',
    'kadai veg', 'paneer malai tikka', 'coconut uthappam', 'ladies finger fry',
    'cottage cheese tikka', 'veg soup', 'veg. chowmein', 'paneer butter masala',
  ].map((q) => ['AC1 safety', q, { kind: 'veg' }] as [string, string, Exp])),
  // AC2 the reported bug
  ['AC2 dal fry', 'dal fry', { kind: 'is', v: 'dal-fry-v5' }],
  ['AC2 dal fry', 'daal fry', { kind: 'is', v: 'dal-fry-v5' }],
  // AC3 core integrity
  ['AC3 core', 'mutton biryani', { kind: 'not', v: /chicken|prawn|egg|veg|fish/ }],
  ['AC3 core', 'chicken biryani', { kind: 'oneOf', v: ['chicken-biryani-v5'] }],
  ['AC3 core', 'prawn biryani', { kind: 'oneOf', v: ['prawn-biryani', 'prawn-biriyani'] }],
  ['AC3 core', 'egg biryani', { kind: 'oneOf', v: ['egg-biryani', 'egg-biriyani'] }],
  ['AC3 core', 'veg biryani', { kind: 'oneOf', v: ['veg-biryani-v5'] }],
  ['AC3 core', 'paneer 65', { kind: 'not', v: /chicken/ }],
  ['AC3 core', 'fish fry', { kind: 'is', v: 'fish-fry' }],
  ['AC3 core', 'prawn fry', { kind: 'is', v: 'prawn-fry' }],
  // AC4 many names -> one image
  ...(['roti', 'chapati', 'chapathi', 'phulka', 'rotti'].map((q) =>
    ['AC4 synonyms', q, { kind: 'is', v: 'roti-chapathi' }] as [string, string, Exp])),
  ...(['curd rice', 'thayir sadam', 'dahi rice'].map((q) =>
    ['AC4 synonyms', q, { kind: 'is', v: 'curd-rice' }] as [string, string, Exp])),
  ['AC4 synonyms', 'meen varuval', { kind: 'is', v: 'fish-fry' }],
  ['AC4 synonyms', 'kozhi biryani', { kind: 'is', v: 'chicken-biryani-v5' }],
  ['AC4 synonyms', 'murgh biryani', { kind: 'is', v: 'chicken-biryani-v5' }],
  // AC5 partial anchor
  ...(['mutton sukka', 'chicken bhuna', 'chicken xacuti', 'mutton garlic', 'paneer bhurji'].map((q) =>
    ['AC5 partial', q, { kind: 'not', v: /biryani|biriyani|pulao|fried-rice/ }] as [string, string, Exp])),
  ['AC5 partial', 'lemon', { kind: 'not', v: /chicken|mutton|fish|prawn|beef/ }],
  ['AC5 partial', 'butter scotch', { kind: 'not', v: /chicken|mutton|fish|prawn|beef/ }],
  // AC6 abstain
  ...(['kulcha', 'puttu', 'vellayappam', 'sirloin steak', 'ragi koozh',
    'testing', 'food name', 'meal 1', 'extra chicken piece'].map((q) =>
    ['AC6 abstain', q, { kind: 'abstain' }] as [string, string, Exp])),
  // AC7 typos
  ['AC7 typo', 'chiken biriyani', { kind: 'is', v: 'chicken-biryani-v5' }],
  ['AC7 typo', 'mtton biriyani', { kind: 'not', v: /chicken|veg|egg|fish/ }],
  ['AC7 typo', 'parrota', { kind: 'is', v: 'parotta' }],
  ['AC7 typo', 'panner tikka', { kind: 'veg' }],
  // AC10 noise
  ...(['special chicken biryani full', 'chicken biryani (serves 2)',
    'our famous chicken biryani [8 pcs]'].map((q) =>
    ['AC10 noise', q, { kind: 'oneOf', v: ['chicken-biryani-v5'] }] as [string, string, Exp])),
];

function judge(got: string | null, e: Exp): boolean {
  switch (e.kind) {
    case 'abstain': return got === null;
    case 'veg': return got === null || !isNonVegImage(got);
    case 'is': return got === e.v;
    case 'oneOf': return got !== null && e.v.includes(got);
    case 'not': return got === null || !e.v.test(got);
  }
}

async function main() {
  const lib = await rest<Array<{ image_url: string }>>('default_images?select=image_url&limit=1000');
  const index = buildImageIndex([...new Set(lib.map((r) => nameOf(r.image_url)))]);

  const rows: Array<{ ac: string; q: string; old: string | null; neo: string | null; oldOk: boolean; newOk: boolean }> = [];
  for (const [ac, q, e] of C) {
    const old = await oldMatch(q);
    const m = matchImage(q, index);
    const neo = m.decision === 'abstain' ? null : m.image;
    rows.push({ ac, q, old, neo, oldOk: judge(old, e), newOk: judge(neo, e) });
  }

  const byAc = new Map<string, { o: number; n: number; t: number }>();
  for (const r of rows) {
    const b = byAc.get(r.ac) ?? { o: 0, n: 0, t: 0 };
    b.t++; if (r.oldOk) b.o++; if (r.newOk) b.n++;
    byAc.set(r.ac, b);
  }
  const oldPass = rows.filter((r) => r.oldOk).length;
  const newPass = rows.filter((r) => r.newOk).length;

  console.log(`\n══ SAME ACCEPTANCE CRITERIA, BOTH MATCHERS (${rows.length} cases) ══\n`);
  console.log('criterion            OLD      NEW');
  for (const [ac, b] of [...byAc].sort()) {
    console.log(`  ${ac.padEnd(18)} ${String(b.o).padStart(2)}/${b.t}    ${String(b.n).padStart(2)}/${b.t}`);
  }
  console.log(`\n  TOTAL              ${oldPass}/${rows.length} (${(100 * oldPass / rows.length).toFixed(0)}%)`
    + `   ${newPass}/${rows.length} (${(100 * newPass / rows.length).toFixed(0)}%)`);

  console.log('\n── cases the OLD matcher fails and the NEW one passes ──');
  rows.filter((r) => !r.oldOk && r.newOk).forEach((r) =>
    console.log(`  [${r.ac}] "${r.q}"\n        OLD -> ${r.old ?? '(none)'}      NEW -> ${r.neo ?? '(abstain)'}`));

  const regress = rows.filter((r) => r.oldOk && !r.newOk);
  console.log(`\n── cases the NEW matcher fails and the OLD one passes (${regress.length}) ──`);
  regress.forEach((r) =>
    console.log(`  [${r.ac}] "${r.q}"\n        OLD -> ${r.old ?? '(none)'}      NEW -> ${r.neo ?? '(abstain)'}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
