// src/lib/fuzzyMatch.ts
// Typo-tolerant string matcher for default-image keyword lookups.
//
// Pipeline:
//   1) Normalise both the query and each keyword (lowercase, strip punct,
//      collapse double letters, apply Indian-English transliteration rules).
//   2) Damerau-Levenshtein distance → similarity ratio = 1 - dist / maxLen.
//   3) Return the best match above the threshold (default 0.80 = "80% word match").
//
// Why not just fuzzy-search the raw strings?
//   "Panner Tikka" vs "Paneer Tikka" is 1 edit (94% similarity) — easy.
//   But "Pannir Tikka" vs "Paneer Tikka" is 2 edits across 11 chars → 82%.
//   The phonetic normaliser collapses these to the same key "panertika",
//   so even 2-3 typos in dish names still match.

/** Lowercase, strip punctuation, collapse whitespace, normalise common
 *  Indian-English spelling variants to a canonical phonetic form. */
export function normaliseDishKey(s: string): string {
  let t = s.toLowerCase().trim();
  // Remove punctuation and digits — "paneer-65" → "paneer "
  t = t.replace(/[^a-z\s]/g, ' ');
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim();
  // Common Indian-English variants → canonical form.
  // Applied in order so longer patterns match first.
  const RULES: Array<[RegExp, string]> = [
    // Vowel ambiguity
    [/\b(panner|paner|panir|pannir|panneer|paaneer)\b/g, 'paneer'],
    [/\b(biriyani|biriyaani|biryaani|biriyaani|biryani)\b/g, 'biryani'],
    [/\b(briyani|briyaani|bryani)\b/g, 'biryani'],
    [/\b(parrota|parratha|paratha|porotta|borotta)\b/g, 'parotta'],
    [/\b(roti|rotti)\b/g, 'roti'],
    [/\b(naan|nan|nann)\b/g, 'naan'],
    [/\b(samosa|samoosa|samusa)\b/g, 'samosa'],
    [/\b(pakora|pakoda|bhajia|bhajji|bhaji)\b/g, 'pakora'],
    [/\b(tikka|tika|tikkah)\b/g, 'tikka'],
    [/\b(masala|masalah|masaala)\b/g, 'masala'],
    [/\b(curry|curri|kari|kary)\b/g, 'curry'],
    [/\b(idli|idly|iddli|iddly|idliy)\b/g, 'idli'],
    [/\b(dosa|dosai|dose|dossa|dossai)\b/g, 'dosa'],
    [/\b(uttapam|uthappam|uttappam|oothappam|uthapam)\b/g, 'uthappam'],
    [/\b(vada|wada|wadai|vadai)\b/g, 'vada'],
    [/\b(sambar|saambar|sambhar|sambaar)\b/g, 'sambar'],
    [/\b(chutney|chatni|chutni)\b/g, 'chutney'],
    [/\b(rasam|rassam|rasaam)\b/g, 'rasam'],
    [/\b(kulfi|kulfee|kullfi)\b/g, 'kulfi'],
    [/\b(lassi|laasi|lasi)\b/g, 'lassi'],
    [/\b(chai|chaai|chaay|cha)\b/g, 'chai'],
    [/\b(tea|teaa|teas)\b/g, 'tea'],
    [/\b(coffee|coffe|kofee|kaapi|kaffi)\b/g, 'coffee'],
    [/\b(mocktail|moctail|mocktale|mocktels|mockteil)\b/g, 'mocktail'],
    [/\b(milkshake|milkshk|milshake|milshakes|milkshakes)\b/g, 'milkshake'],
    [/\b(juice|juc|juic|juices)\b/g, 'juice'],
    [/\b(soup|soop|sop|soups)\b/g, 'soup'],
    [/\b(momos|momoos|momo|moomos|momoes)\b/g, 'momos'],
    [/\b(manchurian|machurian|manchurain|manchooriyan)\b/g, 'manchurian'],
    [/\b(manchow|manchao|manchaw|manchoow)\b/g, 'manchow'],
    [/\b(noodles|nudles|noodels|noddles)\b/g, 'noodles'],
    [/\b(fried|fired|fryd|fired)\b/g, 'fried'],
    [/\b(grilled|griled|grild|grilld)\b/g, 'grilled'],
    [/\b(tandoori|tandori|tanduri|tanshoori|tanshuri|tandhoori)\b/g, 'tandoori'],
    [/\b(mushroom|mushrooom|mashroom|mushrum)\b/g, 'mushroom'],
    [/\b(brownie|brownee|braunie|brownies)\b/g, 'brownie'],
    [/\b(icecream|ice cream|icream)\b/g, 'icecream'],
    [/\b(jeera|jera|jiraa|zeera|jeerah)\b/g, 'jeera'],
    [/\b(elaichi|elachi|elachii|elachy|ilaichi)\b/g, 'elaichi'],
    [/\b(cardamom|cardamum|cardamon)\b/g, 'cardamom'],
    [/\b(pomegranate|pommegranate|pomgranate|anar)\b/g, 'pomegranate'],
    [/\b(watermelon|watarmelon|watermellon|tarbooz|tarbuz)\b/g, 'watermelon'],
    [/\b(pineapple|pinaple|pineappal)\b/g, 'pineapple'],
    [/\b(chaat|chat|chaaat|caht)\b/g, 'chaat'],
    [/\b(bhel|bel|bhell|bhelpuri)\b/g, 'bhel'],
    [/\b(puri|poori|puree)\b/g, 'puri'],
    [/\b(dahi|dahee|dhi|curd)\b/g, 'dahi'],
    [/\b(papdi|pappadi|papad|pappad|papadi)\b/g, 'papdi'],
    [/\b(salad|salaad|salat|sallad)\b/g, 'salad'],
  ];
  for (const [re, repl] of RULES) t = t.replace(re, repl);
  return t;
}

/** Damerau-Levenshtein distance — allows insert, delete, replace, transpose.
 *  Transposition catches typos like "pnaeer" → "paneer" in one operation. */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length, n = b.length;
  // Use two rolling rows for memory — full matrix would be O(mn).
  // For our use case (dish names < 60 chars) full matrix is fine and simpler.
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,        // deletion
        d[i][j - 1] + 1,        // insertion
        d[i - 1][j - 1] + cost, // substitution
      );
      // Transposition (Damerau extension)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/** 0..1 similarity ratio. 1.0 = identical, 0.0 = nothing in common. */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - damerauLevenshtein(a, b) / maxLen;
}

/** Find the best fuzzy match for `query` among `candidates`.
 *  Both are normalised before comparison so transliteration variants
 *  (panner/paneer/panir) collapse to the same form before edit-distance.
 *  Returns null if no candidate clears the threshold (default 0.80). */
export function bestFuzzyMatch<T extends string>(
  query: string,
  candidates: readonly T[],
  threshold = 0.80,
): { key: T; score: number } | null {
  const nq = normaliseDishKey(query);
  if (!nq) return null;
  let best: { key: T; score: number } | null = null;
  for (const cand of candidates) {
    const nc = normaliseDishKey(cand);
    // Quick token-overlap pre-filter: if normalised candidate shares no
    // 3-letter prefix or substring chunk, skip the expensive DL computation.
    if (Math.abs(nc.length - nq.length) > Math.max(nc.length, nq.length) * 0.6) continue;
    const score = similarity(nq, nc);
    if (score >= threshold && (!best || score > best.score)) {
      best = { key: cand, score };
    }
  }
  return best;
}
