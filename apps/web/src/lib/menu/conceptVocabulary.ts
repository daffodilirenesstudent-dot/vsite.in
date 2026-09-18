// Controlled vocabulary for dish-name matching.
//
// This file is DATA, not logic. Adding a dish name, a regional synonym or a
// noise word is a one-line edit here and needs no change to conceptMatcher.ts.
//
// Scope is bounded and measured: the entire production menu vocabulary across
// 1,067 distinct item names is 623 tokens, of which 148 cover 74% of all usage
// (see docs/image-matching-rnd.md §2.1). Misspellings do NOT belong here —
// the Damerau-Levenshtein fallback in conceptMatcher absorbs those, which is
// what keeps this table finite.

/** Portion, marketing and packaging words that carry no dish identity. */
export const STOP: ReadonlySet<string> = new Set([
  'v5', 'v5a', 'v5b', 'v6', 'v2', '2', 'with', 'and', 'n', 'of', 'the', 'a',
  'an', 'or', 'in', 'special', 'spl', 'combo', 'plate', 'full', 'half',
  'quarter', 'serves', 'serving', 'pcs', 'pc', 'pieces', 'piece', 'ml',
  '250ml', '500ml', 'gm', 'grams', 'nos', 'qty', 'our', 'famous', 'house',
  'chef', 'signature', 'style', 'classic', 'fresh', 'hot', 'new', 'best',
  'regular', 'small', 'medium', 'large', 'extra', 'add', 'on', 'per',
]);

/**
 * Multi-token concepts, matched longest-first and before unigrams.
 * Needed because "butter milk" is one dish while "butter" + "milk" are two
 * unrelated modifiers — without this, `mor` could never reach butter-milk.jpeg.
 */
export const PHRASES: ReadonlyArray<readonly [readonly string[], string]> = [
  [['butter', 'milk'], 'BUTTERMILK'],
  [['cottage', 'cheese'], 'PANEER'],
  [['ladies', 'finger'], 'OKRA'],
  [['lady', 'finger'], 'OKRA'],
  [['ice', 'cream'], 'ICECREAM'],
  [['french', 'fries'], 'FRENCHFRY'],
  [['french', 'fry'], 'FRENCHFRY'],
  [['spring', 'roll'], 'SPRINGROLL'],
  [['curd', 'rice'], 'CURDRICE'],
  [['thayir', 'sadam'], 'CURDRICE'],
  [['thayir', 'sadham'], 'CURDRICE'],
  [['dahi', 'rice'], 'CURDRICE'],
  [['curd', 'sadam'], 'CURDRICE'],
  [['salt', 'pepper'], 'SALTPEPPER'],
  [['mac', 'cheese'], 'MACCHEESE'],
  [['peri', 'peri'], 'PERIPERI'],
  [['sweet', 'corn'], 'SWEETCORN'],
  [['dry', 'fruit'], 'DRYFRUIT'],
  [['soft', 'drink'], 'SOFTDRINK'],
  [['soft', 'drinks'], 'SOFTDRINK'],
  [['cool', 'drink'], 'SOFTDRINK'],
  [['cool', 'drinks'], 'SOFTDRINK'],
  [['mineral', 'water'], 'WATER'],
];

