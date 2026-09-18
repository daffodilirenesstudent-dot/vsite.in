/**
 * Generates the per-image diet labels: tests/fixtures/defaultImageLibraryDiet.json
 * and supabase/migrations/016_default_images_diet.sql seed statements.
 *
 * Name inference is reliable when the filename names a protein. Where it does
 * not, the DESCRIPTION is consulted — but only with negation awareness, because
 * six vegetarian images mention a meat word incidentally ("meat-free",
 * "like butter chicken", "the vegetarian answer to chilli chicken").
 * Anything still ambiguous is listed for human review, and the OVERRIDES table
 * below carries the reviewed answers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dishConcepts } from '../src/lib/menu/conceptMatcher';
import { DIET } from '../src/lib/menu/conceptVocabulary';

const env = Object.fromEntries(
  fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
) as Record<string, string>;

type Diet = 'v' | 'nv' | 'egg';

/** Reviewed by hand. These filenames do not reveal their protein. */
const OVERRIDES: Record<string, Diet> = {
  '65-biryani': 'nv',              // chicken 65 pieces over rice
  'afghani-bbq': 'nv',             // afghani chicken
  'irani-bbq': 'nv',               // irani chicken
  'chilli-garlic-pops': 'nv',      // chicken pops
  'cheese-seekh-kebab': 'nv',      // minced meat
  'mixed-fried-rice': 'nv',        // chicken, egg and prawns
  'tandoori-non-veg-platter': 'nv',
  'chicken-bharra': 'nv',
  'dahi-seekh-kebab': 'nv',
  'mini-tandoori-platter': 'nv',   // "tikka, seekh, wings and more"
  'burger': 'nv',                  // plain patty; the veg burgers are named veg-*
  'irani-bbq-v2': 'nv',
  // Explicitly vegetarian despite a meat word in the description.
  'veg-biryani-v5': 'v',
  'paneer-butter-masala-v5': 'v',
  'veggie-finger': 'v',
  'plain-biryani': 'v',
  'parotta': 'v',
  'chilli-paneer-dry-v5': 'v',
  'veg-seekh-kebab': 'v',
  'hara-bhara-kebab': 'v',
  'malai-soya-chaap': 'v',
  'pudina-soya-chaap': 'v',
  'corn-malai-kebab': 'v',
  // naan's description offers keema as an optional stuffing; the bread is veg.
  'naan': 'v',
  'butter-naan': 'v',
  'garlic-butter-naan': 'v',
  'cheese-garlic-naan': 'v',
  'cheese-naan': 'v',
  'butter-naan-v5': 'v',
};

const NV = ['chicken', 'mutton', 'fish', 'prawn', 'crab', 'lobster', 'beef', 'pork',
  'lamb', 'goat', 'shrimp', 'meat', 'keema', 'murgh'];
/** Contexts where a meat word does NOT mean the dish contains meat. */
const NEGATED = [
  /\b(like|as|than|versus|vs)\s+\w{0,12}\s?(butter\s+)?(chicken|fish|mutton|meat)/i,
  /\b(meat|chicken|fish)[- ]free\b/i,
  /\bwithout\s+(meat|chicken|fish)/i,
  /\bvegetarian\s+(answer|version|alternative)\b/i,
  /\bpairs?\s+(perfectly\s+)?with\s+[^.]*\b(chicken|mutton|fish)/i,
  /\bserved?\s+with\s+[^.]*\b(chicken|mutton|fish)\s+curry/i,
  /\bno\s+(meat|chicken)\b/i,
];

function fromDescription(d: string): Diet | null {
  const text = d.toLowerCase();
  let hay = text;
  for (const re of NEGATED) hay = hay.replace(re, ' ');
  if (NV.some((t) => hay.includes(t))) return 'nv';
  if (/\begg/.test(hay)) return 'egg';
  return null;
}

async function main() {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/default_images?select=image_url,description&limit=1000`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } });
  const rows = (await res.json()) as Array<{ image_url: string; description: string | null }>;

  const out: Array<{ name: string; diet: Diet }> = [];
  const review: string[] = [];
  const defaults: string[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    const name = (r.image_url.split('/').pop() ?? '').replace(/\.(jpeg|jpg|png|webp)$/i, '');
    if (!name || seen.has(name)) continue;
    seen.add(name);

    let diet: Diet | null = OVERRIDES[name] ?? null;
    let source = 'override';

    if (!diet) {
      const cs = dishConcepts(name);
      const d = new Set(cs.map((c) => DIET[c]).filter(Boolean) as Diet[]);
      if (d.has('nv')) { diet = 'nv'; source = 'name'; }
      else if (d.has('v')) { diet = 'v'; source = 'name'; }
      else if (d.has('egg')) { diet = 'egg'; source = 'name'; }
    }
    if (!diet) {
      const fromDesc = fromDescription(r.description ?? '');
      if (fromDesc) { diet = fromDesc; source = 'description'; review.push(`${name.padEnd(30)} -> ${fromDesc}  "${(r.description ?? '').slice(0, 64).replace(/\n/g, ' ')}"`); }
    }
    if (!diet) { diet = 'v'; source = 'default-veg'; }

    out.push({ name, diet });
    if (source === 'default-veg') defaults.push(name);
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync('tests/fixtures/defaultImageLibraryDiet.json', JSON.stringify(out));

  const counts = out.reduce<Record<string, number>>((a, r) => { a[r.diet] = (a[r.diet] ?? 0) + 1; return a; }, {});
  console.log('labels:', counts, 'total', out.length);
  console.log(`\nassigned from DESCRIPTION (${review.length}) — these are the ones worth eyeballing:`);
  review.forEach((r) => console.log('  ' + r));

  const sql = out.map((r) => `  ('${r.name}','${r.diet}')`).join(',\n');
  fs.writeFileSync(path.join('supabase', 'migrations', '016_default_images_diet.sql'),
`-- Adds and seeds public.default_images.diet.
-- Generated by scripts/seed-image-diet.ts — regenerate rather than hand-editing.
--
-- Why this column exists: the matcher previously inferred "is this photo
-- non-vegetarian?" from the image FILENAME. That is lossy — irani-bbq is
-- chicken and its name never says so — and it made the safety guarantee
-- circular, because the test inferred diet the same way the matcher did.

ALTER TABLE public.default_images
  ADD COLUMN IF NOT EXISTS diet text
  CONSTRAINT default_images_diet_chk CHECK (diet IN ('v','nv','egg'));

-- Name inference where the filename names a protein; description with negation
-- handling otherwise; hand-reviewed OVERRIDES for the opaque cases.
UPDATE public.default_images d SET diet = s.diet
FROM (VALUES
${sql}
) AS s(name, diet)
WHERE regexp_replace(split_part(d.image_url,'/',-1),'[.](jpeg|jpg|png|webp)$','') = s.name;
`);
  console.log('\nwrote tests/fixtures/defaultImageLibraryDiet.json and supabase/migrations/016_default_images_diet_seed.sql');
}
main().catch((e) => { console.error(e); process.exit(1); });
