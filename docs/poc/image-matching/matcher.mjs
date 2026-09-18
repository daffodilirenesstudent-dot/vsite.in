// PoC: constrained concept-based dish-name -> image matcher.
// Pipeline: normalise -> phrase concepts -> token concepts (+typo fallback)
//           -> IDF-weighted Jaccard over concept ids -> hard gates -> decide.
// No network, no model, no embeddings at query time.

// ── 1. Noise / portion tokens ────────────────────────────────────────────────
export const STOP = new Set([
  'v5','v5a','v5b','v6','v2','2','with','and','n','of','the','a','an','or','in',
  'special','spl','combo','plate','full','half','quarter','serves','serving',
  'pcs','pc','pieces','piece','ml','250ml','500ml','gm','grams','nos','qty',
  'our','famous','house','chef','signature','style','classic','fresh','hot',
  'new','best','regular','small','medium','large','extra','add','on','per',
]);

// ── 2. Multi-token concepts, matched longest-first ───────────────────────────
export const PHRASES = [
  [['butter','milk'], 'BUTTERMILK'],
  [['cottage','cheese'], 'PANEER'],
  [['ladies','finger'], 'OKRA'],
  [['lady','finger'], 'OKRA'],
  [['ice','cream'], 'ICECREAM'],
  [['french','fries'], 'FRENCHFRY'],
  [['french','fry'], 'FRENCHFRY'],
  [['spring','roll'], 'SPRINGROLL'],
  [['curd','rice'], 'CURDRICE'],
  [['thayir','sadam'], 'CURDRICE'],
  [['thayir','sadham'], 'CURDRICE'],
  [['dahi','rice'], 'CURDRICE'],
  [['curd','sadam'], 'CURDRICE'],
  [['salt','pepper'], 'SALTPEPPER'],
  [['mac','cheese'], 'MACCHEESE'],
  [['peri','peri'], 'PERIPERI'],
  [['sweet','corn'], 'SWEETCORN'],
  [['dry','fruit'], 'DRYFRUIT'],
  [['soft','drink'], 'SOFTDRINK'],
  [['cool','drink'], 'SOFTDRINK'],
  [['mineral','water'], 'WATER'],
];