/** concept id → the surface forms that mean it (English, Tamil, Hindi, regional). */
const FORMS: Readonly<Record<string, readonly string[]>> = {
  // ── breads ────────────────────────────────────────────────────────────────
  ROTI: ['roti', 'rotti', 'chapathi', 'chapati', 'chapatti', 'chappati', 'phulka', 'fulka'],
  PAROTTA: ['parotta', 'parrota', 'porotta', 'barotta', 'borotta'],
  PARATHA: ['paratha', 'parantha', 'paratta'],
  NAAN: ['naan', 'nan', 'nann'],
  KULCHA: ['kulcha'],
  PURI: ['puri', 'poori', 'puree'],
  // ── rice & grains ─────────────────────────────────────────────────────────
  RICE: ['rice', 'sadam', 'sadham', 'saadham', 'anna'],
  BIRYANI: ['biryani', 'biriyani', 'briyani', 'biriyaani', 'biryaani', 'bryani', 'dum'],
  PULAO: ['pulao', 'pulav', 'pilaf', 'palav'],
  // ── non-vegetarian cores ──────────────────────────────────────────────────
  CHICKEN: ['chicken', 'chiken', 'kozhi', 'murgh', 'murg', 'chikken'],
  MUTTON: ['mutton', 'ghosht', 'gosht', 'aatu', 'lamb', 'goat'],
  BEEF: ['beef', 'maatu'],
  PORK: ['pork'],
  FISH: ['fish', 'meen', 'fysh'],
  PRAWN: ['prawn', 'prawns', 'eral', 'shrimp', 'shrimps'],
  CRAB: ['crab', 'nandu'],
  LOBSTER: ['lobster'],
  EGG: ['egg', 'eggs', 'muttai', 'anda'],
  // ── vegetarian cores ──────────────────────────────────────────────────────
  PANEER: ['paneer', 'panner', 'panir', 'pannir', 'panneer'],
  DAL: ['dal', 'daal', 'dhal', 'paruppu', 'lentil', 'lentils'],
  GOBI: ['gobi', 'gobhi', 'cauliflower'],
  ALOO: ['aloo', 'alu', 'potato', 'potatoes', 'urulai'],
  MUSHROOM: ['mushroom', 'mushrooms', 'kaalan'],
  OKRA: ['okra', 'bhindi', 'vendakkai', 'vendakai'],
  PALAK: ['palak', 'spinach', 'keerai'],
  SOYA: ['soya', 'soy', 'chaap'],
  CORN: ['corn', 'makai'],
  VEG: ['veg', 'vegetable', 'vegetables', 'vegetarian', 'veggie', 'veggies', 'subzi', 'sabzi', 'sabji'],
  // ── dish forms / preparations (heads) ─────────────────────────────────────
  // 'fries' is a potato DISH; 'fry' is a METHOD. Conflating them sent
  // "loaded fries" to fried-wings, so they stay separate concepts.
  FRY: ['fry', 'fried', 'varuval', 'porial', 'poriyal'],
  FRENCHFRY: ['fries', 'fryes'],
  CURRY: ['curry', 'curri', 'kari', 'kuzhambu', 'gravy', 'masala', 'salan'],
  ROAST: ['roast', 'roasted'],
  GRILL: ['grill', 'grilled', 'grilling'],
  TANDOORI: ['tandoori', 'tandori', 'tanduri', 'tandhoori'],
  TIKKA: ['tikka', 'tika', 'tikkah'],
  KEBAB: ['kebab', 'kabab', 'kabob', 'seekh', 'sheek'],
  BBQ: ['bbq', 'barbecue', 'barbeque', 'charcoal'],
  SOUP: ['soup', 'soop', 'shorba', 'rasam'],
  NOODLES: ['noodles', 'noodle', 'chowmein', 'chow', 'hakka', 'atho'],
  MANCHURIAN: ['manchurian', 'manchuria', 'machurian'],
  MOMOS: ['momos', 'momo', 'dumpling', 'dumplings'],
  DOSA: ['dosa', 'dosai', 'dose', 'thosai'],
  IDLI: ['idli', 'idly', 'iddli'],
  VADA: ['vada', 'vadai', 'wada'],
  UTHAPPAM: ['uthappam', 'uttapam', 'uttappam', 'oothappam'],
  SAMBAR: ['sambar', 'sambhar', 'saambar'],
  SALAD: ['salad', 'salaad'],
  SANDWICH: ['sandwich', 'sandwhich', 'panini'],
  BURGER: ['burger', 'burgur'],
  WRAP: ['wrap', 'roll', 'frankie', 'kathi'],
  PIZZA: ['pizza', 'pizaa'],
  PASTA: ['pasta', 'penne', 'macaroni'],
  SHAWARMA: ['shawarma', 'shawerma', 'shaurma'],
  POPCORN: ['popcorn', 'pops', 'nuggets', 'nugget', 'tenders'],
  LOLLIPOP: ['lollipop', 'lollypop', 'lolly'],
  FINGER: ['finger', 'fingers', 'sticks'],
  PLATTER: ['platter', 'basket', 'thali'],
  // ── dairy, drinks, sweets ─────────────────────────────────────────────────
  DAHI: ['dahi', 'curd', 'thayir', 'yoghurt', 'yogurt', 'raita', 'raitha'],
  BUTTERMILK: ['buttermilk', 'mor', 'chaas'],
  LASSI: ['lassi', 'lasi'],
  MILK: ['milk', 'paal'],
  MILKSHAKE: ['milkshake', 'shake', 'shakes'],
  JUICE: ['juice', 'juices'],
  TEA: ['tea', 'chai', 'chaa'],
  COFFEE: ['coffee', 'coffe', 'kaapi', 'kapi'],
  SODA: ['soda', 'sodas'],
  MOCKTAIL: ['mocktail', 'mocktails', 'moctail'],
  ICECREAM: ['icecream', 'kulfi', 'falooda'],
  BROWNIE: ['brownie', 'brownies'],
  // ── modifiers (flavour / technique, not identity) ─────────────────────────
  BUTTER: ['butter'],
  CHILLI: ['chilli', 'chilly', 'chili', 'chille'],
  GARLIC: ['garlic', 'poondu'],
  PEPPER: ['pepper', 'milagu'],
  SCHEZWAN: ['schezwan', 'schewan', 'shezwan', 'szechuan', 'sichuan'],
  MALAI: ['malai', 'cream', 'creamy'],
  MINT: ['mint', 'pudina'],
  LEMON: ['lemon', 'lime', 'nimbu', 'elumichai'],
  ONION: ['onion', 'vengayam'],
  TOMATO: ['tomato', 'thakkali'],
  CHEESE: ['cheese', 'cheesy'],
  GHEE: ['ghee', 'nei'],
  JEERA: ['jeera', 'cumin', 'zeera'],
  KADAI: ['kadai', 'karahi', 'kadhai'],
  CHETTINAD: ['chettinad', 'chettinaad'],
  AFGHANI: ['afghani', 'afghan'],
  ACHARI: ['achari', 'achaari'],
  SIXTYFIVE: ['65'],
};

