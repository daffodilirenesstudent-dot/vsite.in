---
slug: ai-page-limits
qa: business
round: 1
date: 2026-09-23
diff: git diff master...HEAD (feat/ai-page-limits, 28 files)
previous_tag: release/baseline-20260923
---

# Business QA: AI menu page limits per store (round 1)

## Summary

**This review has to stop for the owner because the business-context file is missing, not because the feature is costly.**
`.claude/docs/business-context.md` does not exist. Only `business-context.template.md` is there, partly
filled (last_updated 23/09/2026). Under the Step 0 rules that is an automatic STOP-FOR-OWNER. The template
also says 0 paying customers and ₹0 MRR, but the live database has 4 paid stores. The owner has to settle that.

On the numbers, the feature is good for the business:

- **It adds no fixed cost.** There is no new service, no plan upgrade and no memory change on the 512MB box.
  Break-even needs **0** extra customers.
- **It lowers AI risk.** Today bulk upload gives every store 15 units a day with no end, including the 53
  expired unpaid stores, and onboarding re-scans have no lifetime limit. After go-live the AI spend is
  capped per store by pages.
- **A trial store meets the ₹35 goal.** At full use (all 17 pages) it costs about **₹16–₹31**. A store with a
  typical menu (median 14.5 items, 1–3 pages) costs about **₹1–₹6**. The ₹134–₹145 "pathological" case
  needs about 100 dishes on every one of 17 pages, about 1,700 dishes in all. The biggest live store has 235.
  A real menu will almost never cause it; only deliberate misuse will.
- **A paid store usually fits the ₹15/month ceiling.** Typical use is **₹5–₹9.4 a month**. The worst case,
  about ₹40, is over the ceiling. The owner accepted that in the contract.
- **The real gap is per owner, not per store.** One owner can have 2 trial stores at once (up to about
  ₹62 at full use) and can delete and re-create stores. The per-user $1/day cap (about ₹96/day, held in memory) is the only daily bound on that.

Nothing here needs a Supabase or DigitalOcean upgrade. Runway is not affected.

## Resource table

Existing counts, all `measured (Supabase execute_sql, 2026-09-23)`: 60 sites, 32 owners, 4 paid now,
3 in trial, 53 expired unpaid. 7 sites created in the last 30 days, 17 in the last 90 days. 4 users have
ever used bulk import (7 rows). Median 14.5 items per store (all 60 sites; p90 80.5, max 235). 5 stores
have over 100 items. 12 owners have 2 or more sites, and one owner has 11.

| resource | plan limit | current use | added per shop per month | added from EXISTING shops alone | runway until the limit | upgrade needed | upgrade cost ₹/mo |
|---|---|---|---|---|---|---|---|
| Supabase DB size | 500 MB, `from owner template (Free)` | **29.1 MB** (30,534,803 B), `measured (pg_database_size)` | paid: 1 row ≈ 0.3 KB; trial: 1 row for life; onboarding: 1 row per store, `estimated (≈200 B row + 3 indexes)` | ≤ ~100 rows ≈ **30 KB** on day 1 (60 stores + 32 open onboarding buckets), `estimated` | Effectively unlimited. The feature adds < 50 KB a year against 471 MB of headroom, `estimated` | No | 0 |
| Supabase storage | 1 GB, `from owner template (Free)` | not given by the owner | **0**: extract stores no files; PDFs are rendered in the browser, `measured (code)` | 0 | unaffected | No | 0 |
| Supabase egress | 5 GB/month, `from owner template (Free)` | not given by the owner | allowance GET ≈ 0.3 KB per modal open, plus 1–4 small RPC calls per scan, `estimated` | burst: 60 stores × 30 modal opens ≈ **0.5 MB/month**, `estimated` | unaffected | No | 0 |
| Supabase MAU | not given | not given | 0 (no auth change) | 0 | unaffected | No | 0 |
| DO instance memory (basic-xxs) | 512 MB, `measured (apps/web/.do/app.yaml: basic-xxs, 1 instance)` | not given | **0 per request**. Bulk body is still ≤ 10 MB → ≤ ~70 MB at the measured 7× amplification (docs/GOAL.md). Onboarding ≤ ~84 MB (15 × 800 KB × 7). Both still go through `admitUpload`, `measured (code)` | 0. No new cron or job; `.do/` is not in the diff, `measured (git diff)` | unaffected | No | 0 |
| DO bandwidth | not given | not given | negligible (JSON of a few hundred bytes) | negligible | unaffected | No | 0 |
| OpenAI spend (gpt-4o + gpt-4o-mini) | no plan limit. App caps: global **$25/day ≈ ₹2,393**, per user **$1/day ≈ ₹96**, both in memory and reset on deploy, `measured (aiSpendGuard.ts defaults; production env values unknown)` | not given (no spend telemetry per store) | paid: **₹5–₹9.4** typical, **≈₹40** worst; trial: **₹16–₹31** once at full use (₹1–₹6 for a typical menu); expired: ₹0, `estimated (prices below)` | Burst, all existing stores at full allowance on day 1: paid 4 × 5 = 20 pages → ₹19–₹36 (worst ₹158); trial 3 × 2 = 6 pages → ₹6–₹11 (worst ₹48); expired 0. **Total ₹25–₹47 typical, ₹206 worst**, `estimated` | Not a plan limit. The day-1 burst is < 10% of the $25/day global cap | No | 0 |
| OpenAI rate tier / TPM | not given | not given | fewer calls than today (lifetime and monthly caps replace 15/day) | lower than today | unaffected | No | 0 |
| WhatsApp, Firebase OTP, Razorpay | not given | not given | 0 (not touched), `measured (git diff)` | 0 | unaffected | No | 0 |

