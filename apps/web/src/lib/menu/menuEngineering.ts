/**
 * Vsite Menu Engineering Algorithm — Phase 0 formula library.
 *
 * All functions are pure (no side-effects, no I/O) so they can be used by
 * the API, frontend preview, and unit tests without any mocking.
 *
 * References:
 *   Kasavana & Smith (1982), Pavesic (1983), Tom & Annaraud (2017),
 *   ScienceDirect MCDS (2024), AHLEI revised PT (2026).
 */

// ─── Layer 1: Profitability & Popularity ────────────────────────────────────

/** CM_i = P_i - FC_i  (Kasavana & Smith 1982) */
export function contributionMargin(sellingPrice: number, foodCost: number): number {
  return sellingPrice - foodCost;
}

/**
 * SM_i = (Q_i / ΣQ_j) × 100  (Kasavana & Smith 1982)
 * Returns a parallel array of SM% values summing to 100.
 * All-zero input returns uniform distribution (1/n × 100 each).
 */
export function salesMixPct(unitsSold: number[]): number[] {
  const total = unitsSold.reduce((a, b) => a + b, 0);
  if (total === 0) {
    const uniform = 100 / unitsSold.length;
    return unitsSold.map(() => uniform);
  }
  return unitsSold.map(q => (q / total) * 100);
}

/**
 * PT = (100 / n) × 0.70  (AHLEI 2026 revision of Kasavana-Smith 0.80)
 * Preferred for SMB menus of 5–8 items — avoids over-classifying as low popularity.
 */
export function popularityThreshold(n: number): number {
  if (n <= 0) return 0;
  return (100 / n) * 0.70;
}

/** Average CM across category — the profitability threshold axis. */
export function profitabilityThreshold(cms: number[]): number {
  if (cms.length === 0) return 0;
  return cms.reduce((a, b) => a + b, 0) / cms.length;
}

// ─── Layer 2: Classification ─────────────────────────────────────────────────

export type KSClass = 'STAR' | 'PLOWHORSE' | 'PUZZLE' | 'DOG';

/** Binary Kasavana-Smith quadrant classification. */
export function ksClassify(isPopHigh: boolean, isCmHigh: boolean): KSClass {
  if (isPopHigh && isCmHigh) return 'STAR';
  if (isPopHigh && !isCmHigh) return 'PLOWHORSE';
  if (!isPopHigh && isCmHigh) return 'PUZZLE';
  return 'DOG';
}

/**
 * Trapezoidal fuzzy membership μ(x; a, b, c, d).
 * Tom & Annaraud (2017).
 *   a = p5, b = p25, c = p75, d = p95 of category distribution.
 */
export function trapezoidMembership(x: number, a: number, b: number, c: number, d: number): number {
  if (x <= a || x >= d) return 0;
  if (x < b) return (x - a) / (b - a);
  if (x <= c) return 1;
  return (d - x) / (d - c);
}

/** Compute fuzzy membership for a value against its category distribution. */
export function computeFuzzy(value: number, allValues: number[]): number {
  if (allValues.length < 2) return value > 0 ? 1 : 0;
  const sorted = [...allValues].sort((a, b) => a - b);
  const pct = (p: number) => {
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  return trapezoidMembership(value, pct(5), pct(25), pct(75), pct(95));
}

export type FuzzyZone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Map (fuzzy_pop, fuzzy_profit) to 9-zone label. Tom & Annaraud extended. */
export function fuzzyZone(fuzzyPop: number, fuzzyProfit: number): FuzzyZone {
  const highP = fuzzyProfit >= 0.7;
  const midP  = fuzzyProfit >= 0.4;
  const highQ = fuzzyPop >= 0.7;
  const midQ  = fuzzyPop >= 0.4;

  if (highQ && highP) return 1;
  if (midQ  && highP) return 2;
  if (!midQ && highP) return 3;
  if (highQ && midP)  return 4;
  if (midQ  && midP)  return 5;
  if (!midQ && midP)  return 6;
  if (highQ)          return 7;
  if (midQ)           return 8;
  return 9;
}

// ─── Layer 3: Weighted Ranking Score (MCDS) ──────────────────────────────────

export interface WeightedScoreInputs {
  starRating: number;      // 1–4 owner input
  profitTier: number;      // 1–4 owner input
  ordersToday: number;     // live count, capped at 50
  likeCount: number;       // social proof, capped at 200
  offerActive: boolean;
}

function norm(val: number, min: number, max: number): number {
  return Math.min(Math.max((val - min) / (max - min), 0), 1);
}

/**
 * S_i = Σ w_k · x̂_ik  (MCDS, ScienceDirect 2024)
 * Weights: star=0.50, profit=0.35, orders=0.08, likes=0.04, offer=0.03
 * Returns a value in [0, 1].
 */
export function weightedScore(inputs: WeightedScoreInputs): number {
  return (
    norm(inputs.starRating, 1, 4)    * 0.50 +
    norm(inputs.profitTier, 1, 4)    * 0.35 +
    norm(inputs.ordersToday, 0, 50)  * 0.08 +
    norm(inputs.likeCount, 0, 200)   * 0.04 +
    (inputs.offerActive ? 1 : 0)     * 0.03
  );
}

// ─── Preview quadrant (for onboarding summary) ───────────────────────────────

export type QuadrantLabel = 'Star' | 'Plowhorse' | 'Puzzle' | 'Dog';

/**
 * Simple preview classifier using only owner-supplied star_rating and profit_tier.
 * Used on the onboarding summary screen before real sales data exists.
 * Threshold: >= 3 counts as "high" (top half of 1–4 scale).
 */
export function previewQuadrant(starRating: number, profitTier: number): QuadrantLabel {
  const popHigh  = starRating >= 3;
  const profHigh = profitTier >= 3;
  if (popHigh && profHigh) return 'Star';
  if (popHigh && !profHigh) return 'Plowhorse';
  if (!popHigh && profHigh) return 'Puzzle';
  return 'Dog';
}

// ─── System validation metrics (CSI, SCR, DSR) ──────────────────────────────

/**
 * Classification Stability Index.
 * CSI = 1 − (changed / total). Target: ≥ 0.85.
 */
export function csi(prevClasses: KSClass[], currClasses: KSClass[]): number {
  if (prevClasses.length === 0) return 1;
  const changed = prevClasses.filter((c, i) => c !== currClasses[i]).length;
  return 1 - changed / prevClasses.length;
}

/**
 * Star Coverage Rate.
 * SCR = Stars in top ⌈n/3⌉ positions / total Stars. Target: 1.0.
 */
export function scr(rankedClasses: KSClass[]): number {
  const n = rankedClasses.length;
  const topN = Math.ceil(n / 3);
  const totalStars = rankedClasses.filter(c => c === 'STAR').length;
  if (totalStars === 0) return 1;
  const starsInTop = rankedClasses.slice(0, topN).filter(c => c === 'STAR').length;
  return starsInTop / totalStars;
}

/**
 * Dog Suppression Rate.
 * DSR = Zone-9 items hidden / total Zone-9 items. Target: 1.0.
 */
export function dsr(zone9Count: number, zone9HiddenCount: number): number {
  if (zone9Count === 0) return 1;
  return zone9HiddenCount / zone9Count;
}