/** surface form → concept id. */
export const CONCEPT: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [cid, forms] of Object.entries(FORMS)) {
    for (const f of forms) m.set(f, cid);
  }
  return m;
})();

export type Diet = 'v' | 'nv' | 'egg';

/**
 * Dietary class of the identity-bearing concepts.
 * This drives the hard safety gate: a vegetarian item must never be shown a
 * non-vegetarian photograph.
 */
export const DIET: Readonly<Record<string, Diet>> = {
  // Only actual proteins belong here. SHAWARMA is deliberately absent: it is a
  // dish FORM (see HEAD below), and veg-shawarma.jpeg is a real library image —
  // classifying it as non-veg made the matcher reject a vegetarian item's own
  // correct picture.
  CHICKEN: 'nv', MUTTON: 'nv', BEEF: 'nv', PORK: 'nv', FISH: 'nv',
  PRAWN: 'nv', CRAB: 'nv', LOBSTER: 'nv',
  EGG: 'egg',
  PANEER: 'v', DAL: 'v', GOBI: 'v', ALOO: 'v', MUSHROOM: 'v', OKRA: 'v',
  PALAK: 'v', SOYA: 'v', CORN: 'v', VEG: 'v', SWEETCORN: 'v', CURDRICE: 'v',
  DAHI: 'v', BUTTERMILK: 'v', LASSI: 'v',
};

/** A CORE is the identity-bearing ingredient. Two different cores = two dishes. */
export const CORE: ReadonlySet<string> = new Set(Object.keys(DIET));

/** A HEAD is the dish form. Different head = a visually different plate. */
export const HEAD: ReadonlySet<string> = new Set([
  'BIRYANI', 'PULAO', 'RICE', 'FRY', 'CURRY', 'ROAST', 'GRILL', 'TANDOORI',
  'TIKKA', 'KEBAB', 'BBQ', 'SOUP', 'NOODLES', 'MANCHURIAN', 'MOMOS', 'DOSA',
  'IDLI', 'VADA', 'UTHAPPAM', 'SALAD', 'SANDWICH', 'BURGER', 'WRAP', 'PIZZA',
  'PASTA', 'ROTI', 'PAROTTA', 'PARATHA', 'NAAN', 'PURI', 'POPCORN', 'LOLLIPOP',
  'FINGER', 'PLATTER', 'MILKSHAKE', 'JUICE', 'TEA', 'COFFEE', 'SODA',
  'MOCKTAIL', 'ICECREAM', 'BROWNIE', 'LASSI', 'BUTTERMILK', 'FRENCHFRY',
  'SPRINGROLL', 'SHAWARMA', 'CURDRICE', 'KULCHA',
]);
