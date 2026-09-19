# Current Goal

Feature: **Resilient menu extraction** — onboarding scans survive a burst of
simultaneous signups on the existing single `basic-xxs` instance (512MB), cannot
be used to crash the server, cannot run up an unbounded OpenAI bill, and never
lose menu items silently.

Why (measured 2026-09-19, see PROGRESS.md):
- The extract path holds **~7× the upload size in RAM** (27MB for a 10-photo
  scan, 193MB for one maximum-size body). Two maximum-size requests from one
  logged-in account exhaust the instance.
- Every Pass 1 call reserves `max_tokens: 16_000` against the OpenAI
  tokens-per-minute limit while using ~3k. A burst of signups is rejected with
  429, and `Promise.allSettled` turns that into a menu with pages missing and a
  success message.
- The only spend control is an in-memory counter that every deploy resets.

Previous goal (concept image matching) is complete; see git history.

Token per Ralph loop: 3 iterations

## Acceptance criteria (each maps to a test)

- [ ] **AC1 — Bounded body.** A body over the limit, including a chunked one
      with no Content-Length, is refused after reading at most limit + one
      chunk. It is never fully buffered.
- [ ] **AC2 — Memory admission.** Uploads are admitted against a byte budget
      derived from the measured 7× amplification. Over budget → the request
      waits briefly, then gets `503 BUSY` with `Retry-After`, **before its
      body is read**.
- [ ] **AC3 — One scan per user.** A second concurrent scan by the same user
      gets `409 SCAN_IN_PROGRESS`.
- [ ] **AC4 — Pages fail alone.** Each photo is its own extraction call. A page
      that fails is reported in `failedPages`; every other page's items are
      returned.
- [ ] **AC5 — Truncation recovered.** `finish_reason: "length"` retries that
      page with a larger budget, and truncated JSON is salvaged up to the last
      complete item.
- [ ] **AC6 — Rate-limit fallback.** A page rejected with 429 twice on gpt-4o is
      retried on gpt-4o-mini (separate rate-limit pool).
- [ ] **AC7 — Right-sized reservations.** First attempt per page uses
      `max_tokens` ≤ 2,500. The OpenAI client has an explicit timeout and no
      hidden SDK retries.
- [ ] **AC8 — Token scheduler.** Calls are admitted so that tokens reserved in
      any rate window never exceed the limit. The limit is learned from
      OpenAI's `x-ratelimit-*` headers and `retry-after` is honoured.
- [ ] **AC9 — Dedup keeps section-relative names.** "Plain ₹60" under Dosa and
      under Uthappam are both kept; a duplicate with no category merges.
- [ ] **AC10 — Spend guard.** When the daily AI budget is spent, extract
      returns `503 AI_PAUSED` without calling OpenAI.
- [ ] **AC11 — Eligibility before spend.** A user at the store limit is refused
      at extract, before any OpenAI call.
- [ ] **AC12 — Onboarding UI.** BUSY auto-retries with a queue message;
      partial scans are disclosed; a "skip, add items manually" path exists;
      errors are shown in Tamil and English; drag-drop works on desktop; the
      remove-photo control is visible on touch screens.
- [ ] **AC13 — Load.** 50 simultaneous onboardings against a rate-limited fake
      OpenAI: every scan completes, zero items lost, admitted memory never
      exceeds the budget.

## Out of scope (needs owner approval — schema / infra / dependency)

- Direct-to-storage uploads + durable job table (migration + storage bucket).
- Durable per-user AI quota in Postgres (migration).
- PDF menus (pdf.js dependency or a different OpenAI input path).