Prices used (**supplied by the orchestrator, not by the owner file**): gpt-4o $2.50 / $10 per 1M tokens,
gpt-4o-mini $0.15 / $0.60, USD/INR 95.7 (23 Sep 2026).

AI cost per page, `estimated (architecture-v1 §6 token counts; menuExtractor.ts caps)`:
- Typical page: 1,555 input tokens × $2.50/M = $0.0039, plus 600–1,500 output tokens × $10/M = $0.006–$0.015. **Total $0.0099–$0.0189 ≈ ₹0.95–₹1.81.**
- Pathological page: it hits the 2,500-token cap and then takes the 5,000-token retry. Input 3,110 tokens ($0.0078), output 7,500 tokens ($0.075). **Total $0.0828 ≈ ₹7.92.**
  - One 15-page onboarding scan has a 45k output budget (`SCAN_OUTPUT_BUDGET`). That caps it at about $0.52 ≈ **₹49**, not 15 × ₹7.92.
  - The full ₹7.92 per page only applies if the pages are sent one scan at a time.
- Descriptions (gpt-4o-mini, one batch of 50 items): ≈ **₹0.14 per batch**.

## Unit economics

**New fixed ₹/month: ₹0**, `measured (git diff: no new service, no env var, no .do/ change, no new dependency)`.

**New variable ₹ per shop per month**, `estimated`. These are the caps; today's spend is uncapped.

