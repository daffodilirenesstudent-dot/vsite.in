# PLAN — WhatsApp notification layer v1  (status: DONE 2026-09-22, go-live pending owner)

Spec: `docs/superpowers/specs/2026-09-22-whatsapp-notifications-design.md`.
Acceptance: `apps/web/tests/acceptance/whatsapp-notifications.test.ts`;
also `tests/unit/whatsappPrimitives.test.ts`, `tests/api/whatsappOutbox.test.ts`.

1. `src/lib/notifications/whatsapp/{phone,signature,windows,state,templates,client}.ts` — pure rules + Graph API call.
2. `src/lib/notifications/whatsapp/outbox.ts` — enqueue / claim / dispatch / statuses.
3. `src/lib/notifications/whatsapp/sweep.ts` — trial + plan windows → enqueue + bell.
4. `src/app/api/webhooks/whatsapp/route.ts` — handshake + signed statuses.
5. `src/app/api/cron/whatsapp/route.ts` — sweep + dispatch behind `authorizeCron`.
6. `src/app/api/qr/[slug]/route.ts` — QR PNG (`qrcode`).
7. Hooks: `onboarding/complete`, `subscription/verify-payment`, `webhooks/razorpay`.
8. `supabase/migrations/057_notification_outbox.sql`, `058_whatsapp_cron.sql`.
9. Runbook `docs/whatsapp-setup.md`; AGENTS.md gotchas.

---

# PLAN — Resilient menu extraction  (status: DONE 2026-09-19)

Goal: `docs/GOAL.md`. Acceptance: `apps/web/tests/acceptance/resilient-extraction.test.ts`.
Load proof: `apps/web/tests/load/onboardingExtract.load.test.ts` (vitest `*.test.ts`,
fake OpenAI with a real token-per-minute limiter, time-scaled 1/20).

No schema, storage or dependency change: everything below runs in-process on
the existing single instance.

## Tasks

1. **`apps/web/src/lib/platform/boundedBody.ts`** — `boundBody(request, max)`
   wraps the body in a counting stream that errors past `max`, so
   `request.formData()` aborts early instead of buffering everything. (AC1)

2. **`apps/web/src/lib/platform/uploadAdmission.ts`** — process-wide byte budget
   (`EXTRACT_MEMORY_BUDGET_MB`, default 200MB ÷ measured 7× amplification),
   FIFO wait with a short deadline, one active scan per user. Admission happens
   before the body is read. (AC2, AC3)

3. **`apps/web/src/lib/menu/openaiScheduler.ts`** — per-model sliding-window
   token and request budget; learns limits from `x-ratelimit-*` headers,
   honours `retry-after(-ms)`, deadline-bounded waits, circuit breaker on
   consecutive 5xx/timeouts. Env overrides `OPENAI_TPM_<MODEL>`,
   `OPENAI_RPM_<MODEL>`, `OPENAI_RATE_WINDOW_MS`. (AC8)

4. **`apps/web/src/lib/menu/aiSpendGuard.ts`** — daily USD spend from
   `completion.usage` against `EXTRACTION_DAILY_BUDGET_USD`. In-process (resets
   on restart); the durable version needs a migration. (AC10)

5. **`apps/web/src/lib/platform/storeEligibility.ts`** — the store-limit check
   moved verbatim out of `onboarding/complete`, so extract can refuse before
   spending. `/complete` calls the same function; behaviour unchanged. (AC11)

6. **`apps/web/src/lib/menu/menuExtractor.ts`** — `extractMenuPages()`: one call
   per photo, `max_tokens` 2,500; ladder: 429/5xx → retry same model → gpt-4o-mini;
   `finish_reason: length` → 8,000-token retry → salvage complete tuples.
   Client `timeout` 45s, `maxRetries: 0`. Every call goes through the scheduler
   and records spend. Dedup keeps same-name items in different non-empty
   sections. `extractMenuItemsFromImages` remains as a wrapper, so bulk-import
   is unchanged in shape. (AC4–AC7, AC9)

7. **`apps/web/src/app/api/onboarding/extract/route.ts`** — order: auth → spend
   guard → declared-length gate → eligibility → admission → rate limit →
   bounded `formData()` → per-page extraction under a 50s deadline. Every error
   carries a `code`. OCR fallback removed (replaced by the per-page ladder).
   `MAX_BODY_BYTES` 30MB → 12MB. (AC1–AC4, AC10, AC11)

8. **`apps/web/src/app/api/bulk-import/extract/route.ts`** — shares the same
   admission budget and bounded body (same process, same RAM).

9. **`apps/web/src/app/onboarding/scanMessages.ts` + `page.tsx`** — bilingual
   messages per code; BUSY/SCAN_IN_PROGRESS auto-retry with Retry-After and a
   queue message; partial-scan notice; "skip, add items manually"; desktop
   drag-drop with a window-level dragover guard; touch-visible remove button;
   HEIC hint. (AC12)

11. **`apps/web/src/lib/menu/pdfPages.ts`** + `scripts/copy-pdf-worker.mjs` —
    PDF → JPEG pages in the browser (≤15, shared slots); worker copied to
    `public/pdfjs/` at prebuild. (AC14) Acceptance: `tests/acceptance/pdf-upload.test.ts`.

10. **`apps/web/tests/load/onboardingExtract.load.test.ts`** — 50 simultaneous
    onboardings; asserts completion, zero item loss, admitted bytes ≤ budget;
    prints metrics used for the before/after comparison. (AC13)
