# Current Goal

Feature: **AI menu page limits per store** (`ai-page-limits`). Every store gets a
durable, plan-matched allowance of AI-read pages (a photo, or one PDF page), so
the AI cost of a trial or a ₹299 shop is known and capped.

Contract (signed 2026-09-23): `docs/features/ai-page-limits/contract.md`.
Design (approved 2026-09-23): `docs/features/ai-page-limits/design-v1.md`,
`docs/features/ai-page-limits/architecture-v1.md`.
Flag: `AI_PAGE_LIMITS` in `src/lib/platform/productFlags.ts`, default OFF.

Previous goal (resilient menu extraction) is complete; see `docs/PLAN.md` history and git log.

Token per Ralph loop: 3 iterations

## Acceptance criteria (each maps to a test in `apps/web/tests/acceptance/ai-page-limits.test.ts`)

- [ ] **AC1**: onboarding scan allows at most 15 pages per store, lifetime; a scan past 15 is refused before any AI call with `PAGE_LIMIT` and pages left.
- [ ] **AC2**: bulk upload on a trial store allows 2 pages for the whole trial; never resets.
- [ ] **AC3**: bulk upload on an expired unpaid store allows 0 pages; the modal offers "Pay ₹299" → `/manage/subscription`; manual add keeps working.
- [ ] **AC4**: bulk upload on a paid store allows 5 pages per billing month, resetting on the payment date (`store_expires_at`); the UI shows the reset date.
- [ ] **AC5**: pages are reserved atomically in Postgres before any AI call; 20 concurrent requests cannot exceed the allowance.
- [ ] **AC6**: pages the AI fails to read are refunded; only `ok` pages stay counted.
- [ ] **AC7**: the counter is durable across restarts/redeploys.
- [ ] **AC8**: bulk upload accepts PDF; each PDF page is one page; a PDF longer than what is left is refused in the browser.
- [ ] **AC9**: bulk extract enforces the per-user AI spend cap (`aiSpendAllowed(userId)` + `spendKey`).
- [ ] **AC10**: with `AI_PAGE_LIMITS` OFF, onboarding and bulk upload behave exactly as today.
- [ ] **AC11**: the allowance is checked against the store's owner; a user cannot draw on another's store.
