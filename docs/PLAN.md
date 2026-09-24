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
