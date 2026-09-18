/**
 * Before/after benchmark for the concept-based image matcher.
 *
 * BEFORE = products.image_url as the live embedding matcher actually assigned it.
 * AFTER  = what src/lib/menu/conceptMatcher produces for the same item name.
 *
 * Reports wins AND regressions. Read-only: touches nothing in the database.
 *
 * Run:  npx vite-node scripts/benchmark-image-matching.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  buildImageIndex, matchImage, dishConcepts, isNonVegImage,
} from '../src/lib/menu/conceptMatcher';
import { DIET, CORE, HEAD } from '../src/lib/menu/conceptVocabulary';

const ENV = path.join(process.cwd(), '.env.local');
const env = Object.fromEntries(
  fs.readFileSync(ENV, 'utf8').split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
) as Record<string, string>;

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const nameOf = (u: string) => (u.split('/').pop() ?? '').replace(/\.(jpeg|jpg|png|webp)$/i, '');

async function pageAll<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=${select}&limit=1000&offset=${offset}`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

const vegImage = (n: string, m: Map<string, string|null>) => m.get(n) === 'v';
const isVegQuery = (s: string) => {
  const cs = dishConcepts(s);
  return cs.some((c) => DIET[c] === 'v') && !cs.some((c) => DIET[c] === 'nv');
};

async function main() {
  const lib = await pageAll<{ image_url: string; diet: 'v' | 'nv' | 'egg' | null }>('default_images', 'image_url,diet');
  const seenLib = new Set<string>();
  const libEntries = lib.flatMap((r) => {
    const n = nameOf(r.image_url);
    if (!n || seenLib.has(n)) return [];
    seenLib.add(n);
    return [{ name: n, diet: r.diet }];
  });
  const libNames = libEntries.map((e) => e.name);
  const index = buildImageIndex(libEntries);
  const dietMap = new Map(libEntries.map((e) => [e.name, e.diet]));

  const prods = await pageAll<{ name: string; image_url: string | null }>('products', 'name,image_url');
  const seen = new Set<string>();
  const rows = prods.flatMap((p) => {
    const n = (p.name ?? '').trim().toLowerCase();
    if (!n || seen.has(n)) return [];
    seen.add(n);
    const before = p.image_url?.includes('default-images') ? nameOf(p.image_url) : null;
    return [{ name: n, before }];
  });

  // ── latency ───────────────────────────────────────────────────────────────
  for (let i = 0; i < 500; i++) matchImage(rows[i % rows.length].name, index);
  const t0 = performance.now();
  for (const r of rows) matchImage(r.name, index);
  const perMatch = (performance.now() - t0) / rows.length;

  let vBefore = 0, vAfter = 0;
  let covBefore = 0, covAfter = 0;
  let same = 0, changed = 0, gained = 0, lost = 0, lostPlausible = 0, lostJunk = 0;
  const lostRows: string[] = [];
  const fixedDiet: string[] = [];
  const changedRows: string[] = [];

  for (const r of rows) {
    const m = matchImage(r.name, index);
    const after = m.decision === 'abstain' ? null : m.image;
    if (r.before) covBefore++;
    if (after) covAfter++;

    const veg = isVegQuery(r.name);
    if (veg && r.before && (dietMap.get(r.before) ?? (isNonVegImage(r.before) ? 'nv' : 'v')) === 'nv') {
      vBefore++;
      if (!after || dietMap.get(after) !== 'nv') fixedDiet.push(`${r.name}: ${r.before} -> ${after ?? '(upload box)'}`);
    }
    if (veg && after && dietMap.get(after) === 'nv') vAfter++;

    if (r.before === after) same++;
    else {
      changed++;
      if (!r.before && after) gained++;
      if (r.before && !after) {
        lost++;
        // Was the image we dropped actually right? Proxy: it shared the query's
        // identity concepts (core + head). If it shared none, it was already
        // wrong and losing it is a fix, not a regression.
        const qi = dishConcepts(r.name).filter((c) => CORE.has(c) || HEAD.has(c));
        const bi = new Set(dishConcepts(r.before));
        const plausible = qi.length > 0 && qi.every((c) => bi.has(c));
        if (plausible) { lostPlausible++; lostRows.push(`${r.name}  (was ${r.before})  <- was plausible`); }
        else lostJunk++;
      }
      if (r.before && after) changedRows.push(`${r.name}:  ${r.before}  ->  ${after}`);
    }
  }

  const pc = (x: number) => `${((100 * x) / rows.length).toFixed(1)}%`;
  const line = (s = '') => console.log(s);

  line('═══ BEFORE / AFTER — concept image matcher ═══');
  line(`distinct production menu names: ${rows.length}   library: ${libNames.length} images`);
  line();
  line('SAFETY  (vegetarian item shown a non-vegetarian photo)');
  line(`  before : ${vBefore}`);
  line(`  after  : ${vAfter}`);
  line();
  line('COVERAGE  (item receives some library image)');
  line(`  before : ${covBefore}  (${pc(covBefore)})`);
  line(`  after  : ${covAfter}  (${pc(covAfter)})`);
  line();
  line('CHURN');
  line(`  unchanged            : ${same}  (${pc(same)})`);
  line(`  changed image        : ${changedRows.length}`);
  line(`  gained an image      : ${gained}   <- positive`);
  line(`  lost an image        : ${lost}   <- NEGATIVE (now shows upload box)`);
  line(`     …of which the old image was PLAUSIBLE : ${lostPlausible}   <- the true regression`);
  line(`     …of which the old image was ALREADY WRONG : ${lostJunk}   <- silently fixed`);
  line();
  line('PERFORMANCE');
  line(`  before : 1 OpenAI embedding call + 1 pgvector RPC per item (~network bound)`);
  line(`  after  : ${perMatch.toFixed(4)} ms per item, no network`);
  line(`  300-item menu: ${(perMatch * 300).toFixed(1)} ms total`);
  line();
  line(`DIET VIOLATIONS FIXED (${fixedDiet.length}):`);
  fixedDiet.slice(0, 25).forEach((s) => line(`  + ${s}`));
  line();
  line(`ITEMS THAT LOST AN IMAGE — the regression (${lost}), first 20:`);
  lostRows.slice(0, 20).forEach((s) => line(`  - ${s}`));
  line();
  line('SAMPLE OF CHANGED ASSIGNMENTS (first 25):');
  changedRows.slice(0, 25).forEach((s) => line(`  ~ ${s}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
