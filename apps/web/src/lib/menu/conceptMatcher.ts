// Deterministic dish-name → image matcher.
//
// Replaces the OpenAI-embedding + pgvector path. No network, no model, no API
// key: one linear pass over the image library, ~0.06 ms at 353 images.
//
// Pipeline
//   1. normalise        lowercase, strip punctuation, drop portion/noise words
//   2. phrase concepts  longest-match multi-token concepts ("butter milk")
//   3. token concepts   surface form → concept id, with a Damerau-Levenshtein
//                       fallback so unseen typos resolve without a table entry
//   4. gates            five hard constraints, applied BEFORE scoring
//   5. score            IDF-weighted Jaccard over concept ids
//   6. decide           specific | generic | abstain
//
// Why gates before scoring: similarity is a ranking signal, not a decision. The
// previous matcher used cosine as a decision and served a fish photo for
// "dal fry". A different core ingredient is rejected outright here — no amount
// of similarity elsewhere can outvote it. See docs/image-matching-rnd.md.

import { damerauLevenshtein } from '@/lib/menu/fuzzyMatch';
import {
  STOP, PHRASES, CONCEPT, DIET, CORE, HEAD, type Diet,
} from '@/lib/menu/conceptVocabulary';

// ── Tuning ───────────────────────────────────────────────────────────────────
// From the measured precision/coverage sweep over 1,067 production item names
// (docs/image-matching-rnd.md §4.5). Raising ACCEPT trades coverage for
// precision; it does not affect the safety gates, which are unconditional.
export const ACCEPT_THRESHOLD = 0.75;
export const GENERIC_THRESHOLD = 0.30;
export const MARGIN = 0.05;

/** Minimum token length considered for typo correction. */
const FUZZY_MIN_LEN = 4;
/** Similarity a typo must reach to be treated as a known concept. */
const FUZZY_MIN_SIM = 0.82;
/** Unknown tokens are unverifiable, so they must not dominate the score. */
const UNKNOWN_WEIGHT = 1.0;

const UNKNOWN_PREFIX = '~';
/** Concepts that say what a dish is not, never what it is. */
const DIET_LABELS: ReadonlySet<string> = new Set(['VEG', 'NONVEG']);
const COMBO = /\bcombos?\b/i;
const SURFACES: readonly string[] = Array.from(CONCEPT.keys());

// ── 1–3. Name → concept ids ──────────────────────────────────────────────────

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP.has(t));
}

/** Nearest known surface form, for typos not worth a vocabulary entry. */
function fuzzyConcept(token: string): string | null {
  if (token.length < FUZZY_MIN_LEN) return null;
  let bestId: string | null = null;
  let bestSim = 0;
  for (const surface of SURFACES) {
    if (Math.abs(surface.length - token.length) > 2) continue;
    const sim = 1 - damerauLevenshtein(token, surface) / Math.max(token.length, surface.length);
    if (sim >= FUZZY_MIN_SIM && sim > bestSim) {
      bestSim = sim;
      bestId = CONCEPT.get(surface) ?? null;
    }
  }
  return bestId;
}

/**
 * Concept ids for a dish name. Unrecognised tokens are kept, prefixed with `~`,
 * so the matcher knows identity-bearing information is present but unverified.
 */
export function dishConcepts(name: string): string[] {
  const raw = tokenize(name);
  const out: string[] = [];
  let i = 0;
  while (i < raw.length) {
    let matched: { cid: string; len: number } | null = null;
    for (const [phrase, cid] of PHRASES) {
      if (phrase.every((p, k) => raw[i + k] === p)) { matched = { cid, len: phrase.length }; break; }
      // Order-insensitive for two-token phrases: "rice curd" === "curd rice".
      if (phrase.length === 2 && raw[i] === phrase[1] && raw[i + 1] === phrase[0]) {
        matched = { cid, len: 2 };
        break;
      }
    }
    if (matched) { out.push(matched.cid); i += matched.len; continue; }

    const token = raw[i];
    const direct = CONCEPT.get(token);
    out.push(direct ?? fuzzyConcept(token) ?? `${UNKNOWN_PREFIX}${token}`);
    i += 1;
  }
  return Array.from(new Set(out));
}

interface Roles { cores: string[]; heads: string[]; diets: Diet[] }

function roles(concepts: readonly string[]): Roles {
  const diets = new Set<Diet>();
  for (const c of concepts) { const d = DIET[c]; if (d) diets.add(d); }
  return {
    cores: concepts.filter((c) => CORE.has(c)),
    heads: concepts.filter((c) => HEAD.has(c)),
    diets: Array.from(diets),
  };
}

