// Held-out validation: run the PoC over all real production menu names.
// No hand labels — measures decision mix and the objective safety invariant
// (a vegetarian item must never receive a non-vegetarian image).
import fs from 'fs';
import { buildIndex, match, toConcepts, DIET } from './matcher.mjs';

const ENV = 'C:/Users/LENOVO/Desktop/buildyoustore - 2/apps/web/.env.local';
const env = Object.fromEntries(fs.readFileSync(ENV, 'utf8').split('\n')
  .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]));
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const K = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function page(table, select, offset) {
  const r = await fetch(`${U}/rest/v1/${table}?select=${select}&limit=1000&offset=${offset}`,
    { headers: { apikey: K, Authorization: `Bearer ${K}` } });
  if (!r.ok) throw new Error(`${table} ${r.status}`);
  return r.json();
}

const lib = JSON.parse(fs.readFileSync('lib-cache.json', 'utf8'));
const index = buildIndex(lib);

let prods = [];
for (let o = 0; ; o += 1000) {
  const p = await page('products', 'name,image_url', o);
  prods = prods.concat(p);
  if (p.length < 1000) break;
}
const seen = new Set(); const rows = [];
for (const p of prods) {
  const n = (p.name || '').trim().toLowerCase();
  if (!n || seen.has(n)) continue;
  seen.add(n);
  rows.push({ name: n, live: (p.image_url || '').includes('default-images')
    ? p.image_url.split('/').pop().replace(/\.(jpeg|jpg|png|webp)$/i, '') : null });
}
console.log(`held-out: ${rows.length} distinct production menu names\n`);

const dietOf = (s) => {
  const cs = toConcepts(s);
  const d = new Set(cs.map(c => DIET[c]).filter(Boolean));
  if (d.has('nv')) return 'nv';
  if (d.has('v')) return 'v';
  return d.has('egg') ? 'egg' : null;
};

const tally = { specific: 0, generic: 0, abstain: 0 };
let pocViol = 0, liveViol = 0, liveMatched = 0;
const pocBad = [], liveBad = [];

for (const r of rows) {
  const m = match(r.name, index);
  tally[m.decision]++;
  const qd = dietOf(r.name);
  if (qd === 'v') {
    if (m.decision !== 'abstain' && dietOf(m.image) === 'nv') { pocViol++; pocBad.push(`${r.name} -> ${m.image}`); }
    if (r.live && dietOf(r.live) === 'nv') { liveViol++; liveBad.push(`${r.name} -> ${r.live}`); }
  }
  if (r.live) liveMatched++;
}

const pct = (x) => (100 * x / rows.length).toFixed(1) + '%';
console.log('PoC decision mix');
console.log(`  specific : ${tally.specific}  (${pct(tally.specific)})`);
console.log(`  generic  : ${tally.generic}  (${pct(tally.generic)})`);
console.log(`  abstain  : ${tally.abstain}  (${pct(tally.abstain)})`);
console.log(`  coverage : ${pct(tally.specific + tally.generic)}\n`);

console.log('SAFETY — vegetarian item shown a non-vegetarian image');
console.log(`  live system : ${liveViol}`);
console.log(`  PoC         : ${pocViol}`);
if (pocBad.length) { console.log('\n  PoC violations:'); pocBad.forEach(b => console.log('   ', b)); }
console.log('\n  live examples:'); liveBad.slice(0, 12).forEach(b => console.log('   ', b));