// ── 3. Unigram surface form -> concept id ────────────────────────────────────
// Only genuine synonyms/translations live here. Misspellings are absorbed by
// the edit-distance fallback, so this table stays small and finite.
const C = {
  // breads
  ROTI:   ['roti','rotti','chapathi','chapati','chapatti','chappati','phulka','fulka'],
  PAROTTA:['parotta','parrota','porotta','barotta','borotta'],
  PARATHA:['paratha','parantha','paratta'],
  NAAN:   ['naan','nan','nann'],
  KULCHA: ['kulcha','kulcha'],
  PURI:   ['puri','poori','puree'],
  // rice & grains
  RICE:   ['rice','sadam','sadham','saadham','anna'],
  BIRYANI:['biryani','biriyani','briyani','biriyaani','biryaani','bryani','dum'],
  PULAO:  ['pulao','pulav','pilaf','palav'],
  // proteins
  CHICKEN:['chicken','chiken','kozhi','murgh','murg','chikken'],
  MUTTON: ['mutton','ghosht','gosht','aatu','lamb','goat'],
  BEEF:   ['beef','maatu'],
  PORK:   ['pork'],
  FISH:   ['fish','meen','fysh'],
  PRAWN:  ['prawn','prawns','eral','shrimp','shrimps'],
  CRAB:   ['crab','nandu'],
  LOBSTER:['lobster'],
  EGG:    ['egg','eggs','muttai','anda'],
  // veg cores
  PANEER: ['paneer','panner','panir','pannir','panneer','paneeer'],
  DAL:    ['dal','daal','dhal','paruppu','lentil','lentils'],
  GOBI:   ['gobi','gobhi','cauliflower'],
  ALOO:   ['aloo','alu','potato','potatoes','urulai'],
  MUSHROOM:['mushroom','mushrooms','kaalan'],
  OKRA:   ['okra','bhindi','vendakkai','vendakai'],
  PALAK:  ['palak','spinach','keerai'],
  SOYA:   ['soya','soy','chaap'],
  CORN:   ['corn','makai'],
  VEG:    ['veg','vegetable','vegetables','vegetarian','veggie','veggies','subzi','sabzi','sabji'],
  // preparations / heads
  // 'fries' is a DISH (potato), 'fry' is a METHOD — conflating them sent
  // "loaded fries" to fried-wings. Keep them as separate concepts.
  FRY:    ['fry','fried','varuval','porial','poriyal'],
  FRENCHFRY:['fries','fryes'],
  CURRY:  ['curry','curri','kari','kuzhambu','gravy','masala','salan'],
  ROAST:  ['roast','roasted'],
  GRILL:  ['grill','grilled','grilling'],
  TANDOORI:['tandoori','tandori','tanduri','tandhoori'],
  TIKKA:  ['tikka','tika','tikkah'],
  KEBAB:  ['kebab','kabab','kabob','seekh','sheek'],
  BBQ:    ['bbq','barbecue','barbeque','charcoal'],
  SOUP:   ['soup','soop','shorba','rasam'],
  NOODLES:['noodles','noodle','chowmein','chow','hakka','atho'],
  MANCHURIAN:['manchurian','manchuria','machurian'],
  MOMOS:  ['momos','momo','dumpling','dumplings'],
  DOSA:   ['dosa','dosai','dose','thosai'],
  IDLI:   ['idli','idly','iddli'],
  VADA:   ['vada','vadai','wada'],
  UTHAPPAM:['uthappam','uttapam','uttappam','oothappam'],
  SAMBAR: ['sambar','sambhar','saambar'],
  SALAD:  ['salad','salaad'],
  SANDWICH:['sandwich','sandwhich','panini'],
  BURGER: ['burger','burgur'],
  WRAP:   ['wrap','roll','frankie','kathi'],
  PIZZA:  ['pizza','pizaa'],
  PASTA:  ['pasta','penne','macaroni'],
  SHAWARMA:['shawarma','shawerma','shaurma'],
  POPCORN:['popcorn','pops','nuggets','nugget','tenders'],
  LOLLIPOP:['lollipop','lollypop','lolly'],
  FINGER: ['finger','fingers','sticks'],
  PLATTER:['platter','basket','thali','combo'],
  // dairy / drinks / sweets
  DAHI:   ['dahi','curd','thayir','yoghurt','yogurt','raita','raitha'],
  BUTTERMILK:['buttermilk','mor','chaas'],
  LASSI:  ['lassi','lasi'],
  MILK:   ['milk','paal'],
  MILKSHAKE:['milkshake','shake','shakes'],
  JUICE:  ['juice','juices',' juce'],
  TEA:    ['tea','chai','chaa'],
  COFFEE: ['coffee','coffe','kaapi','kapi'],
  SODA:   ['soda','sodas'],
  MOCKTAIL:['mocktail','mocktails','moctail'],
  ICECREAM:['icecream','kulfi','falooda'],
  BROWNIE:['brownie','brownies'],
  // modifiers
  BUTTERM:['butter'],
  CHILLI: ['chilli','chilly','chili','chille'],
  GARLIC: ['garlic','poondu'],
  PEPPER: ['pepper','milagu'],
  SCHEZWAN:['schezwan','schewan','shezwan','szechuan','sichuan'],
  MALAI:  ['malai','cream','creamy'],
  MINT:   ['mint','pudina'],
  LEMON:  ['lemon','lime','nimbu','elumichai'],
  ONION:  ['onion','vengayam'],
  TOMATO: ['tomato','thakkali'],
  CHEESE: ['cheese','cheesy'],
  GHEE:   ['ghee','nei'],
  JEERA:  ['jeera','cumin','zeera'],
  KADAI:  ['kadai','karahi','kadhai'],
  CHETTINAD:['chettinad','chettinaad'],
  AFGHANI:['afghani','afghan'],
  ACHARI: ['achari','achaari'],
  SIXTYFIVE:['65'],
};