/** True when an image name denotes a non-vegetarian dish. */
export function isNonVegImage(imageName: string): boolean {
  return dishConcepts(imageName).some((c) => DIET[c] === 'nv');
}

// ── 4. Index ─────────────────────────────────────────────────────────────────

interface IndexedImage extends Roles {
  name: string;
  concepts: string[];
  set: Set<string>;
  weight: number;
  /** Reviewed label when the library supplies one; null when only inferred. */
  verifiedDiet: Diet | null;
}

export interface ImageIndex {
  items: IndexedImage[];
  idf(concept: string): number;
  byName: Map<string, IndexedImage>;
}

/** A library entry. A bare string keeps name-only inference for callers that have no labels. */
export type ImageInput = string | { name: string; diet?: Diet | null };

/**
 * The dietary class of a library image.
 *
 * Prefers the reviewed label. Falls back to inferring from the name, which is
 * lossy — `irani-bbq` is chicken and its name never says so — which is exactly
 * why the label exists.
 */
export function imageDiet(imageName: string, index: ImageIndex): Diet | null {
  const item = index.byName.get(imageName);
  if (item?.verifiedDiet) return item.verifiedDiet;
  const concepts = item?.concepts ?? dishConcepts(imageName);
  const diets = new Set(concepts.map((c) => DIET[c]).filter(Boolean) as Diet[]);
  if (diets.has('nv')) return 'nv';
  if (diets.has('v')) return 'v';
  return diets.has('egg') ? 'egg' : null;
}

/**
 * Build the searchable index from library image names.
 * Cost is linear in library size and paid once per process.
 */
export function buildImageIndex(entries: readonly ImageInput[]): ImageIndex {
  const items: IndexedImage[] = entries.map((entry) => {
    const name = typeof entry === 'string' ? entry : entry.name;
    const verifiedDiet = typeof entry === 'string' ? null : entry.diet ?? null;
    const concepts = dishConcepts(name);
    const r = roles(concepts);
    // A reviewed label overrides whatever the name implies, in both directions:
    // it marks irani-bbq non-veg, and stops veg-biryani being read as non-veg
    // because its description happens to say "meat-free".
    const diets = verifiedDiet ? [verifiedDiet] : r.diets;
    return { name, concepts, set: new Set(concepts), weight: 0, ...r, diets, verifiedDiet };
  });

  const docFreq = new Map<string, number>();
  for (const item of items) {
    for (const c of item.set) docFreq.set(c, (docFreq.get(c) ?? 0) + 1);
  }

  const n = Math.max(items.length, 1);
  // Rare concepts carry the identity: across the production library "chicken"
  // appears in 90 images (weight 1.87) while "dal" appears in 2 (weight 5.67).
  // That asymmetry is what separates "dal fry" from "fish fry".
  const idf = (c: string): number =>
    c.startsWith(UNKNOWN_PREFIX) ? UNKNOWN_WEIGHT : Math.log(n / (docFreq.get(c) ?? 0.5)) + 0.5;

  const byName = new Map<string, IndexedImage>();
  for (const item of items) {
    item.weight = item.concepts.reduce((s, c) => s + idf(c), 0);
    if (!byName.has(item.name)) byName.set(item.name, item);
  }
  return { items, idf, byName };
}

// ── 5–6. Match ───────────────────────────────────────────────────────────────

export type MatchDecision = 'specific' | 'generic' | 'abstain';

export interface MatchResult {
  decision: MatchDecision;
  /** Library image name; null when abstaining. */
  image: string | null;
  score: number | null;
  /** Concepts the query resolved to — makes every decision explainable. */
  concepts: string[];
  reason?: string;
}

export interface MatchOptions {
  accept?: number;
  generic?: number;
  margin?: number;
}

