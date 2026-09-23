---
slug: ai-page-limits
version: 1
approved:
---

# Design v1: AI menu page limits per store

- Architecture: [architecture-v1.md](architecture-v1.md) (verdict STOP-FOR-OWNER on Q1 only)
- UI (Claude Design): https://claude.ai/artifact/NBcFirA5Zyd9xiknL5qm2R. 39 artboards: 13 states × phone 390, tablet 820×1180, desktop 1440×900

## What changes for existing users
All rows below are with `AI_PAGE_LIMITS` ON. With it OFF, every row is unchanged.

| Flow | Bucket | Who | What they will see | Mitigation |
|---|---|---|---|---|
| **Bulk upload, expired unpaid stores** | **removed-or-replaced** (AI upload locked) | **53 stores** | "Your trial has ended. Pay ₹299 to use AI upload", with a link to Subscription | Contract AC3. Adding items by hand is untouched. Only 4 users have ever used bulk import |
| **Bulk upload, paid stores: 15 units/day → 5 pages/billing month** | **removed-or-replaced** (allowance replaced) | **4 paid stores** | "N of 5 pages left · resets <date>" | Owner-approved at intake. Counters start at 0 at go-live |
| Bulk upload, trial stores | changed | 3 now, plus all new trials | 2 pages for the whole trial, then "Pay ₹299" | Onboarding's 15 pages is the main path for a trial menu |
| Onboarding re-scan | changed | New owners who scan again | Re-scans share the 15 pages. When they run out, "15 pages used", with "skip / add by hand" | Failed pages are given back. A first scan can never be refused |
| Bulk upload accepts PDF | changed (added) | Stores with pages left | PDF picker, 1 page = 1 page | Pages are also counted in the browser, and the server reservation backs that up |
| Bulk extract per-user $1/day cap (AC9) | changed | Abusers only | 429 | A legit owner cannot reach it |
| Bulk insert gate | changed (invisible) | Importers | "photos used today" wording gone | Per-user $ cap instead of the day quota |
| Onboarding complete | changed (invisible) | New stores | nothing | Binding the pages to the new store is best effort; launch never fails because of it |
| All 7 critical flows, manual add/edit, store deletion | unchanged | — | — | No payments, auth, shop or middleware code touched |

## Architecture in brief
- New table `ai_page_usage` plus 3 server-only functions (`reserve_ai_pages`, `refund_ai_pages`, `bind_onboarding_pages`), in expand-only migration `057_ai_page_usage.sql`, with RLS on and no policies.
- Pages are reserved atomically before any AI call (a conditional UPDATE). Pages not read `ok` are refunded in `finally`, which also covers aborts.
- Onboarding: each user has one open 15-page bucket (unique index) until `/complete` binds it to the new store. Abandoning onboarding does not reset it.
- Bulk: one row per store per period. A paid period is the 30-day window ending at `store_expires_at`, so an early renewal can't reset pages. A trial period is fixed. An expired store gets 0. The store id is checked for ownership before the body is read.
- Flag `AI_PAGE_LIMITS` is a constant `false` in `productFlags.ts`, and go-live is a one-line commit. New `GET /api/bulk-import/allowance` feeds the modal.

## Resource footprint (headline)
- AI: ₹0.95–₹1.81 per page. A paid store is about ₹5–₹9.4 a month (ceiling ₹15). The **worst case** is about ₹39.6 a month, when every page hits the output cap and retries. A trial store is ₹16–₹31 one-off (15 + 2 pages).
- DB: under 100 rows a year. No new external service or paid API, no memory change.

## Decisions needed from the owner
- [ ] **Expired unpaid stores lose AI bulk upload (53 stores).** Yes or no?
- [ ] **Paid stores go from 15 units/day to 5 pages per billing month (4 stores).** Yes or no?
- [ ] **Q1 (architect STOP):** the onboarding refusal messages must be in Tamil too, or a guard test fails. Recommendation: **Tamil OK** for just these two onboarding messages; everything else stays English:
  - `PAGE_LIMIT`: "This store's 15 AI pages are used. Your items so far are saved. Continue, and add any missing dishes by hand." / "இந்தக் கடையின் 15 AI பக்கங்கள் பயன்படுத்தப்பட்டுவிட்டன. இதுவரை உள்ள உணவுகள் சேமிக்கப்பட்டுள்ளன. தொடர்ந்து, விடுபட்ட உணவுகளை நீங்களே சேர்க்கவும்."
  - `PAGE_LIMIT_UNAVAILABLE`: "We couldn't check your pages. No pages were used. Check your internet and try again." / "உங்கள் பக்கங்களைச் சரிபார்க்க முடியவில்லை. எந்தப் பக்கமும் பயன்படுத்தப்படவில்லை. இணைய இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்."
  - The alternative is "edit the test", which needs your explicit instruction.
- [ ] The worst-case ₹39.6/month is above the ₹15 ceiling. Accept it, since the typical case is ₹5–₹9.4 and business QA will price it?
- [ ] Architect's defaults D1–D4 (the per-user cap is behind the flag; `/insert` uses the $ cap; no foreign key to `sites`; bulk uses the per-page extractor when ON). Accept?

## Feedback
