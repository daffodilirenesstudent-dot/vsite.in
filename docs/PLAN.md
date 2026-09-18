# PLAN — Concept-based dish-image matching

Goal: `docs/GOAL.md`. Evidence: `docs/image-matching-rnd.md`. PoC: `docs/poc/image-matching/`.

## Tasks

1. **`apps/web/src/lib/menu/conceptVocabulary.ts`** — the knowledge base as data.
   `STOP`, `PHRASES`, `CONCEPT` (surface → concept id), `DIET`, `CORE`, `HEAD`.
   No logic. This is the file that grows as new dish names appear.

2. **`apps/web/src/lib/menu/conceptMatcher.ts`** — the algorithm.
   - `dishConcepts(name)` — normalise → phrase concepts → token concepts →
     Damerau-Levenshtein fallback for typos.
   - `buildImageIndex(names)` — concept sets + IDF weights over the library.
   - `matchImage(query, index)` — five gates, IDF-weighted Jaccard, decide
     `specific` | `generic` | `abstain`.
   - `isNonVegImage(name)` — the safety predicate the tests assert on.
   - Reuses `damerauLevenshtein` from `src/lib/menu/fuzzyMatch.ts` (already
     present, already tested) rather than re-implementing it.

3. **`apps/web/src/lib/menu/imageLibrary.ts`** — loads `default_images` once per
   process and caches it. MUST select only `image_url` (never `embedding`, which
   would be ~4–5 MB of egress per cold start).

4. **Wire `/api/images/match`** — delete the OpenAI embedding call, the
   `match_default_image` RPC and the gpt-4o-mini rerank. Keep auth and rate limit.

5. **Wire `onboarding/complete → findImagesForItems`** — same matcher, so the two
   paths can no longer disagree (they use 0.35 vs 0.45 today).

6. **Benchmark harness** — `docs/poc/image-matching/` scripts produce the
   before/after evidence required by AC10.

## Thresholds

`accept 0.75`, `generic 0.30`, `margin 0.05` — from the measured sweep
(~95% precision at 37.5% specific coverage). Exported as named constants so the
trade-off is tunable in one place.

## Not in this change

Backfill of the 21 existing wrong images; new photographs; dropping the
`embedding` column.
