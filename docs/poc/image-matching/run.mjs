import fs from 'fs';
import path from 'path';
import { buildIndex, match, toConcepts, DIET } from './matcher.mjs';
import { GOLDEN } from './golden.mjs';

// ── fetch library names (public-read table, publishable anon key) ────────────
const ENV = 'C:/Users/LENOVO/Desktop/buildyoustore - 2/apps/web/.env.local';
const env = Object.fromEntries(fs.readFileSync(ENV, 'utf8').split('\n')
  .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const CACHE = path.join(process.cwd(), 'lib-cache.json');
let names;
if (fs.existsSync(CACHE)) names = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
else {
  const res = await fetch(`${URL_}/rest/v1/default_images?select=image_url`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) { console.error('fetch failed', res.status, await res.text()); process.exit(1); }
  names = (await res.json()).map(r =>
    r.image_url.split('/').pop().replace(/\.(jpeg|jpg|png|webp)$/i, ''));
  fs.writeFileSync(CACHE, JSON.stringify(names));
}
console.log(`library: ${names.length} images\n`);

const index = buildIndex(names);
const isNonVeg = (n) => toConcepts(n).some(c => DIET[c] === 'nv');

// ── evaluate ─────────────────────────────────────────────────────────────────
const byL = new Map();
const failures = [];
let pass = 0, unsafe = 0;

for (const [L, q, exp] of GOLDEN) {
  const r = match(q, index);
  const got = r.decision === 'abstain' ? null : r.image;
  let ok = true, why = '';

  if (exp.notNonVeg && got && isNonVeg(got)) { ok = false; why = 'NON-VEG IMAGE'; unsafe++; }
  if (ok && exp.abstain && r.decision === 'specific') { ok = false; why = 'should abstain'; }
  if (ok && exp.not && got && exp.not.includes(got)) { ok = false; why = 'forbidden image'; }
  if (ok && exp.is && got !== exp.is) { ok = false; why = `want ${exp.is}`; }
  if (ok && exp.oneOf && !exp.oneOf.includes(got)) { ok = false; why = `want one of ${exp.oneOf.join('|')}`; }

  if (!byL.has(L)) byL.set(L, { p: 0, n: 0 });
  byL.get(L).n++;
  if (ok) { pass++; byL.get(L).p++; }
  else failures.push({ L, q, got: got ?? `(${r.decision})`, score: r.score?.toFixed(2) ?? '-', why, concepts: r.concepts });
}

console.log(`GOLDEN SET: ${pass}/${GOLDEN.length} = ${(100 * pass / GOLDEN.length).toFixed(1)}%`);
console.log(`unsafe (veg item -> non-veg image): ${unsafe}\n`);
console.log('per loophole:');
for (const [L, v] of [...byL].sort())
  console.log(`  ${L.padEnd(5)} ${String(v.p).padStart(2)}/${String(v.n).padEnd(2)}  ${v.p === v.n ? 'PASS' : 'FAIL'}`);

if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures)
    console.log(`  [${f.L}] "${f.q}"\n        got=${f.got} (${f.score})  ${f.why}\n        concepts=${(f.concepts||[]).join(',')}`);
}
