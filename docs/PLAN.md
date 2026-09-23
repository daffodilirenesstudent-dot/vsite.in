# PLAN — AI menu page limits per store  (status: IN PROGRESS)

Goal: `docs/GOAL.md`. Contract / design: `docs/features/ai-page-limits/`.
Acceptance: `apps/web/tests/acceptance/ai-page-limits.test.ts` (flag mocked ON).
Backward compat: `apps/web/tests/acceptance/ai-page-limits-flag-off.test.ts` (flag mocked OFF).
Everything new sits behind `AI_PAGE_LIMITS` (default `false`).

## Tasks (paths under `apps/web/`)

0. **Backward-compat tests first** — `tests/acceptance/ai-page-limits-flag-off.test.ts`:
   with the flag OFF, onboarding/bulk extract/allowance/modal/complete behave as today. (AC10)
1. **Flag** — `src/lib/platform/productFlags.ts`: `export const AI_PAGE_LIMITS: boolean = false;` (approved path)
2. **Migration** — `supabase/migrations/057_ai_page_usage.sql`: table, indexes, RLS,
   `reserve_ai_pages` / `refund_ai_pages` / `bind_onboarding_pages`, least-privilege grants.
   Expand-only. Applied at release via Supabase `apply_migration` (owner approves). (AC5, AC7, AC11)
3. **Pure rules** — `src/lib/menu/aiPageLimits.ts`: limits, `resolveBulkAllowance`,
   `planBulkPdf`, `bulkAllowanceView`, `formatResetDate`. Client-safe. (AC2, AC3, AC4, AC8)
4. **Ledger** — `src/lib/menu/aiPageLedger.ts` (`server-only`): reserve / refund / bind / read
   over the RPCs; fails closed on DB error. (AC5, AC6, AC7)
5. **Onboarding extract** — `src/app/api/onboarding/extract/route.ts`: pre-check (4b),
   reserve after validation (9b), refund non-`ok` pages in `finally`, `pages` in the body. (AC1, AC6)
6. **Onboarding complete** — `src/app/api/onboarding/complete/route.ts`: bind after products insert. (AC1)
7. **Bulk extract** — `src/app/api/bulk-import/extract/route.ts`: per-user $ cap, `X-Site-Id`
   ownership, resolve + pre-check before the body, reserve, `extractMenuPages` with `spendKey`,
   refund, `pages` + `failedPhotos`. (AC2–AC6, AC8, AC9, AC11)
8. **Bulk insert** — `src/app/api/bulk-import/insert/route.ts`: flag ON skips `bulk_import_usage`,
   adds `aiSpendAllowed(userId)` and records description spend. (AC9, D2)
9. **Allowance route** — `src/app/api/bulk-import/allowance/route.ts` (new GET). (AC4, AC11)
10. **Onboarding copy** — `src/app/onboarding/scanMessages.ts` (`PAGE_LIMIT`,
    `PAGE_LIMIT_UNAVAILABLE`, English only per owner) + `src/app/onboarding/page.tsx` handling.
    Narrow, owner-approved edit to `tests/acceptance/resilient-extraction.test.ts` AC12 to exempt
    exactly these two codes from the Tamil requirement. (AC1)
11. **Bulk modal** — `src/components/manage/BulkImportModal.tsx`: ON branch with allowance,
    PDF, `X-Site-Id`, exhausted states; OFF branch unchanged. (AC3, AC4, AC8)
12. **Exit check** — `npx vitest run`, `npx tsc --noEmit`, `npm run lint`.

Playwright E2E for the modal runs in phase 5 on the flag-ON release commit (`tests/e2e/ai-page-limits.spec.ts`).
