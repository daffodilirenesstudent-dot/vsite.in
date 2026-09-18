# Current Goal

Feature: **Concept-based dish-image matching** — replace the embedding/vector
image matcher with a deterministic, zero-recurring-cost concept matcher.

Why: owners are being shown the wrong food photo. `Dal Fry` gets the **fish fry**
picture. Measured on production data, **21 vegetarian menu items are currently
displaying a non-vegetarian image**, plus `chicken fry` → chicken-**pizza**,
`mutton biryani` → generic biryani, `mushroom tikka` → grill-paneer. For a Tamil
Nadu menu a non-veg photo on a veg dish is a trust failure, not a cosmetic bug.

Root cause (see `docs/image-matching-rnd.md`): the index stores 2-sentence
*descriptions*, not dish names; the cosine thresholds (0.35 / 0.45) sit far below
the noise floor (88% of the library has a decoy above 0.45); and the matcher has
no way to say "I don't know".

Token per Ralph loop: 3 iterations

## Acceptance criteria (each maps to a test)

- [ ] **AC1 — Safety invariant.** A vegetarian item NEVER receives a
      non-vegetarian image. Zero exceptions, enforced as a hard gate.
- [ ] **AC2 — The reported bug.** `dal fry` → `dal-fry-v5`, never `fish-fry`.
      Same for the `daal fry` spelling.
- [ ] **AC3 — Core-ingredient integrity.** `mutton biryani` never returns
      chicken/veg/egg biryani; `paneer 65` never returns chicken 65.
- [ ] **AC4 — Many names → one image.** `roti`, `chapati`, `chapathi`, `phulka`
      all resolve to the same image. Same for `curd rice` / `thayir sadam`.
- [ ] **AC5 — Partial-anchor rejection.** A matching core with a wrong/unknown
      dish word must not yield a confident specific match
      (`mutton sukka` must not return a mutton *biryani*).
- [ ] **AC6 — Honest abstain.** Dishes absent from the library (`kulcha`,
      `puttu`) and junk input (`testing`, `meal 1`) return no specific image.
- [ ] **AC7 — Typo tolerance.** `chiken biriyani`, `panner tikka`,
      `mtton biriyani` resolve correctly.
- [ ] **AC8 — No network at match time.** No OpenAI call, no pgvector RPC in the
      request path. Matching is pure in-process computation.
- [ ] **AC9 — Single source of truth.** `/api/images/match` and
      `onboarding/complete` use ONE matcher and cannot disagree.
- [ ] **AC10 — Benchmark evidence.** Before/after numbers committed, covering
      both the wins and the regressions.

## Out of scope

- Backfilling the 21 existing wrong images (separate, opt-in, dry-run first).
- Adding new photographs to the library (product task, tracked separately).
- Dropping the `embedding` column — kept for offline alias proposals, just
  removed from the request path.
- Any change to ordering, payments, or auth.

## Inputs / context

- Research + evidence: `docs/image-matching-rnd.md` (Parts 1–4)
- Working proof of concept: `docs/poc/image-matching/`
- Library: 353 images, `public.default_images`
- Production query distribution: 1,067 distinct item names, 623-token vocabulary

## Definition of done

- Golden-set acceptance suite green, including every AC above.
- `npx vitest run && npm run lint && npx tsc --noEmit` all clean.
- Before/after benchmark committed with the regressions named, not just the wins.