| Store state | Pages | Typical | Worst | vs contract ceiling ₹15/shop/month |
|---|---|---|---|---|
| Paid, per billing month | 5 bulk | 5 × ₹0.95–₹1.81 + ≤ ₹0.3 descriptions = **₹5–₹9.4** | 5 × ₹7.92 = **₹39.6** (≈₹40) | Typical: **within**. Worst: **exceeds by ₹25**. Owner accepted this in the contract ("worst case (~₹40/month) is accepted as page-bounded") |
| Trial, once per store | 15 onboarding + 2 bulk = 17 | full use **₹16–₹31**; typical menu (1–3 pages) **₹1–₹6** | ₹65 (one 15-page scan + 2 bulk) to **₹134–₹145** (17 single-page pathological scans + descriptions) | This is acquisition cost, not a monthly cost. Owner target ≤ ₹35 per trial store: **met at full typical use (₹4 headroom); missed only in the pathological case** |
| Expired unpaid | 0 | ₹0 | ₹0 | none (down from today's 15 units a day) |

**How likely is a trial store to go over ₹35?** `estimated (measured item counts)`
- To cost more than ₹35, the 17 pages must average more than ₹2.06 each. That needs several pages with
  about 100 or more dishes on each page.
- Measured: only 5 of 60 stores have more than 100 dishes **in total**, and the largest has 235. Spread
  over 2–3 pages, 235 dishes is about 80 per page. That fits the 2,500-token first attempt.
- My estimate: **under 2% of real trial stores** go over ₹35. Nearly all of those would be dense multi-page menus that also re-scan a lot.
- The ₹134 case needs about 1,700 dishes. That means misuse, for example uploading pages of dense text.
- This is an estimate. There is no ₹ telemetry per store, and the ledger records pages, not rupees.

**Per trial owner (the gap the per-store target leaves open)**, `estimated`
- `TRIAL_STORE_LIMIT = 2` stores at once (measured in storeEligibility.ts), so one trial owner can use
  34 pages, about **₹32–₹62** at full use.
- Deleting a store and creating a new one opens a fresh 15 onboarding pages (risk R1). The limits on that:
  `/complete` allows 5 an hour, and the per-user **$1/day ≈ ₹96/day** cap is in memory and resets on every deploy.
- Measured: 12 owners already have 2 or more sites, and one has 11. Churning owners exist.

**Contribution margin per paid shop** (AI only), `estimated`
- Typical: ₹299 − ₹9.4 = **₹289.6 (96.9%)**.
- Worst: ₹299 − ₹39.6 = **₹259.4 (86.8%)**. That is inside an 85% target but under a 90% target.
- Left out because the owner has not given them: Razorpay fee, WhatsApp cost, and a per-shop share of DigitalOcean.
- For context only: DO at $10 ≈ ₹957/month (FX supplied by the orchestrator) spread over 4 paid stores is
  about ₹239 per paid shop. Company-wide margin is therefore far below 85–90% with or without this feature.
  This is pre-existing and not caused by it.

**Break-even: additional paying customers needed**

To keep margin m on N new customers who each pay P, cost V each, and need a new fixed cost ΔF:

`N · (P − V) − ΔF ≥ m · N · P   ⇒   N ≥ ΔF / (P · (1 − m) − V)`

- With ΔF = ₹0, P = ₹299, V = ₹9.4 and m = 0.85: N ≥ 0 / (44.85 − 9.4) = **0 additional customers**.
- With m = 0.90: N ≥ 0 / (29.9 − 9.4) = **0**.
- Caveat: at the worst-case V = ₹39.6 and m = 0.90, the denominator is below zero (29.9 − 39.6). A worst-case
  paid store cannot reach a 90% margin on its own, however many there are. At m = 0.85 it still can (44.85 − 39.6 = 5.25 > 0).
- The owner wrote the target as "85 - 90 %". I need one number.

**AI acquisition cost per converted store**, `estimated`
- Measured conversion: 4 paid out of 57 stores past trial ≈ 7%.
- AI cost per paid store won: ₹1–₹6 / 0.07 ≈ **₹14–₹86** (typical menus). At full use, ₹31 / 0.07 ≈ **₹443**.
- At ₹289.6 a month, ₹443 is paid back in about **1.5 months**.

**Leaks that pages do not meter** (low likelihood, abuse only, and pre-existing or narrowed by this feature), `measured (code)`
- **Refund loop (R2).** A page that burns tokens and still fails (`truncated` with nothing salvaged, about
  ₹7.9) is refunded and can be retried. Rate limits (onboarding 10/hour, bulk 20/hour) and the $1/day per-user cap bound it.
- **Bulk OCR fallback** when a scan returns 0 items (`bulk-import/extract`):
  - It runs `imageToMenuText` (gpt-4o-mini, 5 × ≈₹0.64). That call records no spend in `aiSpendGuard`.
  - It then runs `extractMenuItems` (gpt-4o, up to 16k output tokens, ≈₹15) with no per-user `spendKey`.
  - Total: up to about **₹21 per request** that neither the page ledger nor the per-user cap sees.
  - Only the global $25/day cap bounds it. This path is old, and before this feature bulk extract had no
    per-user cap at all. Suggested follow-up, not blocking: record this spend under `userId`.

## Business-rule checks

| Rule | Result | Evidence |
|---|---|---|
| One product at ₹299, no hidden second tier, no unpriced upsell | **PASS** | The only price shown is "Pay ₹299", linking to `/manage/subscription` (`aiPageLimits.ts` `PAY`). You cannot buy extra pages (a contract non-goal). All paid stores get the same 5 pages. `src/lib/payments/` is not in the diff. No copy says "unlimited AI scans" (only "unlimited menu updates", which means manual edits and is still true) |
| Ordering freeze: no ordering path; ordering copy only from `roadmap.ts` | **PASS** | No new route, flag or copy about ordering. A grep of the added lines finds no order, checkout, KOT or WhatsApp-order text. `ORDERING_FROZEN` is unchanged |
| Prices in INR | **PASS** | Every user-facing price is ₹299. `$` appears only in code comments and server cap names |
| Tamil + English for user-facing copy | **Owner-waived, with one flag** | The new copy is English only, as the owner decided (contract non-goal, design gate Q1, amendment 2026-09-23). The amendment also **removes all existing Tamil from onboarding**: 30 Tamil lines removed, 0 added, 0 Tamil left in `app/onboarding/`. **This removal is not behind `AI_PAGE_LIMITS`.** It goes live on the next deploy even with the flag OFF, so AC10 ("with the flag OFF onboarding behaves exactly as today") no longer holds literally for onboarding copy. Onboarding is the screen with the most drop-off, for low-literacy Tamil owners, at a measured ~7% conversion. The owner asked for this; confirm it should ship unflagged (see below) |
| Menu-data integrity: no bulk delete, no destructive migration | **PASS** | `057_ai_page_usage.sql` is expand-only: one new table, 3 indexes and 3 functions, with nothing dropped or altered. There is no FK to `sites`, so deleting a store still works and leaves an audit trail. The insert logic in `bulk-import/insert` is unchanged; only its gate changes. No delete paths are added. Migration 057 is **not applied yet** (`to_regclass('public.ai_page_usage')` is null, measured) |
| Behaviour for existing customers (contract gate decisions) | **PASS (owner-approved)** | 53 expired stores lose AI bulk upload but keep adding by hand. For them it is a conversion nudge. 4 paid stores move from 15 units a day to 5 pages a month. Measured: only 4 users have ever used bulk import |

## Owner input needed

1. **Create `.claude/docs/business-context.md`.** Copy the template and fill it in. Only the template
   exists, and this alone forces STOP-FOR-OWNER.
2. **Customer counts.** The template says paying 0, trial 0, active 0, MRR ₹0. The live DB has 4 paid
   stores, 3 in trial and 53 expired. Are the 4 paid stores real paying customers, or test/comp stores? Give real MRR.
3. **Target contribution margin as one number.** "85 - 90 %" changes the worst-case answer (see Unit economics).
4. **USD → INR rate as a number.** The file says "research"; this report used the orchestrator's 95.7.
5. **Fixed costs in ₹:**
   - DigitalOcean: written as "$10 per month"; confirm it in ₹.
   - WhatsApp: listed with no amount.
   - Domain and email.
6. **Variable costs:**
   - gpt-4o and gpt-4o-mini prices: these came from the orchestrator, not from you.
   - Razorpay fee as a % of ₹299.
   - WhatsApp cost per conversation.
   - AI food photo cost per image.
7. **Plan limits and current use:**
   - Supabase storage, egress and MAU use (DB size is measured at 29.1 MB).
   - DO bandwidth.
   - OpenAI tier / TPM limit.
   - OpenAI project monthly hard limit.
8. **Upgrade prices** for Supabase Pro, DO basic-xs and DO basic-s. None are needed by this feature, but the file must have them.
9. **Production values of `EXTRACTION_DAILY_BUDGET_USD` and `EXTRACTION_USER_DAILY_BUDGET_USD`.** This
   report assumed the code defaults, $25 and $1 a day. They are the only daily bound on the leaks above.
10. **Confirm the onboarding Tamil removal should ship unflagged.** It goes live on the next deploy whatever
    `AI_PAGE_LIMITS` is set to, and rolling back to `release/baseline-20260923` brings the Tamil back.
11. **Confirm the per-owner exposure is acceptable.** Your ₹35 goal is per store. One trial owner can use
    about ₹32–₹62 across 2 trial stores at once, and more through delete-and-recreate. That is bounded
    only by the in-memory $1/day per-user cap. A per-owner lifetime onboarding ceiling is a possible follow-up.

VERDICT: STOP-FOR-OWNER