export function matchImage(
  query: string,
  index: ImageIndex,
  options: MatchOptions = {},
): MatchResult {
  const accept = options.accept ?? ACCEPT_THRESHOLD;
  const genericFloor = options.generic ?? GENERIC_THRESHOLD;
  const margin = options.margin ?? MARGIN;

  const concepts = dishConcepts(query);
  if (concepts.length === 0) {
    return { decision: 'abstain', image: null, score: null, concepts, reason: 'empty' };
  }

  const q = roles(concepts);

  // A diet label is not a dish. VEG is a CORE so "paruppu"-style bare-core
  // queries still resolve, but "veg special" / "veg plate" name nothing that is
  // on the plate — and were served veg-kolhapuri, a curry.
  if (concepts.every((c) => DIET_LABELS.has(c))) {
    return { decision: 'abstain', image: null, score: null, concepts, reason: 'diet label only' };
  }
  // A combo is several dishes; the photo of one of them misdescribes it. Only
  // a combo named after its dish form ("biryani combo") keeps that picture.
  // `combo` is a STOP word, so this reads the raw name.
  if (COMBO.test(query) && q.heads.length === 0) {
    return { decision: 'abstain', image: null, score: null, concepts, reason: 'combo' };
  }

  const qSet = new Set(concepts);
  const qWeight = concepts.reduce((s, c) => s + index.idf(c), 0);

  const survivors: Array<{ item: IndexedImage; score: number }> = [];
  for (const item of index.items) {
    // GATE 1 — diet. A vegetarian item may never receive a non-vegetarian
    // image. Unconditional: this is the invariant the product depends on.
    if (q.diets.includes('v') && !q.diets.includes('nv') && item.diets.includes('nv')) continue;
    // GATE 2 — core ingredient. Different identity → different dish.
    if (q.cores.length > 0 && item.cores.length > 0
      && !q.cores.some((c) => item.cores.includes(c))) continue;
    // GATE 3 — dish form. A curry is not a fry is not a biryani.
    if (q.heads.length > 0 && item.heads.length > 0
      && !q.heads.some((h) => item.heads.includes(h))) continue;
    // GATE 4 — never invent a protein out of nothing. If the query names no
    // core AND does not even agree on the dish form, a candidate carrying a
    // protein is pure guesswork: that is how "lemon" reached lemony-chicken.
    // A shared head is different — "lebanese shawarma" genuinely is the
    // shawarma picture, and "noodles" genuinely is a bowl of noodles.
    if (q.cores.length === 0 && item.cores.length > 0
      && !q.heads.some((h) => item.heads.includes(h))) continue;

    let shared = 0;
    for (const c of qSet) if (item.set.has(c)) shared += index.idf(c);
    if (shared <= 0) continue;
    survivors.push({ item, score: shared / (qWeight + item.weight - shared) });
  }

  if (survivors.length === 0) {
    return { decision: 'abstain', image: null, score: null, concepts, reason: 'no candidate' };
  }

  // Ranking: score first. On a tie, when the query itself named no protein,
  // prefer the vegetarian image — "noodles" should not resolve to chicken on an
  // alphabetical coin-flip. A vegetarian photo on a non-vegetarian dish is a
  // disappointment; the reverse is a breach of trust.
  const vegFirst = q.cores.length === 0;
  const dietRank = (it: IndexedImage): number => (it.diets.includes('nv') ? 1 : 0);
  survivors.sort((a, b) => (
    b.score - a.score
    || (vegFirst ? dietRank(a.item) - dietRank(b.item) : 0)
    || a.item.name.localeCompare(b.item.name)
  ));
  const top = survivors[0];
  const runnerUp = survivors[1];
  const gap = runnerUp ? top.score - runnerUp.score : 1;

  // A clear winner, or an exact concept-set match (ties between near-duplicate
  // library versions are resolved deterministically by the sort above).
  if (top.score >= accept && (gap >= margin || top.item.set.size === qSet.size)) {
    return { decision: 'specific', image: top.item.name, score: top.score, concepts };
  }

  // GATE 5 — the generic band may not cross a dish-form boundary. A shared CORE
  // alone is not a picture: "mutton" says nothing about what is on the plate,
  // so "mutton sukka" must not be served a mutton *biryani*. A generic answer
  // needs a shared HEAD, a candidate with no head of its own, or a bare
  // single-core query ("paruppu" → any dal dish is fair).
  if (top.score >= genericFloor) {
    const sharesHead = q.heads.some((h) => top.item.heads.includes(h));
    const candidateHeadless = top.item.heads.length === 0;
    const bareCore = concepts.length === 1 && CORE.has(concepts[0]);
    if (sharesHead || candidateHeadless || bareCore) {
      return { decision: 'generic', image: top.item.name, score: top.score, concepts };
    }
    return { decision: 'abstain', image: null, score: top.score, concepts, reason: 'head mismatch' };
  }

  return { decision: 'abstain', image: null, score: top.score, concepts, reason: 'below threshold' };
}
