# R&D — Dish name → image matching

Status: research complete, awaiting go/no-go on the recommended design.
Date: 2026-09-18.
Scope: `/api/images/match`, `onboarding/complete → findImagesForItems`,
`src/lib/menu/defaultImages.ts`, `src/lib/menu/fuzzyMatch.ts`,
`public.default_images`.

Trigger: owner types "Dal Fry", gets the **fish fry** photo. Vegetarian item,
non-vegetarian picture.

---

## 1. What the system does today

Three layers, in order:

1. **`matchByKeyword()`** — 158 hardcoded keys in `defaultImages.ts`, five
   tiers (exact 1.0 → filename 0.98 → fuzzy 0.80–0.95 → generic 0.30–0.50 →
   token-fuzzy 0.25–0.40). Accepted at ≥ 0.75.
2. **pgvector** — `text-embedding-3-small` on the query, cosine against
   `default_images.embedding`, `match_threshold` **0.35** in
   `/api/images/match` and **0.45** in `onboarding/complete`.
3. **gpt-4o-mini rerank** — fires only when `top.similarity < 0.65` *and*
   `top − runnerUp < 0.10`.

Library today: **353 images, all embedded, 18 categories.**

---

## 2. Root cause — traced, not guessed

### 2.1 "Dal Fry" walkthrough

`KEYWORD_MAP` has `'fish fry'` and `fish`. It has **no `dal` key at all**,
even though `dal-fry-v5.jpeg` *is in the database*. Each tier:

| Tier | Test | Result |
|---|---|---|
| 1 exact | `KEYWORD_MAP['dal fry']` | miss |
| 2 filename | `"dalfry"` in FILENAME_MAP | miss |
| 3 fuzzy | `similarity("dal fry","fish fry")` = 1 − 4/8 = **0.50**, needs ≥ 0.80 | reject |
| 3b file-fuzzy | `similarity("dalfry","fishfry")` = 1 − 4/7 = 0.43, needs ≥ 0.82 | reject |
| 4 generic | no key is a substring of `"dal fry"` | miss |
| 4b token | tokens `dal`(3), `fry`(3) both < 4 chars | skipped |

So `matchByKeyword` correctly returns `null`. **The keyword layer is not the
bug** — the 0.50 the owner saw is the Tier-3 score that was *rejected*. The
wrong image comes from the vector layer underneath it.

### 2.2 The vector layer has no basis for deciding

The index stores the **description**, not the name. There is no `name`
column — the seed scripts build a rich `embedText`
(`"dal fry lentil tadka..."`) and then **throw it away**, persisting only
`image_url`, `description`, `category`, `tags`.

Consequence, measured on production data:

```
nearest neighbours of dal-fry-v5 (by stored description vector)
  dal-tadka-v5        0.681
  egg-curry-v5        0.640      ← non-veg
  kadai-paneer-v5b    0.623
  kadai-veg-subzi     0.605
```

Dal Fry's own vector neighbourhood is **gravy dishes**. Its description —
*"Mixed lentils cooked with onion-tomato masala and tempered with ghee"* —
barely mentions frying. Fish Fry's description is saturated with it:
*"pan-fried or deep-fried until crispy and golden"*. A short query
`"dal fry"` is dominated by the token `fry`, so it lands in the fry cluster,
where Dal Fry does not live.

