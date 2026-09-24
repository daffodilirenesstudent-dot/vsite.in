---
slug: ai-page-limits
signed: 2026-09-23
risk: med
flag: AI_PAGE_LIMITS
cost_ceiling_inr_per_shop_month: 15
approved_sensitive_paths: [apps/web/supabase/migrations/, apps/web/src/lib/platform/productFlags.ts]
approved_dependencies: []
---

# Feature Contract: AI menu page limits per store

## Goal
AI menu reading (gpt-4o) is vsite's biggest variable cost, and today it is
bounded only by an in-memory daily counter that every deploy resets. The
inventory bulk upload has no per-user cap at all, so one account can spend up
to the global $25/day. This feature gives every store a fixed, durable
allowance of AI-read pages (a photo, or one page of a PDF), matched to its
plan, so the AI cost of a trial or a ₹299 shop is known and capped.

## Acceptance criteria
- **AC1**: Onboarding scan allows at most **15 pages per store**, lifetime. A
  scan that would take the store past 15 is refused before any AI call with
  code `PAGE_LIMIT`, and the response says how many pages are left.
- **AC2**: Inventory bulk upload on a store **in trial** allows at most **2
  pages per store for the whole trial**. It never resets.
- **AC3**: Inventory bulk upload on a store whose **trial ended unpaid** allows
  **0 pages**. The modal shows "Pay ₹299" linking to `/manage/subscription`,
  and adding items by hand keeps working.
- **AC4**: Inventory bulk upload on a **paid** store allows at most **5 pages
  per store per billing month**. The window resets on the store's payment date
  (anchored on `site_subscriptions.store_expires_at`), and the UI shows the
  reset date.
- **AC5**: Pages are **reserved atomically in Postgres before** any AI call.
  Twenty concurrent requests cannot together exceed the allowance.
- **AC6**: Pages the AI **fails to read are refunded**. Only pages reported
  `ok` stay counted.
- **AC7**: The counter is **durable**: a server restart or redeploy does not
  reset it.
- **AC8**: Inventory bulk upload **accepts PDF** (pages rendered in the
  browser via `pdfPages.ts`, as in onboarding). Each PDF page counts as one
  page, and a PDF with more pages than the remaining allowance is refused in
  the browser with a clear message.
- **AC9**: `bulk-import/extract` enforces the **per-user AI spend cap**
  (`aiSpendAllowed(userId)` plus `spendKey`), as onboarding already does.
- **AC10**: With `AI_PAGE_LIMITS` **OFF**, onboarding and bulk upload behave
  exactly as today (backward-compat test).
- **AC11**: The allowance is checked **against the store's owner**. A user
  cannot draw on a store they don't own.

## Non-goals
- No change to price, plan or payment flow. `src/lib/payments/` is not touched.
- No way to buy extra pages (a future feature).
- No Tamil copy for the new messages (owner decision 2026-09-23: English only).
- No change to manual item add or edit.
- No change to AI image matching or descriptions (cheap, and already quota'd).

## Behaviour
Bulk upload modal (`/manage/product-inventory`) shows "N of M pages left",
with "this trial" / "this month · resets <date>" wording. Photos and PDFs can
be picked, and picking more than what's left is stopped before upload. When
nothing is left: trial → "Trial pages used. Pay ₹299 for 5 pages every month";
expired → "Your trial has ended. Pay ₹299 to use AI upload"; paid → "Monthly
pages used. Resets on <date>". All three keep the "add by hand" path visible.
Onboarding shows "up to 15 pages" as today. A retry after failed pages can use
the refunded pages. Copy: English only, drafted by Claude, approved at the
design gate.

## Edge cases
- A scan where some pages fail: only `ok` pages stay counted.
- The client aborts mid-scan: the reservation is released for unread pages.
- A PDF with more pages than are left: refused client-side, with a server cap
  as backstop.
- A store paid during its trial: paid rules apply (5 per billing month).
- A paid store lapses: 0 pages until renewal.
- A DB error during reservation: refuse with a retry message (fail closed, no
  AI spend).
- Existing shops at go-live: counters start at 0; stores already onboarded are
  unaffected.

## Existing features
- Paid shops' current bulk allowance (15 AI work units per day, per user)
  **changes to 5 pages per store per billing month** for all shops at go-live
  (owner-approved). The `bulk_import_usage` table stays in place (expand-only)
  and is no longer the gate while the flag is ON.
- The onboarding scan becomes lifetime-limited per store (it's 10/hour +
  $1/day today).

## Rollout
Flag `AI_PAGE_LIMITS`, default OFF. At go-live: ON for everyone.

## Success measure
- In production, no store exceeds 15 onboarding / 2 trial / 5-per-month pages.
- AI spend per paid shop stays at or below ₹15/month.

## Deadline / priority
- No fixed date (default; owner may correct).

## Decisions at design gate
Approved 2026-09-23 (design-v1).
- Expired unpaid stores lose AI bulk upload (53 stores): **yes**.
- Paid stores move from 15 units/day to 5 pages per billing month (4 stores): **yes**.
- Q1: **English only**, no Tamil for the new onboarding codes. Owner explicitly instructs a NARROW change to tests/acceptance/resilient-extraction.test.ts AC12 ("every error code has Tamil"): exempt exactly PAGE_LIMIT and PAGE_LIMIT_UNAVAILABLE; every existing code keeps its Tamil requirement.
- Cost: no money tracking / no rupee meter. Owner target: **≤ ₹35 AI spend per trial store for the whole trial**, met by pages alone: 15 onboarding + 2 bulk = 17 pages per trial store (₹16–31 at ₹0.95–1.81/page). Paid: 15 onboarding pages per store + 5 bulk pages per billing month; the worst case (~₹40/month) is accepted as page-bounded.
- Limits stay per store (owner: "Each store"); onboarding stays 15 (owner: "not 50 its 15").
- Architect defaults D1–D4 accepted as designed (owner approved the plan).
- Owner amendment 2026-09-23 (during build, verbatim): "only english in the onboarding no tamil". Remove ALL Tamil from the onboarding flow (scan messages, PDF/partial notices, any Tamil UI text), not just the new codes. Done as a separate task on this branch; the resilient-extraction AC12 guard changes to require an English message for every code (owner-approved behaviour change).
- Owner decisions at QA STOP #7, 2026-09-23: (a) Tamil removal from onboarding ships UNSWITCHED (not behind AI_PAGE_LIMITS) - yes. (b) Per-store limits accepted incl. per-owner exposure (2 trial stores, store re-creation); revisit only on observed abuse. (c) Fix the pre-existing bulk OCR-fallback spend leak IN THIS RELEASE (fallback calls count against the per-account daily cap).
