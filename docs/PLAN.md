# PLAN — AI menu page limits per store  (status: BUILT — in QA)

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

---

# PLAN — Menu image thumbnails + long cache  (status: DONE 2026-09-24 — rollout pending)

Goal: cut Supabase egress per menu open without lowering image quality, so the
free tier can carry 20–50 seven-day trials a month.
Acceptance: `apps/web/tests/acceptance/menu-image-thumbnails.test.ts`.

Measured on production (2026-09-24): 60 shops, ~36 photos per menu at 186 KB
average, owner uploads average 466 KB. The list card is 120 px but downloads
the full file. Lazy loading already exists (MenuItemCard `Thumb`), so fix 1 is
done; this plan covers fix 2 (thumbnails) and fix 4 (long cache).

Rules: the original is never re-encoded, overwritten or deleted. No schema
change, no migration, no new dependency. Flag `NEXT_PUBLIC_MENU_IMAGE_THUMBS`
defaults OFF, and OFF means exactly today's behaviour.

## Tasks

1. **`apps/web/src/lib/menu/menuImages.ts`** (client-safe, pure) — flag,
   `IMAGE_CACHE_SECONDS`, `THUMB_EDGE_PX` (360 = 120 px × 3 DPR),
   `THUMB_QUALITY`, `thumbUrlFor(url)` (`<name>.thumb.jpg` beside the original,
   only for `product-images` / `default-images` public URLs),
   `menuThumbSrc(url)`, `fallBackToOriginal(img, url)`,
   `uploadMenuImage({ bucket, path, file, options, enabled, makeThumb })`.
2. **`apps/web/src/lib/menu/imageCompress.ts`** — `makeMenuThumbnail(blob)`:
   browser canvas, short edge → 360 px, JPEG 0.85. Never upscales.
3. **Upload sites** → `uploadMenuImage`: `app/manage/product-inventory/page.tsx`,
   `app/manage/banner-management/page.tsx`, `components/manage/ShopCard.tsx`
   (banner + product photo). Filenames stay as today (already unique, so a
   one-year cache cannot show a stale photo).
4. **Rendering** — `components/templates/MenuItemCard.tsx` `Thumb` and the
   54 px detail-sheet header in `components/templates/QRMenuTemplate.tsx` use
   `menuThumbSrc` with `fallBackToOriginal` on error. Dish hero and banners
   keep the original.
5. **`apps/web/scripts/backfill-menu-thumbs.mjs`** — lists `product-images`
   and `default-images`, creates the missing `.thumb.jpg` with
   `@napi-rs/canvas` (already installed via `pdfjs-dist`; no new dependency).
   Dry run by default; `--apply` writes. Never deletes, never upserts.

## Rollout (owner)
1. Merge with the flag OFF: nothing changes.
2. Run `node scripts/backfill-menu-thumbs.mjs` (dry run), then `--apply`.
3. Set `NEXT_PUBLIC_MENU_IMAGE_THUMBS=true` in DigitalOcean (build-time var;
   needs a redeploy). Rollback = unset it and redeploy.

---

# PLAN — Owner photo compression  (status: DONE 2026-09-24 — rollout pending)

Goal: owners upload their own dish photos and banners (2–9 MB from a phone)
and the menu stays fast and inside Supabase's free storage/egress.
Acceptance: `apps/web/tests/acceptance/menu-photo-compression.test.ts` (pure +
wiring) and `menu-photo-compression.browser.test.ts` — vitest driving real
Chromium, WebKit and Firefox through `@playwright/test` (already a devDep);
modules are transpiled with `typescript` and served by request interception,
so no dev server is needed. Uninstalled engines are skipped.

Pattern: shrink on the device before upload (Facebook Spectrum), one master
plus fixed sizes (Instagram/YouTube). Server and DB never touch image bytes.

## Tasks

1. **`apps/web/src/lib/menu/menuPhoto.ts`** (pure) — flag
   `NEXT_PUBLIC_MENU_PHOTO_COMPRESS` (OFF unless "true"), 1600 px / WebP 0.80 /
   JPEG 0.85 / 25 MB input cap, `CANVAS_MAX_PIXELS` (< iOS 16.7 MP),
   `fitWithin`, `downscalePlan` (halve until within 2×; first step capped by
   area), `keepAsIs`, `photoFileName`, `isPhotoFile`, `MenuPhotoError`,
   `photoErrorMessage`.
2. **`apps/web/src/lib/menu/imageCompress.ts`** — `prepareMenuPhoto(file)`:
   decode via `<img>.decode()` (EXIF orientation applied by the browser; HEIC
   works in Safari only), white background, step-down draw, WebP if the
   browser really encodes it (detected once), else JPEG; keeps the input when
   re-encoding would not help. `makeMenuThumbnail` reuses the step-down draw.
3. **`app/manage/product-inventory/page.tsx`** — flag on: 25 MB input cap,
   HEIC accepted, `prepareMenuPhoto` at save (inside the existing "saving"
   state), owner-readable errors; list icons use `menuThumbSrc`.
4. **`app/manage/banner-management/page.tsx`** — same, replacing
   `compressImage(1200, 0.85)` only when the flag is on.
5. `components/manage/ShopCard.tsx` is not rendered anywhere — not touched.