export const CONCEPT = new Map();
for (const [cid, forms] of Object.entries(C)) {
  for (const f of forms) CONCEPT.set(f.trim(), cid);
}

// ── 4. Semantic roles ────────────────────────────────────────────────────────
export const DIET = {
  CHICKEN:'nv', MUTTON:'nv', BEEF:'nv', PORK:'nv', FISH:'nv', PRAWN:'nv',
  CRAB:'nv', LOBSTER:'nv', SHAWARMA:'nv',
  EGG:'egg',
  PANEER:'v', DAL:'v', GOBI:'v', ALOO:'v', MUSHROOM:'v', OKRA:'v', PALAK:'v',
  SOYA:'v', CORN:'v', VEG:'v', SWEETCORN:'v', CURDRICE:'v',
  // dairy is identity-bearing and vegetarian — "rice curd" must not reach chicken-rice
  DAHI:'v', BUTTERMILK:'v', LASSI:'v',
};
// A "core" is the identity-bearing ingredient. Two different cores = different dish.
export const CORE = new Set(Object.keys(DIET));
// A "head" is the dish form / preparation. Different head = visually different dish.
export const HEAD = new Set([
  'BIRYANI','PULAO','RICE','FRY','CURRY','ROAST','GRILL','TANDOORI','TIKKA',
  'KEBAB','BBQ','SOUP','NOODLES','MANCHURIAN','MOMOS','DOSA','IDLI','VADA',
  'UTHAPPAM','SALAD','SANDWICH','BURGER','WRAP','PIZZA','PASTA','ROTI',
  'PAROTTA','PARATHA','NAAN','PURI','POPCORN','LOLLIPOP','FINGER','PLATTER',
  'MILKSHAKE','JUICE','TEA','COFFEE','SODA','MOCKTAIL','ICECREAM','BROWNIE',
  'LASSI','BUTTERMILK','FRENCHFRY','SPRINGROLL','SHAWARMA','CURDRICE','KULCHA',
]);

// ── 5. Damerau-Levenshtein (typo fallback) ───────────────────────────────────
export function dl(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + c);
    if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1])
      d[i][j] = Math.min(d[i][j], d[i-2][j-2] + 1);
  }
  return d[m][n];
}
const SURFACES = [...CONCEPT.keys()];
function fuzzyConcept(tok) {
  if (tok.length < 4) return null;
  let best = null;
  for (const s of SURFACES) {
    if (Math.abs(s.length - tok.length) > 2) continue;
    const sim = 1 - dl(tok, s) / Math.max(tok.length, s.length);
    if (sim >= 0.82 && (!best || sim > best.sim)) best = { cid: CONCEPT.get(s), sim };
  }
  return best ? best.cid : null;
}