This is textbook **asymmetric retrieval**: short name-shaped query against
long prose-shaped documents. OpenSearch measures up to
[125% relevance swing](https://opensearch.org/blog/asymmetric-model-support-optimizing-semantic-search-for-queries-and-documents/)
from fixing exactly this mismatch. We currently have the mismatch.

### 2.3 The thresholds are below the noise floor

```
fish-fry's nearest neighbours
  crab-fry          0.688
  fish-finger       0.610
  fish-65-v5        0.567
  french-fry        0.545   ← potatoes
  prawn-fry         0.466
```

```
mutton-biryani-v5's nearest neighbours
  chicken-biryani-v5  0.848   ← wrong meat
  mutton-biriyani     0.783
  veg-biryani-v5      0.706
  egg-biryani         0.703
```

Wrong-answer pairs score **0.55–0.85**. Thresholds in force are **0.35** and
**0.45**. Across the whole library:

| Metric (353 rows) | Value |
|---|---|
| mean top-1 similarity to a *different* image | **0.675** |
| images with another image above 0.45 | **298 / 340 (88%)** |
| images with another image above 0.65 | **198 / 340 (58%)** |

**88% of the library has a decoy above the onboarding threshold.** There is no
value of a single global cosine threshold that admits `mutton biryani → mutton
biryani` (0.85 band) while rejecting `dal fry → fish fry` (0.55 band) — the
distributions overlap completely. Cosine is a *ranking* signal and the code
uses it as a *decision* signal.

The rerank is also mis-triggered: it requires `top < 0.65`, but 58% of rows
have a confusable neighbour *above* 0.65, so in the crowded regions where
reranking is needed it never runs.

### 2.4 Four secondary defects

- **Two divergent code paths.** `/api/images/match` uses 0.35; onboarding
  uses `SIM_THRESHOLD = 0.45`. The same dish gets different images depending
  on which screen the owner is on.
- **No diet constraint anywhere.** Nothing prevents a non-veg photo on a veg
  item. For a Tamil Nadu menu this is not cosmetic — it is a trust and
  dietary-observance failure, and it is the single most important invariant
  the matcher is missing.
- **`KEYWORD_MAP` is drifting duplicate state.** 158 hand-written keys
  shadowing 353 DB rows. `dal-fry-v5.jpeg` exists in one and not the other.
  Every new image needs a code edit — the opposite of the zero-maintenance
  requirement.
- **`similarity()` is length-biased.** `1 − DL/maxLen` scores short strings
  harshly; `bestFuzzyMatch`'s length pre-filter (`>0.6` ratio) silently skips
  true matches on long names.

---

## 3. Options evaluated

| # | Approach | Fixes the bug class? | Recurring cost | Verdict |
|---|---|---|---|---|
| 1 | Raise thresholds / tune rerank | No — distributions overlap (§2.3) | unchanged | Reject |
| 2 | Re-embed on names, symmetric | Partly — helps asymmetry, still no abstain, still ranks mutton≈chicken at 0.85 | unchanged | Necessary, insufficient |
| 3 | Hybrid BM25 + vector + RRF | No — RRF is rank-only and **always returns a winner**; it has no abstain | unchanged | Reject as the decision layer |
| 4 | Local embeddings (Transformers.js `bge-small`/`gte-small`) | No — same ranking-vs-decision problem | zero, but +90MB build, CPU/request | Not needed |
| 5 | Cross-encoder rerank | Yes, best accuracy | needs a model host | Reject — recurring cost |
| 6 | LLM call per item | Yes | per-item API spend | Reject — violates constraint |
| 7 | **Constrained lexical entity resolution + abstain** | **Yes** | **zero** | **Recommended** |

pg_trgm, fuzzystrmatch, unaccent and pgroonga are all available on the
project (none installed). They are viable but unnecessary — at 353 rows the
whole match runs in-process in under a millisecond, and keeping it in
TypeScript makes it unit-testable without a database.

---

## 4. Recommended design

**Reframe the problem.** This is not retrieval — it is **entity resolution**.
A dish name is a compositional record, not a bag of words:

```
"Mutton Biryani"      → { head: biryani, core: mutton,  diet: nonveg }
"Dal Fry"             → { head: fry,     core: dal,     diet: veg    }
"Fish Fry"            → { head: fry,     core: fish,    diet: nonveg }
"Prawn Biryani"       → { head: biryani, core: prawn,   diet: nonveg }
```

`dal fry` and `fish fry` share the head and **disagree on the core**. That
disagreement must be a *hard rejection*, not a score penalty — no amount of
similarity elsewhere should be able to outvote it.

### Stage 0 — Give the index a real schema (one-time)

Add to `default_images`: `name`, `aliases text[]`, `head`, `core text[]`,
`diet` (`veg|egg|nonveg`), `name_norm`. Backfill the 353 rows once, offline,
with a single batched LLM pass (~₹10 one-time) plus a human spot-check of the
diet column. Re-embed on `name + aliases`, not on `description`.

This is the highest-leverage change on its own: it restores the canonical
name the current schema discards.

### Stage 1 — Normalise (deterministic, free)

Reuse and extend `normaliseDishKey`. Strip noise modifiers (`special`,
`combo`, `half`, `full`, `house`, `our famous`) into a separate bucket so
they neither match nor penalise.

### Stage 2 — Hard constraint gate

Run **before** any scoring, against every candidate including vector hits:

1. **Diet gate** — query `veg` × candidate `nonveg` → reject, always.
2. **Core-ingredient gate** — closed vocabulary (~120 terms: chicken, mutton,
   fish, prawn, dal, paneer, egg, mushroom, gobi, …). Query names a core and
   candidate names a *different* one → reject. Candidate names none → allow,
   penalise (it is a generic image).
3. **Head-dish gate** — head must match or sit in a declared compatible set.

`dal fry` → core `dal`; `fish-fry` has core `fish` → **rejected before it is
ever scored**. `dal-fry-v5` survives and wins. If `dal-fry-v5` did not exist,
everything is rejected and the matcher **abstains** — which is the correct
answer.

### Stage 3 — Score the survivors (deterministic, free)

IDF-weighted token-set F1 over the 353-row library, plus per-token
Damerau-Levenshtein for typos (existing code), minus a specificity penalty for
unmatched modifiers.

IDF is doing real work here: `fry` appears in 7 filenames and `masala` in
dozens, so they carry almost no weight; `dal` and `prawn` are rare and carry
most of it. **IDF weighting alone would have caught this bug**, because the
only token `dal fry` and `fish fry` share is the near-worthless one.

### Stage 4 — Decide, with a margin and an abstain

```
accept  if  score ≥ τ_accept  AND  (score − runner_up) ≥ δ_margin
generic if  head and diet match but no specific hit
abstain otherwise → null → UI shows the upload box
```

The margin is what protects the biryani family: `mutton biryani` beats
`chicken biryani` on the `mutton` token by a wide IDF margin, and when it
doesn't, abstaining beats guessing. A
[reject option](https://arxiv.org/pdf/2308.08381) is a standard, well-studied
construct — the current system simply doesn't have one.

### Stage 5 — Embeddings demoted to a recall net

Keep pgvector, but: re-embedded on names (Stage 0), threshold raised to a
measured value, and **its candidates pass through the Stage 2 gates like
everything else**. The vector layer can suggest; it can never bypass a
constraint. Drop the gpt-4o-mini rerank entirely — Stages 2–4 do its job
deterministically and for free.

### What this costs and removes

Stages 1–4 are pure TypeScript over a 353-element array: a linear scan,
sub-millisecond, no network. For the large majority of items the OpenAI call
**disappears at query time**, which removes the per-item embedding spend, the
30/min rate limit, the ~2s latency, the rerank spend, and the OpenAI
dependency from the onboarding hot path. Cost becomes development effort only,
as required.

### Why this scales to 500+ and gets better, not worse

Adding variants makes IDF scoring **sharper** — more biryani rows means
`biryani` carries even less weight and `prawn`/`mutton` carry more. Adding
variants makes embeddings **worse** — neighbourhoods densify, and
mutton-vs-chicken biryani is already at 0.848 today. The two approaches scale
in opposite directions, which is the strongest argument for the recommended
one.

---

## 5. Verification plan (TDD, per CLAUDE.md §Feature workflow)

Build a golden set of **200–300 `(query → expected image | ABSTAIN)`** pairs as
`tests/acceptance/image-matching.test.ts`, committed failing first. It must be
majority **negative** cases, because precision is the thing that is broken:

- `dal fry` → **must not** return any `fish*` image (regression lock)
- `mutton biryani` → `mutton-biryani-v5`, never `chicken-biryani-v5`
- `prawn biryani`, `egg biryani`, `veg biryani` → each its own image
- every veg query → **never** a `diet: nonveg` image (hard invariant)
- `chicken 65 biryani` → `65-biryani`, not generic `biriyani`
- typo set: `chiken biriyni`, `panner tikka`, `mtton birayani`
- unknown dishes (`kothu parotta special`, `ragi koozh`) → **ABSTAIN**

Report precision, recall and abstain-rate separately. Target: **precision ≥
0.98 on specific matches**, with recall traded away freely — a missing image
shows an upload box, a wrong image shows a fish to a vegetarian.

Then: delete `KEYWORD_MAP`, make the DB the single source of truth, and
collapse `/api/images/match` and `findImagesForItems` onto one shared matcher
so the two paths cannot disagree again.

---

## Sources

- [Asymmetric model support — OpenSearch](https://opensearch.org/blog/asymmetric-model-support-optimizing-semantic-search-for-queries-and-documents/)
- [Semantic search — Sentence Transformers](https://sbert.net/examples/sentence_transformer/applications/semantic-search/README.html)
- [Sparse vs Dense Vectors](https://bigdataboutique.com/blog/sparse-vs-dense-vectors-how-lexical-and-semantic-search-actually-work)
- [Hybrid Search for RAG: BM25 + Dense Vector Search](https://denser.ai/blog/hybrid-search-for-rag/)
- [Hybrid search — Supabase Docs](https://supabase.com/docs/guides/ai/hybrid-search)
- [Search: Query Matching via Lexical, Graph, and Embedding Methods — Eugene Yan](https://eugeneyan.com/writing/search-query-matching/)
- [A Survey of Blocking and Filtering Techniques for Entity Resolution](https://arxiv.org/pdf/1905.06167)
- [Precision and Recall Reject Curves for Classification](https://arxiv.org/pdf/2308.08381)
- [Supabase/bge-small-en (Transformers.js)](https://huggingface.co/Supabase/bge-small-en)

---

# Part 2 — Should we keep embeddings at all?

Follow-up question: is the Part 1 design right, or is there a simpler
algorithm? And can we reach 95–99%?

Answer, measured rather than argued: **drop the embedding layer entirely.**
It is not earning its cost, and a deterministic lexical matcher beats it on
your own production data today.

## 2.1 The domain is a closed vocabulary — this is the whole argument

Measured over all 2,024 live products (1,067 distinct item names):

| Metric | Value |
|---|---|
| distinct item names | 1,067 |
| **distinct tokens across all of them** | **623** |
| tokens appearing 5+ times | 148 |
| share of all token instances those 148 cover | **74%** |
| tokens appearing exactly once (long tail) | 300 |
| mean tokens per item name | **2.57** |

**148 words cover three quarters of every menu on the platform.**

`text-embedding-3-small` is a 1536-dimension model over a ~50,000-token
general-English vocabulary. We are pointing it at a 623-word domain to
discriminate among ~150 food words on strings averaging 2.57 tokens. It is not
merely overkill — its generality is the *defect*. It places `dal` near `fish`
because both are proteins in curry contexts. That abstraction is exactly what
we do not want.

Embeddings buy exactly one capability: matching strings that share meaning but
no characters (`chowmein`→noodles, `ghosht`→mutton, `curd`→dahi). In an open
domain that set is unbounded. **In Indian restaurant food it is finite and
enumerable** — a few hundred alias pairs, written once. Anything an embedding
can do here, a static alias table does deterministically, testably, and free.

## 2.2 Prototype vs production — the live system loses

I built the lexical matcher as a single SQL query (IDF-weighted token Jaccard,
13 synonyms, a core-ingredient gate, no tuning, no `name` column — filenames
only) and ran it against all 1,067 real names.

Hard cases, prototype output:

| Query | Top-1 | Score | Runner-up | Verdict |
|---|---|---|---|---|
| `dal fry` | **dal-fry-v5** | 1.000 | dal-tadka 0.381 | **bug fixed, huge margin** |
| `fish fry` | fish-fry | 1.000 | 0.402 | correct |
| `mutton biryani` | mutton-biriyani | 1.000 | — | correct |
| `prawns biriyani` | prawn-biriyani | 1.000 | — | plural + spelling handled |
| `paneer 65` | paneer-65-v5 | 1.000 | chicken-65 0.464 | no protein bleed |
| `kothu parotta` | parotta | 0.718 | — | sensible generic |
| `ragi koozh`, `quiche lorraine` | — | — | — | **correct abstain** |
| `extra chicken piece` | chicken-fry | 0.193 | — | below threshold → abstain |

Then an A/B against what the live embedding system actually assigned. Of 1,054
comparable names, 285 confident disagreements. **Hand-audit of 35 random
disagreements: the lexical prototype is better in 26, tied in 6, worse in 2,
both wrong in 1.**

Live system's actual output on real menus:

| Menu item | Live system shows | Prototype |
|---|---|---|
| `mutton biryani` | biriyani *(generic)* | mutton-biriyani |
| `butter chicken` | grill-chicken | butter-chicken-v5 |
| `banjara chicken tikka` | **grill-paneer** | banjara-chicken-tikka |
| `veg. noodles` | **chicken-noodles** | veg-noodles |
| `tomato soup` | **chicken-soup** | cream-of-tomato-soup |
| `coconut uthappam` | **malai-chicken** | uthappam |
| `chicken fried rice` | chicken-rice | chicken-fried-rice-v5 |
| `masala puri` | pani-puri-plate | masala-puri |

## 2.3 The diet failures are already in production

Across all 1,750 live products carrying a library image:

> **53 products (3.0%) currently display a non-vegetarian photo on a
> vegetarian item.**

Real rows, live right now: `dal fry`→fish-fry, `veg fried rice`→chicken-rice,
`veg schezwan noodles`→chicken-noodles, `sweet corn soup`→chicken-soup,
`tomato soup`→chicken-soup, `mushroom tikka`→chicken-tikka, `tandoori
gobi`→chicken-tandoori, `dal tadka`→chicken-tandoori, `kadai veg`→kadai-chicken,
`paneer malai tikka`→malai-chicken, `coconut uthappam`→malai-chicken.

(A handful of the 53 are artefacts of the substring heuristic — e.g. `tandoori
non veg platter` contains "veg" — so the true figure is nearer 2.7%. The
substance is unchanged.)

The reported fish-fry bug is not an isolated incident. It is one row of a
recurring class, and the class is the most reputationally costly one the
product has.

## 2.4 What lexical genuinely cannot do

Sampled the residual — names sharing no token with the library. It splits
three ways:

1. **Alias-fixable (~30%)** — `raitha`, `parrota`, `panner manchuria`,
   `daal mash`, `rosemilk`, `pista kulfi`, `avcado falooda`. Needs alias and
   phonetic entries. **Deterministic, not semantic.**
2. **No such image exists (~50%)** — `vellayappam`, `puttu`, `kulcha`,
   `sirloin steak`, `turkish coffee`, `lahori khurchan`, `wheat khaboos`.
   **No algorithm can fix this.** Only photography can.
3. **Not food (~20%)** — `food name`, `testing`, `meal 1`. Abstain is correct.

**None of the three is helped by embeddings.** The embedding layer's only
contribution to buckets 2 and 3 today is to convert "I don't know" into a
confident wrong answer — which is precisely the reported bug.

## 2.5 Can we reach 95–99%?

Yes — but the metric has to be stated honestly, because two different numbers
get called "accuracy" and only one of them is ours to control.

**Precision on accepted matches — 99% is achievable.** This is a dial, not a
research problem: raise the accept threshold, require a margin over the
runner-up, enforce the diet and core-ingredient gates. Every point of precision
is bought with coverage.

**Coverage — capped by the library, not the algorithm.** There are 1,067
distinct dish names and 353 images. Roughly half the distinct names have no
correct image in the library at any price. No matcher reaches 99% coverage
against that ratio; only adding photographs does.

Realistic post-implementation target:

| Outcome | Share of distinct items | Precision |
|---|---|---|
| confident specific match | ~55–60% | **>= 99%** |
| head-dish generic (correct diet, right dish family) | ~25% | >= 95% |
| honest abstain -> upload box | ~15–20% | n/a |
| **veg item showing non-veg image** | **0%** | **hard invariant** |

Today the same library yields ~50% specific with a measured 3% diet-violation
rate and no abstain at all.

## 2.6 Revised recommendation

Part 1's Stages 0–4 stand. **Stage 5 is deleted.** Concretely:

- **Remove** the OpenAI embedding call, the gpt-4o-mini rerank, the
  `match_default_image` RPC and the `embedding` column from the query path.
  Drop `KEYWORD_MAP`.
- **Keep** the `default_images` table; add `name`, `aliases[]`, `head`,
  `core[]`, `diet`. Filenames alone already scored 1.000 on the hard cases —
  a real name column plus aliases is strictly better.
- **Matcher** = normalise -> alias/phonetic expand -> hard gates (diet,
  core ingredient, head dish) -> IDF-weighted token score -> accept on
  threshold *and* margin, else generic, else abstain. Pure TypeScript, one
  linear pass over 353 rows, sub-millisecond, no network.
- **Alias table** is the one ongoing input, and it is additive data, not code:
  seed it once (~300 entries) from the 623-token production vocabulary, which
  is already fully known.

This is simpler, faster, deterministic, unit-testable without a database,
debuggable ("matched on token `dal`, IDF 4.2"), has zero recurring cost, and —
demonstrated above on your own data — **more accurate than what runs today**.

A note on the premise that the current matcher is already good: on the sample
audited, it is not. It sends a generic biryani photo to `mutton biryani`,
`grill-chicken` to `butter chicken`, `grill-paneer` to a chicken tikka, and
non-vegetarian food to 53 vegetarian items. The library is good. The matcher
on top of it is losing most of the library's value.

---

# Part 3 — Scenario coverage: where token Jaccard passes and where it breaks

Follow-up question: a dish has three or four names (roti / chapati / chapathi /
phulka) pointing at one image. What does IDF-weighted token Jaccard do?

**Answer: on its own, it fails — and it fails unsafely.** Jaccard compares token
*sets*. `roti` and `chapati` share no token, so the score is exactly **0.000**.
Measured, not predicted.

This does not sink the approach, but it does change the architecture: Jaccard is
the **last** stage, not the whole algorithm. The synonym layer is load-bearing.

## 3.1 Measured — raw Jaccard on synonym scenarios

Same prototype as Part 2, no concept layer:

| Query | Top-1 | Score | Verdict |
|---|---|---|---|
| `chapathi` | roti-chapathi | 0.582 | passes by luck (filename happens to contain it) |
| `chapati` | — | **0.000** | **total miss** — one letter changed the outcome |
| `phulka` | — | **0.000** | total miss |
| `tawa roti` | butter-roti | 0.407 | wrong variant |
| `thayir sadam` | — | **0.000** | total miss |
| `meen varuval` | — | **0.000** | total miss |
| `mor` | — | **0.000** | total miss |
| `kozhi biryani` | chicken-biryani-v5 | 0.488 | right answer, **wrong reason** — matched only `biryani`; mutton-biryani would have scored the same |
| `cottage cheese tikka` | **chicken-tikka** | 0.291 | **veg → non-veg** |
| `ladies finger` | **fish-finger** | 0.432 | **veg → non-veg**, matched on `finger` |
| `chiken biriyani` | biriyani *(generic)* | 0.666 | typo defeats exact-token matching |

Two distinct failure modes, and the second is the dangerous one:

1. **Silent zero** — `phulka`, `mor`, `thayir sadam`. Harmless: abstain is the
   right outcome anyway, just for the wrong reason.
2. **Confident wrong answer via an incidental shared token** — `ladies finger`
   → fish-finger, `cottage cheese tikka` → chicken-tikka. Jaccard cannot tell a
   *head noun* from a coincidence. This is the same class of bug as fish fry,
   reached by a different route.

Note also `chiken biriyani` → generic `biriyani`: **pure Jaccard has zero typo
tolerance**, because tokens either match exactly or not at all.

## 3.2 The fix — match concept IDs, not strings

Stop comparing words. Map every surface form to a canonical **concept id**
first, then run Jaccard over concept ids:

```
roti, chapati, chapathi, chapatti, phulka   -> ROTI
curd, dahi, thayir                          -> DAHI
fish, meen                                  -> FISH
chicken, kozhi, murgh                       -> CHICKEN
prawn, prawns, eral                         -> PRAWN
dal, daal, paruppu                          -> DAL
paneer, cottage cheese                      -> PANEER
ladies finger, lady finger, bhindi, okra    -> OKRA
```

This is a controlled vocabulary / thesaurus — the same construct MeSH uses for
medicine. It is static data, written once.

Re-running the identical probes with a 50-entry concept table:

| Query | Before | After | Score |
|---|---|---|---|
| `chapati` | **0.000** | roti-chapathi | **1.000** |
| `phulka` | **0.000** | roti-chapathi | **1.000** |
| `roti` | butter-roti 0.523 | roti-chapathi | **1.000** |
| `tawa roti` | butter-roti 0.407 | roti-chapathi | **0.647** |
| `thayir sadam` | **0.000** | curd-rice | **1.000** |
| `meen varuval` | **0.000** | fish-fry | **1.000** |
| `kozhi biryani` | 0.488 *(luck)* | chicken-biryani-v5 | **1.000** |
| `eral biryani` | — | prawn-biriyani | **1.000** |
| `murgh tikka` | — | chicken-tikka | **1.000** |
| `paruppu` | — | dal-fry-v5 | **0.666** |
| `cottage cheese tikka` | **chicken-tikka** | paneer-tikka-platter | 0.444 |

Every synonym scenario resolves. The `roti / chapati / chapathi / phulka` family
— the exact case asked about — collapses to one image at 1.000.

## 3.3 Two residual holes the concept layer does *not* close

**Hole 1 — `ladies finger` still returns fish-finger (0.432).** OKRA and FISH are
different concepts, but both names contain `finger`, and the library has no okra
image. The concept layer cannot help; **the diet gate must catch this**
(OKRA = veg, FISH = nonveg -> hard reject -> abstain). This confirms the layered
design: concepts handle synonymy, gates handle safety. Neither substitutes for
the other.

**Hole 2 — `mor` abstains although `butter-milk.jpeg` exists.** The library
filename tokenises to `butter` + `milk`, so the single concept BUTTERMILK never
matches. **The concept table must support multi-token phrases**, matched
longest-first before unigrams (`butter milk` -> BUTTERMILK, `cottage cheese` ->
PANEER, `ladies finger` -> OKRA). This is a genuine design requirement found by
testing, not an afterthought.

## 3.4 How big is the concept table? Measured, not guessed

| | |
|---|---|
| library vocabulary | **256 tokens** |
| menu vocabulary (1,067 real names) | **613 tokens** |
| tokens present in both | **211** |
| tokens unknown to the library | 402 |
| …of those, appearing on **3+ menus** | **91** |
| …appearing on exactly one menu | 245 |

So the bounded, high-value work is **91 tokens**, and they sort themselves into
four buckets that need four different responses:

| Bucket | Examples | Response |
|---|---|---|
| spelling variants | `chilly`, `prawns`, `briyani`, `panner`, `schewan`, `kabab` | alias entry |
| true synonyms | `vegetable`->veg, `chowmein`->noodles | alias entry |
| portion / noise | `pcs`, `pieces`, `serves`, `250ml`, `quarter`, `half`, `combo`, `spl` | stopword |
| **no image exists** | **`roll` (28 menus!)**, `beef`, `maggi`, `sizzler`, `kulcha`, `falooda`, `samosa`, `stew` | **shoot a photo** |

A working table is **~250–350 entries**, one-time, and the query above tells you
exactly which entries to write. It is additive data, not code.

Product finding worth acting on separately: **`roll` appears on 28 distinct
menus and the library has no roll image.** That is the single highest-value
photograph to add, and no matcher change can substitute for it.

## 3.5 Final architecture — Jaccard is stage 4 of 5

```
1. normalise      lowercase, strip punctuation, drop portion/noise tokens
2. phrase concepts longest-match multi-token concepts  ("butter milk" -> BUTTERMILK)
3. token concepts  unigram surface -> concept id       ("phulka" -> ROTI)
   + phonetic/Damerau fallback for unseen typos        ("chiken" -> CHICKEN)
4. IDF-weighted Jaccard over concept ids  <-- the scoring step
5. hard gates + margin + abstain          (diet, core ingredient, head dish)
```

Stage 3's edit-distance fallback is what makes the table **self-limiting**: you
enumerate real synonyms only. Misspellings of an already-known concept
(`chiken`, `biriyaani`, `pannir`) are absorbed automatically by the existing
`damerauLevenshtein` in `fuzzyMatch.ts` — no new entry required. That is the
difference between a 300-entry table and an endless one.

## 3.6 Honest per-scenario accuracy

| # | Scenario | Example | Jaccard alone | Full pipeline |
|---|---|---|---|---|
| S1 | exact name | `curd rice` | ✅ 1.000 | ✅ ~100% |
| S2 | typo / transliteration | `chiken biriyani` | ❌ generic | ✅ ~97% (stage 3) |
| S3 | word order swapped | `biryani chicken` | ✅ 1.000 | ✅ ~100% |
| S4 | extra modifiers | `special chicken biryani full` | ⚠️ diluted | ✅ ~95% (stopwords) |
| S5 | compositional variant | `mutton` vs `chicken biryani` | ✅ | ✅ ~99% (IDF + gate) |
| S6 | **pure synonym** | `roti` / `chapati` / `phulka` | ❌ **0.000** | ✅ **~99%** (stage 2–3) |
| S7 | cross-language | `thayir sadam`, `meen varuval` | ❌ **0.000** | ✅ ~95% (stage 3) |
| S8 | veg/non-veg trap | `ladies finger` | ❌ **fish-finger** | ✅ abstain (stage 5) |
| S9 | multi-token concept | `mor` -> butter milk | ❌ 0.000 | ✅ (stage 2) |
| S10 | hypernym / generic | `biryani` | ✅ generic | ✅ generic |
| S11 | dish not in library | `kulcha`, `puttu` | ✅ abstain | ✅ abstain |
| S12 | junk input | `testing`, `meal 1` | ✅ abstain | ✅ abstain |

**Pure IDF-weighted token Jaccard alone: fails S2, S6, S7, S8, S9 — five of
twelve, two of them unsafely.** It is a good scorer and a poor matcher.

**Full pipeline:** the precision/coverage split from Part 2 is unchanged —
**>= 99% precision on accepted matches, ~55–60% specific coverage**, with S6/S7
moving from total failure into the specific-match band and S8 moving from a
confident wrong answer into a safe abstain. Coverage is still capped by the
353-image library, not by the algorithm.

## 3.7 One legitimate use for embeddings — offline, never at runtime

Building the concept table by hand is the only real labour in this design. Use
embeddings to *propose* it: cluster the 402 unknown tokens against the 256
library tokens offline, emit ranked synonym candidates, and have a human accept
or reject each one. Runs once on a laptop, output is a static TypeScript file,
**zero runtime dependency and zero recurring cost**.

That is embeddings in the role they are actually good at — fuzzy candidate
generation for human review — rather than as an unsupervised judge in the
request path, which is what produced the fish fry.

---

# Part 4 — Loophole taxonomy + working proof of concept

Runnable code: `docs/poc/image-matching/` (`matcher.mjs`, `golden.mjs`,
`run.mjs`, `validate.mjs`, `sweep.mjs`). Plain Node, no build step, no network
at match time. `node run.mjs` reproduces every number below.

## 4.1 The fifteen loopholes

Enumerated from the real menu data, not imagined. L1 is the scenario raised:
*the core word is right but the dish word is wrong.*

| # | Loophole | Example | Why it breaks a naive matcher |
|---|---|---|---|
| L1 | **partial anchor** — core right, head wrong/unknown | `chicken bhuna`, `mutton sukka` | one high-IDF token carries the match; the dish word is ignored |
| L2 | core-ingredient swap | `dal fry` -> fish fry | shared head, different identity |
| L3 | incidental token collision | `ladies finger` -> fish-**finger** | coincidence, not meaning |
| L4 | diet violation | `veg fried rice` -> chicken-rice | no veg/non-veg invariant |
| L5 | generic steals specific | `mutton biryani` -> plain biryani | specificity not scored |
| L6 | one dish, many names | `roti` / `chapati` / `phulka` | zero token overlap |
| L7 | typo / transliteration | `chiken biriyani`, `panner` | exact-token matching fails |
| L8 | word order | `rice curd` vs `curd rice` | phrase concepts are order-sensitive |
| L9 | portion / modifier noise | `chicken biryani (serves 2) 250ml` | noise dilutes the score |
| L10 | cooking-method flip | `chicken curry` vs `chicken fry` | same core, different picture |
| L11 | multi-dish combo | `veg manchurian with fried rice / noodles` | two dishes, one image slot |
| L12 | dish absent from library | `kulcha`, `puttu`, `sirloin steak` | must abstain, not approximate |
| L13 | junk input | `testing`, `meal 1` | must abstain |
| L14 | beverages / desserts | `fresh lime soda`, `oreo milkshake` | different vocabulary entirely |
| L15 | head present, no image | `chicken roll` (28 menus, no roll image) | must abstain, not substitute |

## 4.2 Result — golden set

99 labelled cases across all fifteen loopholes (`golden.mjs`):

```
GOLDEN SET: 99/99 = 100.0%
unsafe (veg item -> non-veg image): 0

L1  6/6   L2  9/9   L3  3/3   L4 15/15  L5  6/6
L6 13/13  L7  7/7   L8  3/3   L9  5/5   L10 6/6
L11 4/4   L12 8/8   L13 5/5   L14 6/6   L15 3/3
```

A self-written suite can overfit, so it is not the headline number — 4.3 is.

## 4.3 Result — held-out production data (1,067 real names)

Never designed against. No hand labels; the safety invariant needs none.

| | live system | PoC |
|---|---|---|
| **veg item shown a non-veg image** | **21** | **0** |
| specific match | — | 54.2% |
| generic (right family, right diet) | — | 27.5% |
| honest abstain | none | 18.4% |
| coverage | 86% (much of it wrong) | 81.6% |

Fixed by the PoC on real rows: `daal fry`->dal-fry-v5 (live: fish-fry),
`veg fried rice`->veg-fried-rice-v5 (live: chicken-rice), `dal tadka`->dal-tadka-v5
(live: chicken-tandoori), `mushroom tikka`->mushroom-tikka (live: grill-paneer),
`egg fried rice`->egg-fried-rice-v5 (live: chicken-rice), `chicken dum biryani`
->chicken-biryani-v5 (live: generic biriyani), `prawn curry`->prawn-curry-v5
(live: prawn-biriyani), `chicken fry`->chicken-fry (live: chicken-**pizza**).

## 4.4 Five gates — each one earned by an observed failure

Every gate was added because a measured case failed, not by anticipation.

| Gate | Rule | Failure that forced it |
|---|---|---|
| 1 diet | veg query may never receive a non-veg image | `veg fried rice` -> chicken-rice |
| 2 core | different identity-bearing ingredient -> reject | `dal fry` -> fish-fry |
| 3 head | different dish form -> reject | `chicken curry` -> chicken-fry |
| 4 no invented protein | query names no core -> candidate may not have one | `lemon` -> lemony-**chicken**; `loaded fries` -> fried-**chicken**-loaded-fries |
| 5 generic needs a head | shared core alone is not a picture | **`mutton sukka` -> mutton-biryani** (L1 — the reported scenario) |

Gate 5 is the direct answer to the question asked. A shared *core* says nothing
about what the plate looks like: "mutton" does not imply biryani. A generic
answer therefore requires a shared **head**, or a candidate with no head of its
own, or a bare single-core query (`paruppu` -> any dal dish is fair).

Two further corrections found by testing:

- **Unknown tokens were being given the maximum IDF weight (~7.0)**, so any
  unrecognised adjective swamped the score and forced an abstain. Weighting them
  at 1.0 lifted specific matches from 35.3% -> 56.7% with no loss of safety —
  Gate 5 already prevents an unknown token from producing a confident match.
- **`fries` (a potato dish) was conflated with `fry` (a method)**, sending
  `loaded fries` to `fried-wings`. Split into two concepts -> `classic-french-fries`.

## 4.5 So what accuracy is actually reachable?

Precision is a threshold dial. Measured sweep over the 1,067 held-out names:

| accept threshold | specific matches | audited precision |
|---|---|---|
| **1.00** (exact concept-set match) | 253 (23.7%) | **~100%** |
| 0.85 | 325 (30.5%) | ~97% |
| 0.75 | 400 (37.5%) | ~95% |
| **0.55** (PoC default) | 632 (59.2%) | **~85%** |

Hand-audited three independent random samples of 28 specific decisions. At the
0.55 default, ~24/28 are right. The misses are all *right family, wrong dish*
— `malai broccoli`->malai-kofta, `orio shake`->kitkat-milkshake (needs brand
concepts), `prawns fried rice`->prawn-fry. **None is a diet violation; the
safety invariant held at every threshold.**

**Honest answer to "can we hit 95–99%?"**

- **99% precision: yes** — accept only at >= 0.85 and label the rest *generic*.
  Costs coverage: ~30% specific instead of ~59%.
- **95% precision at ~37% specific coverage** is the balanced setting.
- **99% of items getting the exactly-right image: no**, and no algorithm can.
  1,067 distinct names against 353 photographs. That gap closes with a camera,
  not with code.

Recommended shipping configuration: **accept 0.75 (≈95% precision, 37.5%
specific), generic 0.30, margin 0.05, all five gates on, diet violations zero.**
Then raise coverage by adding images — starting with `roll`, which appears on 28
menus and has no photograph at all.

## 4.6 Cost and maintenance

Match is one linear pass over 353 rows: no network, no model, no API key, runs
in well under a millisecond. The concept table is ~180 entries today and the
production vocabulary that bounds it (623 tokens) is already fully known. Every
decision is explainable — the PoC prints the concepts it matched on, so
"why did this item get this picture?" is answerable from a log line.