// ── 6. Name -> concept set ───────────────────────────────────────────────────
export function toConcepts(name, { fuzzy = true } = {}) {
  const raw = String(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter(t => t && !STOP.has(t));
  const out = [];
  let i = 0;
  while (i < raw.length) {
    let hit = null;
    for (const [phrase, cid] of PHRASES) {           // longest-first phrase match
      if (phrase.every((p, k) => raw[i + k] === p)) { hit = { cid, len: phrase.length }; break; }
      // order-insensitive for 2-token phrases: "rice curd" == "curd rice"
      if (phrase.length === 2 && raw[i] === phrase[1] && raw[i + 1] === phrase[0]) {
        hit = { cid, len: 2 }; break;
      }
    }
    if (hit) { out.push(hit.cid); i += hit.len; continue; }
    const t = raw[i];
    const direct = CONCEPT.get(t);
    if (direct) out.push(direct);
    else {
      const f = fuzzy ? fuzzyConcept(t) : null;
      out.push(f || ('~' + t));                      // unknown token kept, marked
    }
    i++;
  }
  return [...new Set(out)];
}

const rolesOf = (cs) => ({
  cores: cs.filter(c => CORE.has(c)),
  heads: cs.filter(c => HEAD.has(c)),
  diets: [...new Set(cs.map(c => DIET[c]).filter(Boolean))],
});

// ── 7. Matcher ───────────────────────────────────────────────────────────────
export function buildIndex(libraryNames) {
  const items = libraryNames.map(n => {
    const cs = toConcepts(n);
    return { name: n, cs, set: new Set(cs), ...rolesOf(cs) };
  });
  const dfc = new Map();
  for (const it of items) for (const c of it.set) dfc.set(c, (dfc.get(c) || 0) + 1);
  const N = items.length;
  // Unknown tokens ("~foo") are unverifiable, so they must not dominate the
  // denominator — a rare real concept deserves weight, an unrecognised adjective
  // does not. Gate 4 already stops an unknown token from yielding a confident
  // specific match, so a low weight here costs no safety and recovers recall on
  // noisy names like "veg atho with bejo masala [serves 1]".
  const UNKNOWN_W = 1.0;
  const idf = (c) => c.startsWith('~') ? UNKNOWN_W : Math.log(N / (dfc.get(c) || 0.5)) + 0.5;
  for (const it of items) it.w = it.cs.reduce((s, c) => s + idf(c), 0);
  return { items, idf, N };
}

export const ACCEPT = 0.55, GENERIC = 0.30, MARGIN = 0.05;

export function match(query, index, opts = {}) {
  const { accept = ACCEPT, generic = GENERIC, margin = MARGIN } = opts;
  const qcs = toConcepts(query);
  if (!qcs.length) return { decision: 'abstain', reason: 'empty' };
  const q = { cs: qcs, set: new Set(qcs), ...rolesOf(qcs) };
  const qw = qcs.reduce((s, c) => s + index.idf(c), 0);

  const survivors = [];
  for (const it of index.items) {
    // ── GATE 1: diet. A veg query may never receive a non-veg image.
    if (q.diets.includes('v') && !q.diets.includes('nv') && it.diets.includes('nv'))
      continue;
    // ── GATE 2: core ingredient. Different identity-bearing ingredient = reject.
    if (q.cores.length && it.cores.length &&
        !q.cores.some(c => it.cores.includes(c))) continue;
    // ── GATE 3: head/preparation. Different dish form = reject.
    if (q.heads.length && it.heads.length &&
        !q.heads.some(h => it.heads.includes(h))) continue;
    // ── GATE 4: never invent a protein. If the query names no core ingredient,
    // a candidate that has one is a guess: "lemon" must not become
    // lemony-*chicken*, "butter scotch" must not become butter-*chicken*, and a
    // bare "loaded fries" must not become the fried-*chicken* version.
    if (!q.cores.length && it.cores.length) continue;

    let shared = 0;
    for (const c of q.set) if (it.set.has(c)) shared += index.idf(c);
    if (shared <= 0) continue;
    survivors.push({ name: it.name, score: shared / (qw + it.w - shared), it });
  }
  if (!survivors.length) return { decision: 'abstain', reason: 'no candidate', concepts: qcs };

  survivors.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const [top, second] = survivors;
  const gap = second ? top.score - second.score : 1;

  if (top.score >= accept && (gap >= margin || top.it.set.size === q.set.size))
    return { decision: 'specific', image: top.name, score: top.score, gap, concepts: qcs };

  // ── GATE 5: the generic band may not cross a dish-form boundary.
  // A shared CORE alone is not enough to show a picture: "mutton" tells you
  // nothing about what the plate looks like, so "mutton sukka" must not be
  // served a mutton *biryani*. A generic answer needs either a shared HEAD,
  // or a candidate with no head of its own, or a bare single-core query
  // ("paruppu" -> any dal dish is a fair generic).
  if (top.score >= generic) {
    const headOverlap = q.heads.some(h => top.it.heads.includes(h));
    const candHeadless = top.it.heads.length === 0;
    const bareCore = q.cs.length === 1 && CORE.has(q.cs[0]);
    if (headOverlap || candHeadless || bareCore)
      return { decision: 'generic', image: top.name, score: top.score, gap, concepts: qcs };
    return { decision: 'abstain', reason: 'head mismatch', score: top.score, near: top.name, concepts: qcs };
  }
  return { decision: 'abstain', reason: 'below threshold', score: top.score, near: top.name, concepts: qcs };
}
