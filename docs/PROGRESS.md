# Progress Log
status: DONE
## Iteration history

### 2026-09-26 — Owner QA fixes (high / medium / low list)
status: CODE DONE — new acceptance suites green: product-pricing (24), menu-freshness (20),
owner-qa-polish (44), bulk-review (9), ordering-roadmap-copy (+6). Full suite: only the
pre-existing tests/unit/claude-hooks/* (69) and the timing-sensitive aiCostAbuse test fail, same
as before this pass. tsc clean, lint 0 errors. NOT committed; NOT deployed.

**High.**
- Sizes dish showed "₹0 onwards": save now stores `listedPrice()` (cheapest size); the menu
  derives it on read for rows already saved at ₹0 (`menuCardPrice`, only when the stored price is
  0 — no data rewritten). Same bug in the AI extractor returned `Infinity` (`Math.min()` of no
  prices); fixed through the same helper.
- No-price dishes: `validateProductForm` requires > ₹0 (one price / combo) and at least one priced,
  named size (Sizes). Existing ₹0 rows (e.g. "Browine") are untouched — the owner fixes them.
- Ordering advertised: menu footer now "Fresh menu, always up to date". **Poster decision
  reversed by the owner (asked explicitly, 26 Sep):** while frozen, and always for qr_menu, the
  classic poster is `/brand poster scan menu.png` — the owner's artwork re-rendered with "SCAN FOR
  MENU" (Playfair Display Bold, same layout). Rule: `lib/qr/posterTemplate.ts`. dashboard-ux.test.ts
  updated to guard the new choice. The 11 Sep "keep Scan & Order" note below is superseded.
- Env flags: NOT changed (protected). Owner action: add `NEXT_PUBLIC_MENU_PHOTO_COMPRESS=true`,
  `NEXT_PUBLIC_MENU_IMAGE_THUMBS=true` to .env.local and DO; `NEXT_PUBLIC_SMART_ADD_PRODUCT=true`
  to DO. All are build-time — redeploy after.

**Medium.** Store Status asks before going offline (`components/manage/ConfirmDialog.tsx`).
Stale menu: root cause is Next's Data Cache (`revalidate = 10` on the Supabase fetches), not the
page cache — `POST /api/manage/menu-refresh` revalidatePaths `/shop/<slug>` after dashboard edits;
toggle-live and menu-theme revalidate inline. Owner visits: `lib/menu/ownerDevice.ts` marks the
dashboard device; the menu skips the scan ping there. Printer bridge poll gated on
ORDERING_FROZEN. Bulk upload has a "Check items" step (edit name / price / category, untick; ₹0
blocked) before bestsellers. Tablet: banner list by container width, move-up/down buttons, Manage
plan in the icon sidebar.

**Low.** Escape closes notifications, bulk modal, both drawers; drawers are dialogs; labelled
deletes, sidebar icons, store switch, bulk "Choose Files" is a button. Tab titles per page, no
"| Vsite | Vsite". Header "Owner · <store>". Subscription copy consistent with no early renewal.
Design previews show real prices. Menu header shows saved location + hours. 44px chips and
swatches. Cleared name clears the library photo; "Veg Combo"-style names abstain (matcher). CSP +
https://apis.google.com in script-src only.

**Photo cleanup (owner asked, same day).** Replacing or deleting a dish / banner photo now
deletes THAT file and its thumbnail via `POST /api/manage/media/release`, called only after the DB
save succeeded (inventory, desktop banners, You-tab banners; a fresh upload whose save failed is
released too). Guards (lib/menu/photoCleanup.ts): `product-images` only — **the food library
(`default-images`) is never touched (owner: "don't delete the food lib")**; only this store's
`<siteId>/` or `<slug>/` folder; kept if any products/banners row still references the file.
Live check 26 Sep: only products.image_url and banners.image_url reference uploads; 0 library rows
point into product-images; 0 uploads shared by two rows. Backlog NOT touched: 155 unreferenced
originals already in product-images (77 in `temp/`, Feb–Apr test uploads; the rest deleted stores /
old replacements) — a one-off cleanup needs the owner's go. Store deletion still leaves its photos
(the site row is gone before a release could verify ownership) — belongs in that same sweep.

**Not done — needs a decision.** (1) The backlog above. (2) Bulk extraction speed (~47 s): pages already run in parallel; the remaining time
is the vision call plus the description pass. Deferring descriptions until after insert would
roughly halve the wait but changes what the owner reviews.


### 2026-09-25 — Feature: One free trial per account (`one-trial`)
status: CODE DONE — acceptance green: one-trial.test.ts (37/37); updated mobile-nav AC8, you-tab
AC1/AC4, ai-page-limits fixtures, db-least-privilege parser; onboarding, payment, dashboard and icon
suites green. Full suite: only tests/unit/claude-hooks/* fail (pre-existing). tsc clean, lint 0
errors. **058 APPLIED to production 2026-09-25 (owner's go)**; 059 waits for the deploy.

**Why.** Research on the live DB: 12 of 32 owners had 2+ stores; 25 unpaid extra stores had 18
customer visitors in total. The old rule (5 stores, 2 on trial at once; a lapsed trial frees its
slot) allowed a new free store every week; delete-and-recreate reset the trial; the trial was
`created_at + 7 days` and owners can UPDATE their own sites rows (created_at included) from the
browser; the DB trigger said 14 days, the app 7. Owner chose a hybrid: max 2 stores per account,
first store gets the trial once per account for good, a later store is built free and goes live
only after payment, with an explicit agreement shown with the phone number.

**Design.** Trial window moved to `site_subscriptions.trial_ends_at` (browser-unwritable).
`trial_claims` (PK user_id, no FK — outlives a deleted store) records the used trial. 058:
columns, table, backfill (every existing store keeps created_at + 7d; 25 stores without a
subscription row get one; every existing owner has a claim), AFTER INSERT trigger that claims the
trial and opens the store's subscription row. 059: BEFORE INSERT trigger — advisory lock per
account, 2 stores, consent required once the trial is used. App: `lib/store/trialRules.ts` (the
rule), `storeEligibility` (+`readStoreEligibility`), `GET /api/onboarding/eligibility`, consent
header on extract + launch, DB refusals → 403 without retries, `live` in the launch response,
`PaidStoreConsent` screen (phone, trial store, ₹299, checkbox), onboarding gate (existing owners
wait for the answer; new signups never do), launch screen "is ready · Not live yet · Pay ₹299 to go
live", You add-store = the agreement, header counts 2, banners say "not live yet". Consent is
also written to the audit log (`paid_store_consent`).

**Evidence.** Dry run of 058+059 inside a rolled-back block on production: 60/60 subscription rows,
0 without a trial date, 0 differing from created_at + 7 days, 32 claims; new account's 1st store
trial ✓, 2nd no trial ✓, 3rd PLAN_LIMIT ✓, 2nd without consent CONSENT_REQUIRED ✓, with consent no
trial ✓, trial store deleted then re-created → no trial ✓. After applying 058: same counts; RLS on
trial_claims, browsers cannot read/write it, can read trial_ends_at; site_subscriptions still has no
write policies; old limit trigger intact until 059. Dev server (390 px, test account): You tab and
store list load with the new columns; add-store at-limit screen; consent screen rendered from the
component. Terms + FAQ state the rule (`TRIAL_RULE` in content/policy.ts).

**Not done / known.** The consent → build → "Pay ₹299 to go live" path was not clicked through
end to end: the only test account already has 4 stores and the only database is production. A second phone
number still gets its own trial (the rule is per number). A no-trial store still gets its
onboarding AI scan before payment (capped by the daily per-user AI budget).

**Rollout.** 1) apply 058 (expand-only; the current release keeps working) 2) deploy 3) apply 059.
Rollback: revert the deploy; 059's rollback re-runs 011's function body; 058's header lists drops.

### 2026-09-25 — Feature: You tab redesign (phone)
status: DONE — acceptance green: you-tab.test.ts (26/26); mobile-nav (15/15, AC6 superseded by
owner decision), dashboard-ux, store-details, qr-sticker, qr-print-kit, food-posters,
ordering-roadmap-copy, payment attacks, ordering freeze, routes — 308 passed. tsc clean, lint 0 errors.

**Why.** The You tab opened on "Your account" + a phone number, and every row led to a desktop
page (1,800-line settings, a banner table, a pricing page). Help opened the marketing FAQ;
sign-out sat in a red section one tap from a confirmation, and each re-login costs an SMS.
Owner approved the redesign on the design canvas (https://claude.ai/artifact/JH435VTbKGwj3dDP9M1xSy).

**Design.** New phone screens under `/manage/you/{store,design,banners,plan,add-store,help}`,
full-screen on phones (shell hides header, notices and bottom bar — flag on only). You page:
store card with plan status and View menu, rows with live lines (first missing detail, design
name, banners showing, plan end, trial spots), help, then a quiet "Sign out" behind "Sign out of
vsite? / Stay signed in". Rules are pure in `lib/you/*`; banner queries in `lib/you/bannerData.ts`
(same table/bucket); delete-store moved to `lib/store/deleteStore.ts` (settings now calls it).
The ₹299 checkout moved verbatim into `hooks/useQrMenuCheckout.ts`, used by the old subscription
page and the new Plan & bills; its rule is kept (no payment during a trial or a running plan).
Feature list moved to `content/smartQrMenu.ts`. Menu design loads Newsreader + Familjen for that
route only so the lettering options render in their real faces. No schema, route or dependency change.

**Evidence (dev server, 390×844, test account).** Every screen loaded real data; Store details
Save bar + "Discard changes?" + back via history; banners ⋮ menu; Plan shows "Active · paid till
9 Dec"; add-store counts 1 of 2 trial spots; Help's WhatsApp text names the store; the old
subscription page still renders ("Current plan") with no console errors; desktop keeps sidebar/header.
Fixed during the walkthrough: stretched design preview, lettering fonts, footer floating on short
screens, empty period bar for plans > 30 days, duplicated counts/dates.

**Not done / known.** No bill download (no endpoint — the mockup's icon was dropped). The design's
"Activate during trial / Renew early" was not built: today's flow forbids it (owner said flow
unchanged). Payment itself was not run end to end (real money); the flow is the moved code, guarded
by the payment suites. Full suite: only `tests/unit/claude-hooks/*` fail (pre-existing).

**Rollout.** Ships with `NEXT_PUBLIC_MOBILE_NAV_V2=true` (build-time). Rollback: unset it.

**Follow-up (owner report, same day): every tab tap showed the same skeleton.** Root cause: the
shell knew the destination (`usePendingNav()`) but `PendingPage` took no props and drew one
dashboard-shaped layout for all tabs. Now `components/PendingPage.tsx` draws Home / Menu / QR /
You in each page's own shape (generic for anything else) and labels the progress "Opening Menu" etc.
New mobile-nav AC5 test renders each one and requires four distinct layouts (vitest now compiles
JSX via oxc). Verified on the phone viewport with page data delayed 4 s: each tab shows its own shape.

### 2026-09-25 — Feature: Food posters (QR page, pass 2)
status: DONE — acceptance green: food-posters.test.ts (18/18); print kit (29/29) and sticker (8/8) unchanged.
Rollout pending the owner.

**Why.** A QR looks the same whatever it opens; the design around it says what it is for,
and the QR an Indian diner sees most is a UPI payment standee. Food around the code says
"menu" at a glance. Owner approved four designs on the design canvas
(https://claude.ai/artifact/DXtymTvPcXZHveidT7aspQ): restaurant Feast ring and Table edge,
café Floating and Counter. Headline "Scan and see menu". English only (owner: no Tamil).

**Design.** `lib/qr/posterDesigns.ts` (flag `NEXT_PUBLIC_FOOD_POSTERS`, families, headline,
geometry helpers) over `posterDesignData.ts` (the boards in 559×794 design space);
`designRender.ts` draws a design cover-fit onto any print card, QR generated at print size
and drawn in device pixels; `app/manage/qr/layout.tsx` loads Poppins 800 + Newsreader via
next/font as CSS variables the canvas reads. Print kit gains a "Poster design" card
(Restaurant / Café, two designs + the current poster, four colours each); preview, PDF and
Status image follow it; choice remembered per store in localStorage (no schema change).
Family preselected from `sites.business_type` (58 of 60 stores unset → restaurant).
Food art in `public/poster-art/` (28 WebP cut-outs, ~1 MB): restaurant dishes cut from the
owner's own mockup, café items cut from the vsite library.

**Evidence (production build, all flags, Chromium).** All four designs render with the
right fonts; colour changes and the choice survive a reload; Table edge A5 print-shop PDF
154×216 mm, 1.9 MB, ~1 s, opened in the viewer; 390 px phone: tiles fit, no overflow,
Download bar 28 px above the nav. The QR-protection test caught a bowl grazing a corner
bracket and a 3-module quiet zone on Table edge — both fixed (every card now 4 modules).

**Not done / known.** Restaurant art comes from a 1024 px mockup: sharp at A6/A5, soft at
A4 (≈2.6× upscale) — a higher-resolution art pack fixes it. Feast ring's QR is the smallest
(table stand at home "scans from 20 cm"); Table edge is the big-QR choice. The choice is
per device until a column is approved. Owner's own dishes on the poster: not yet.
Full suite: only `tests/unit/claude-hooks/*` fail (pre-existing).

**Rollout.** Needs `NEXT_PUBLIC_QR_PRINT_KIT=true` and `NEXT_PUBLIC_FOOD_POSTERS=true`
(build-time; redeploy). Rollback: unset `NEXT_PUBLIC_FOOD_POSTERS`.

### 2026-09-25 — Feature: QR print kit (QR page, first pass)
status: DONE — acceptance green: qr-print-kit.test.ts (29/29), qr-sticker.test.ts unchanged (8/8).
Rollout pending the owner.

**Problem (measured on the live page).** "Download PDF" sat 370 px below the fold on a
laptop and under the bottom nav on a phone — and saved a PNG. The only artwork is
1181×1654 px at 300 dpi (≈ A6); printed on A4 it became a 140 dpi upscale. No way to copy
or share the menu link. A failed download left every button disabled (no `finally`).

**Design (no schema, route or dependency; jsPDF was already a dependency).**
- Menu-only stores + `NEXT_PUBLIC_QR_PRINT_KIT` → `MenuQrPanel`: poster with a test-scan
  hint; "Where will it go?" (table stand A6 / counter A5 / wall or door A4, each with its
  scan distance by the 10:1 rule −20 %); "How will you print it?" (home: A4 sheet with
  4 / 2 / 1 cards inside a 6 mm margin and dashed cut lines; print shop: exact size +
  3 mm bleed); real PDF at 300 dpi; QR-only PNG / SVG; share card (copy, WhatsApp, open,
  1080×1920 Status image, Google Maps how-to); sticker card unchanged.
- Phones: the download rides in a bar hung off the panel root, 28 px above the nav.
- Unflagged fixes on the old page: the PNG button is labelled "Download poster (PNG)";
  all seven downloads reset in `finally` and toast on failure.
- `lib/qr/styledQr.ts` and `lib/qr/posterRender.ts` hold helpers moved verbatim from
  the page (checked by script), so both layouts render the same QR.

**Evidence (production build, flags on, Chromium).**
- Download PDF: laptop 660–708 px (was 1229); phone: bar on screen at every scroll.
- PDFs: A4 ×4 / A6+bleed / A5 ×2 landscape / A5+bleed / A4 / A4+bleed — right page
  sizes, 380 KB–1.4 MB, 0.7–2.3 s. The first cut stored pixels raw (A4 print shop
  26.7 MB); now Flate-compressed and locked by a test.
- The home A4 sheet opened in Chrome's PDF viewer: 2×2 posters, cut lines, margin.
- Copy writes the full link; Status image 1080×1920, 739 KB.

**Not done / known.** Scan distances use the real artwork (QR ≈ half the poster width), so
they are honest but modest: table 40 cm at home, 50 cm at a print shop. The poster art
and "Scan & Order" wording are unchanged (pass 2). The Status image share sheet is used
only on touch devices; desktop downloads. Full suite: only `tests/unit/claude-hooks/*`
fail (pre-existing).

**Rollout.** Set `NEXT_PUBLIC_QR_PRINT_KIT=true` in DigitalOcean (build-time; redeploy).
Rollback: unset and redeploy. The two unflagged fixes stay either way.

### 2026-09-24 — Feature: Smart Add Product (drawer order + library photo suggestion)
status: DONE — acceptance green: smart-add-product.test.ts (47/47). Rollout pending the owner.

**Problem.** The inventory drawer asked Image → Product Type → Name. The "Use
Professional Image" button sat above the name it needs, so pressing it first
always failed ("Enter a product name first"), and owners who skipped it saved
dishes with no photo. Dish type defaulted to Non-Vegetarian, and owners keep
defaults, so veg dishes went on the menu as non-veg.

**Design (owner-approved in chat; no schema, route, migration or dependency).**
- Order: name → photo → veg/non-veg → category → pricing (with one price /
  sizes / combo inside it) → description → show on menu. `productForm.ts`.
- Veg/non-veg has no default when the flag is on; save refuses with
  "Choose Veg or Non-veg" (toast + inline). Same mark and colours as the menu.
- The library photo is looked up from the name (≥ 3 letters, 700 ms pause) via
  the existing `/api/images/match` and shown in the slot BEFORE save, with
  Keep / Upload your own / Remove. Never over the owner's own or saved photo;
  a removal stops suggestions for that drawer; a rename to an unmatched dish
  clears the old suggestion. If Save beats the lookup, save finishes it.
  `photoSuggest.ts` (framework-free, fake-timer tested) + `usePhotoSuggestion`.
- Motion (`globals.css`, "Photo suggestion"): lavender skeleton sweep while
  searching (held ≥ 450 ms), reveal gated on the slot's own `decode()`, photo
  develops from blur over 480 ms on Material's emphasized curve, one
  left-to-right sheen, badge settles last. Reduced motion: 160 ms fade only.
- Flag OFF: the nine legacy drawer blocks are verbatim (checked by script) and
  in the original order.

**Evidence (production build, flag on, Chromium).**
- Timeline from last keystroke: shimmer 753 ms → photo decoded 1434 ms →
  reveal 1457 ms. No layout shift: the slot is one fixed height.
- Reveal opacity at 50/100/150/250/480 ms: 0.17 / 0.52 / 0.71 / 0.89 / 1.00.
  The first curve tried (emphasized-decelerate) was 0.63 at 50 ms — a pop —
  so the test now asserts softness (≤ 0.3 at 10 % time) rather than a curve.
- Remove → no re-suggestion on rename → "Find a photo in our library" works;
  "Filter Coffee" (no library photo) clears the old one and says so; edit of a
  product with a saved photo: no lookup, no badge, "Change photo" only.
- 390 px: no horizontal scroll.

**Not done / known.** The save-time lookup was verified in unit tests only —
saving in the browser would write to the live test store. Editing an item
whose `food_type` is `unknown` still preselects Non-Vegetarian (unchanged
legacy mapping). Full suite: `tests/unit/claude-hooks/*` fail (pre-existing,
hook files missing); `tests/security/aiCostAbuse.test.ts` failed once under
full-suite load and passed 3/3 alone (flaky, untouched).

**Rollout.** Set `NEXT_PUBLIC_SMART_ADD_PRODUCT=true` in DigitalOcean
(build-time; redeploy). Rollback: unset and redeploy.

### 2026-09-24 — Feature: owner photo compression (dish photos + banners)
status: DONE — acceptance green: menu-photo-compression.test.ts (18/18) and
menu-photo-compression.browser.test.ts (27/27: Chromium, WebKit, Firefox). Rollout pending the owner.

**Problem (measured on production).** Owners must use their own dish photos. The
inventory page uploaded the phone file untouched and rejected anything over 5 MB
(many phone photos). Of 219 owner uploads: 77 PNG, 19 over 1 MB, three 9 MB
PNGs. The dish sheet and inventory icons load that full file.

**Design (browser-side, the Spectrum/Instagram pattern; no dependency, no schema).**
- `menuPhoto.ts` (pure) — 1600 px long edge, WebP 0.80 / JPEG 0.85, 25 MB
  input cap, step-down plan, keep-as-is rule, file naming, error codes/messages.
  Flag `NEXT_PUBLIC_MENU_PHOTO_COMPRESS` (OFF unless "true").
- `imageCompress.ts` — `prepareMenuPhoto`: `<img>.decode()` (EXIF orientation
  applied; HEIC only in Safari → HEIC_UNSUPPORTED elsewhere), white background,
  step-down draw with intermediate canvases released, WebP detected once
  (Safari returns PNG), JPEG fallback, never larger than a web-ready input.
  `makeMenuThumbnail` now uses the same step-down draw.
- Inventory + banner pages: flag on → 25 MB cap, HEIC accepted, prepare at
  save inside the existing "saving" state, owner-readable toasts; inventory
  icons use the thumbnail. Flag off → byte-identical to before.

**Evidence.**
- Real owner photos through the shipped code (Chromium): 9,178 KB PNG → 229 KB
  WebP; 5,056 KB JPG → 175 KB WebP. Safari mode (JPEG): 334 KB / 322 KB. 0.2–0.5 s on desktop.
- Moiré (1 px stripes, 4000 → 1600 px, luma std-dev): step-down 0.0 in all three
  engines; one-step draw 11.0 Chromium, 64.0 Firefox, 87.5 WebKit.
- Side-by-side crop of a 9 MB dish: no visible difference.

**Not done / known.** Existing oversized uploads are not re-compressed (19 files;
changing live photos needs the owner's OK). Wide-gamut (Display-P3) photos are
converted to sRGB by the canvas. Animated images keep only the first frame.
`components/manage/ShopCard.tsx` is not rendered anywhere and was not changed.
Full suite: only `tests/unit/claude-hooks/*` fail (hook files missing, pre-existing).

**Rollout.** Set `NEXT_PUBLIC_MENU_PHOTO_COMPRESS=true` in DigitalOcean (build-time;
redeploy). Independent of the thumbnails flag. Rollback: unset and redeploy.

### 2026-09-24 — Feature: menu image thumbnails + long cache (Supabase egress)
status: DONE — acceptance green (tests/acceptance/menu-image-thumbnails.test.ts, 24/24). Rollout pending the owner.

**Problem (measured on production).** 60 shops; a menu has ~36 photos at 186 KB
average (owner uploads 466 KB — the inventory page uploads the camera file
uncompressed). The list card is 120 px but downloaded the full file: 6.5 MB for
a fully scrolled menu against 5 GB/month free egress. Uploads used Supabase's
default `max-age=3600`, so a diner returning next day re-downloaded all of it.
Lazy loading already existed in `MenuItemCard`.

**Design (no schema, migration or dependency change).**
- `menuImages.ts` — `<name>.thumb.jpg` beside the original; `menuThumbSrc`,
  `fallBackToOriginal`, `uploadMenuImage`. Flag `NEXT_PUBLIC_MENU_IMAGE_THUMBS`
  (OFF unless "true"); OFF = the exact single upload call of today.
- Thumbnail = the centre square that `object-fit: cover` shows, 360 px (120 px
  × 3 DPR), JPEG 0.85. Real library image: 145 KB → 35 KB, identical on screen.
- Originals never re-encoded: the same File object is uploaded.
- Every upload filename is already unique, so a one-year cache is safe.
- List card + 54 px detail header use the thumbnail; hero and banners keep the original.
- `scripts/backfill-menu-thumbs.mjs` — dry run by default, `--apply` adds
  missing thumbnails only (upsert false, no deletes). Uses `@napi-rs/canvas`,
  already installed via `pdfjs-dist` — no package.json change.

**Not done / known.** Existing originals keep their 1-hour cache (changing it
means re-uploading the original, which this feature never does). Full suite:
the four `tests/unit/claude-hooks/*` files fail because `.claude/hooks/*.mjs`
are missing from this checkout (pre-existing); `aiCostAbuse` flaked once under
full-suite load and passes alone.

**Fix (2026-09-24, found on the dev server).** A server-rendered thumbnail that
404s before React hydrates never reaches onError (React 18 does not replay it):
3–17 of 17 list photos stayed broken while thumbnails were missing. The card
now also checks its image on mount (`fallBackIfBroken`: requested, complete,
no pixels). Verified on the dev server: 0 broken in Chromium, Firefox and
WebKit, cold and warm cache.

**Rollout.** Merge (flag OFF) → backfill dry run → `--apply` → set
`NEXT_PUBLIC_MENU_IMAGE_THUMBS=true` in DigitalOcean (build-time; redeploy).
Rollback: unset and redeploy.

### 2026-09-19 — Feature: resilient menu extraction + PDF upload
status: DONE — all acceptance criteria green (docs/GOAL.md AC1–AC14)

**Problem (measured, not estimated).** On the single 512MB `basic-xxs` the
extract path held ~7× the upload in RAM (27MB per 10-photo scan, 193MB for one
30MB body). Every Pass 1 call reserved 16k tokens against the OpenAI per-minute
limit while using ~3k, so a burst of signups hit 429s and `allSettled` turned
them into menus with pages missing and a success message. Spend was bounded
only by an in-memory counter that each deploy resets.

**Design (no schema, infra or server-size change).**
- `boundedBody.ts` — body cut off at the limit while it streams (chunked too).
- `uploadAdmission.ts` — byte budget = 200MB ÷ 7; admitted before the body is
  read; FIFO wait then 503 BUSY + Retry-After; one scan per user (409).
- `openaiScheduler.ts` — per-model sliding-window token/request budget, learns
  limits from `x-ratelimit-*`, honours retry-after, deadline-bounded, circuit
  breaker, 0.9 safety margin on every limit.
- Token-aware admission + capacity claim — a scan that would time out waiting
  for OpenAI budget stays in the client queue (BUSY) holding no memory; a
  claim at admission stops a crowd arriving together from all being admitted.
- `menuExtractor.ts` — one call per photo (max_tokens 2,500); ladder: retry →
  gpt-4o-mini → 5,000-token retry → salvage cut JSON; 45k output budget per
  scan; explicit timeout, no hidden SDK retries; dedup keeps same-name items
  in different sections.
- `aiSpendGuard.ts` — daily USD budget, global ($25 default) and per account
  ($1 default). `storeEligibility.ts` — store limit checked before spending.
- Onboarding UI — bilingual (Tamil/English) messages for every code, BUSY
  auto-retry up to 12 min, partial-scan disclosure, "skip, add by hand",
  desktop drag-drop, touch-visible remove, HEIC handling.
- PDF upload — pdf.js in the browser renders each page (≤15) to a JPEG that
  joins the photos; the server never sees a PDF. Worker served from
  `public/pdfjs/` (copied at prebuild) because Next 14's Terser cannot minify it.

**Evidence** (`RUN_LOAD=1` harnesses in `tests/load/`; fake OpenAI with a real
TPM limiter, SDK retry emulation, time compressed 1:20; old code measured from a
git worktree at fdd7930 with the identical harness):

| 50 simultaneous onboardings, Tier 2 (450k TPM) | before | after |
|---|---|---|
| complete menus | 12/50 | **50/50** |
| menus silently missing items | 10 | **0** |
| items lost | 64.4% | **0%** |
| OpenAI 429s / silent SDK retries | 1,116 / 791 | **0 / 0** |
| peak server RAM added | 549MB (> 210MB usable: crash) | **121MB** |
| cost per complete menu | $0.121 | **$0.0645** |
| last user done (real time) | — | 5.5 min |

Capacity after (Tier 2): 100 simultaneous → 100/100, last done 10.5 min;
200 simultaneous → 122 served within the 12-min queue limit, 78 offered skip,
$0 spent on them, 0 partial. Tier 3 (800k): 50 → 50/50, last done 3.3 min.
Tier 1 (30k): before 0/3 complete, 77% lost silently; after 0/3 complete, 40%
lost and every lost photo disclosed — a 10-photo scan does not fit one Tier-1
window. **Operational action: the OpenAI account must be Tier 2 or above.**

| Abuse by one account | before | after |
|---|---|---|
| one chunked 200MB upload | 401MB RAM spike | 413 in 42ms, 0MB |
| five parallel 30MB uploads | 497MB RAM, $4.77 spent, 0 dishes | 413 ×5, $0 |
| ten dense 15-page scans | $9.54 spent, all 422 (cut JSON dropped) | $1.07, then capped (429) |

**Not done (needs owner approval: schema / infra).** Direct-to-storage uploads
+ durable job table; durable per-user quota in Postgres (the spend guard is
per-process and resets on deploy); ingress-level body limit.

**Tests.** `tests/acceptance/resilient-extraction.test.ts` (35),
`tests/acceptance/pdf-upload.test.ts` (8), opt-in load/abuse harnesses. Full
suite: 1,118 passed, 0 failed.

### 2026-09-19 — Dependency: `pdfjs-dist` (PDF menu upload)
status: APPROVED by owner 2026-09-19 (chose "pdf.js in browser" over OpenAI native PDF input)

**Why:** owners asked to upload PDF menus (up to 15 pages). Mozilla pdf.js
(Apache-2.0) renders each page to a JPEG **in the browser**, so every page then
travels the existing hardened photo pipeline unchanged: per-page extraction and
fallback ladder, "page N couldn't be read" disclosure, memory admission, magic-
byte validation. The server never parses PDF bytes — no PDF-parser attack
surface, no extra server RAM. Alternative rejected: OpenAI native PDF input
(one call per PDF, no per-page isolation or retry, no reliable server-side page
count without a PDF library anyway, higher token cost).

**Footprint:** loaded with a dynamic `import()` only when an owner picks a PDF
on the onboarding page; never in the server bundle or any other page. Pinned
exactly. Legacy build for older Android WebViews.

### 2026-09-10 — Feature: menu design themes (3, not 6)
status: IN REVIEW — public menu + owner controls built, not yet committed

Implements the PM decision of 8 Sep: ship a 3-design picker as a SALES tool,
refuse the 6-design switcher (RICE 1.4, last of 8), defer festival themes to
November behind a data gate.

**Architecture.** A design is a config value on the site row, never baked into
menu data — switching touches no product, no slug, no `qr_secret`, so printed
QR standees keep resolving. Delivered as CSS custom properties on `.qr-shell`,
because the menu is drawn in inline styles and `QRMenuTemplate` is 2,100 lines;
each `var(--qr-x, <classic literal>)` keeps the shipped value in source, which
is what `menu-card-system.test.ts` asserts on. Adding a 4th design is one entry
in `MENU_THEMES` — no component learns a name.

**Only 7 knobs move**: surface, card ground, radius (card + chip + thumb as one
shape), card edge, accent, font pair, density. The veg/non-veg/egg marks, the
`#FFECEC` offer tint, the `#13801C` saving, the badge palette and the sold-out
ramp are identical in every design. The food marks are regulated signals in
India and must never be owner-settable. That restraint is the whole economic
case for three designs over six.

**Motion is not the eighth knob.** One shared system (`lib/menu/menuMotion.ts`),
identical timings across designs: "smooth" is a baseline, not a brand
attribute. Transform/opacity only; no overshoot curve, because
`menu-card-system.test.ts` forbids `cubic-bezier(0.34,1.2,0.64,1)` here.

**Verified against the real database**, not only tests: set `final-test` to
premium/sharp/#1F3A5F and rendered it — 65 real dishes, real banner, price
computed `rgb(31,58,95)`. Restored afterwards; all 57 rows are back to
classic/#EF59A1. Contrast clamp confirmed live: `#FFEB3B` → `#7F751D`.

Vitest 714 passed, lint 0 errors, `tsc --noEmit` clean. Migration 052 applied.

**Not done:** visual click-through of the onboarding picker and the settings
Appearance tab (both auth-gated, needs a logged-in session); PLAN/GOAL not
rewritten for this feature.


### 2026-08-18 — Fix: CDN cache poisoning served RSC payload as dashboard HTML
status: DONE (code) / BLOCKED on operator steps (Cloudflare purge + cache rule)

- Diagnosed from production headers: Cloudflare ignores `Vary: RSC`, cached the
  flight payload under a URL-only key with Next's `s-maxage=31536000`, and
  replayed it for document navigations. Details in AGENTS.md.
- RED first: `tests/unit/middlewareCacheHeaders.test.ts`, 15/15 failing.
- `src/middleware.ts` — every returned response (redirects included) now
  carries `private, no-store, max-age=0, must-revalidate` on both
  `Cache-Control` and `CDN-Cache-Control`. GREEN 15/15.
- `src/app/manage/layout.tsx` — `export const dynamic = 'force-dynamic'` stops
  Next emitting `s-maxage` for `/manage/*`. Build confirms those routes moved
  from `○ (Static)` to `ƒ (Dynamic)`.
- Verified on a real `next build` + `next start`: all matched paths clean of
  `s-maxage` for both document and `RSC: 1` requests; `/_next/static` still
  `public, max-age=31536000, immutable`; `/pricing` still CDN-cacheable.
- Suite unchanged by this work: baseline 93 failed / 407 passed, after
  93 failed / 422 passed (+15 new). Pre-existing failures logged in AGENTS.md.

**Operator steps still required — the deploy alone does NOT fix production:**
1. Deploy.
2. Purge the Cloudflare cache (poisoned entries are up to 65 days old and will
   keep being served after a successful deploy).
3. Add a Cloudflare Cache Rule: bypass cache when the `RSC` header is present
   (`http.request.headers["rsc"][0] eq "1"`) — covers marketing pages and
   `/shop/[slug]`, which the code fix deliberately does not touch.
4. Re-verify: `curl -sSD - https://vsite.in/manage/dashboard` must return 307
   to `/login` with no `s-maxage`.
_Newest first. Claude appends each loop._

---

## 2026-08-18 — Freeze QR ordering, ship Smart QR Menu only

status: DONE (pending deploy decision on the 4 stores below)

### What shipped
One live product: Smart QR Menu, ₹299/mo, 7-day free trial, Razorpay purchase
flow unchanged. QR Ordering (with and without payment) is frozen behind
`ORDERING_FROZEN` in `src/lib/productFlags.ts`. No code deleted.

- **New:** `src/lib/productFlags.ts` (client-safe flags, `normalizePlan`,
  prices, `SELLABLE_PLANS`), `src/lib/frozenResponse.ts` (403 helper — separate
  module so `next/server` never reaches the client bundle).
- **Normalization:** `PlanContext.tsx` + `shop/[slug]/page.tsx` both run
  `normalizePlan()`, collapsing every store to `qr_menu`. Public menu resolves
  `tier = 'view'`, which removes cart, checkout, payment and Request-Bill.
- **19 API routes** return 403 `FEATURE_FROZEN`.
- **Purchase:** `create-subscription` refuses a frozen plan with 403
  `PLAN_NOT_SELLABLE` rather than silently downgrading it to a ₹299 charge.
- **UI:** upgrade cards + activation modals removed, orders console replaced
  with a placeholder (this also freezes the KOT Station Android app, which is
  just a WebView onto `/manage/orders`), settings tabs collapse to
  Store details + Danger zone.
- **Trial 14 → 7 days**, unified into one constant (was 6 definitions, 2 values).
- **Marketing/SEO:** pricing 3 cards → 1 on home and `/pricing`; comparison
  table removed; JSON-LD offers 3 → 1; fixed a stale `price: '399'` on
  `/features` for a tier that never existed; 74 trial-copy replacements across
  26 files; removed all ₹1,999 setup-fee claims (the code charges 0); removed
  the ₹499 ordering blog post + 301 → `/qr-menu` (added the first `redirects`
  block to `next.config.mjs`); rewrote ordering/UPI claims across blog and the
  13 SEO landing pages; corrected `/terms` (named a frozen plan, a setup fee we
  don't charge, and auto-renewal the billing flow doesn't do).

### Production data that shaped the decisions
- **0** active paid ordering subscriptions (2 stores on `qr_order`, both unpaid,
  0 on `pay_eat`) → the freeze costs nothing commercially, no refunds needed.
- **No orders since 2026-05-27** (~3 months) → no open tables to drain, so the
  planned "settle-only" dashboard view was dropped as unnecessary. The three
  payment settle/read routes were still left live as cheap insurance.

### ⚠️ Open item before deploy
**4 live stores** were created 8–14 days ago. Trial is computed as
`sites.created_at + DURATION` with no stored `trial_ends_at`, so moving to 7
days re-dates them and their menus go offline at deploy. This was an explicit
product decision. Either accept it, notify those 4 owners, or extend them
manually via `site_subscriptions.store_expires_at` before shipping.

### Tests
- New: `tests/acceptance/freeze-ordering.test.ts` (9) and
  `freeze-routes.test.ts` (5, real 403s from the actual handlers). All pass.
- **Test carve-out (deviates from "never edit tests to make them pass"):** 8
  suites covering QR ordering are excluded in `vitest.config.ts` while frozen —
  every route they exercise now 403s by design. They are excluded rather than
  rewritten so the specs survive for unfreeze. All 8 were **already failing
  before this work** in this environment (missing env/mocks), so the exclusion
  hides no regression introduced here.
- Suite goes from 93 pre-existing failures to 18, and the remaining 18
  (`routes` 11, `middleware` 6, `orderStatus` 1) match the baseline exactly —
  **zero net-new failures**. `npx tsc --noEmit` and `npm run build` are clean.

---

## Homepage redesign — "Grounded Bento"
status: IN PROGRESS

Design canvas: https://claude.ai/code/artifact/d2354fa4-92ff-4b8b-af28-810ecf342da8
Plan: `PLAN.md`. Artboards: `design/homepage/{Main,Mobile,System}.dc.html`.

### Why
The live homepage sold three frozen products (in-menu ordering, UPI/GPay
payment, live order feed, kitchen dispatch), shipped three invented
testimonials **with the "placeholder" footnote still rendered**, and emitted
`aggregateRating 4.8 / 124 reviews` in JSON-LD with no reviews behind it. It
also ran to 11,815px desktop / 13,750px mobile with 40+ measured WCAG AA
contrast failures.

### Done
- **Tests first.** `tests/acceptance/homepage-redesign.test.ts` — 19 assertions,
  RED at 18 failures before implementation, now 33/33 green across
  `tests/acceptance/`. Guards frozen-product claims, fabricated proof,
  `aggregateRating`, Material Symbols, `text-slate-400`, reduced-motion.
- **Tokens.** Warm AA-checked ramp (`ink`/`ink-70`/`ink-45`/`paper`/`paper-2`/
  `line`/`night`/`accent-text`) + fluid modular type scale + `section` spacing.
  Old colours untouched — the dashboard depends on them.
- **Motion system** in `globals.css`: CSS-only reveal primitive, five variants,
  masked headline rise, `lift`/`press`/`cta-arrow` micro-interactions, marquee,
  OCR scan sweep, scroll-driven progressive enhancement behind `@supports`, and
  a no-motion-first `prefers-reduced-motion` block.
- **`useInView`** now returns `visible: true` immediately under reduced motion
  and when `IntersectionObserver` is missing (it previously left such users
  looking at permanently hidden content).
- **Icons** → `lucide-react` (already a dep) on every homepage component.
- **Images** → `public/menu-photos/` (16 real AI-generated dish photos curated
  from the user's own folders). Replaces cropped dashboard screenshots.
- **Sections rewritten/added:** HeroSection, PhoneMenu, TrustBar, CostOfPaper,
  SetupSteps, MenuScan, DishWall, MenuBento, DinerFlow, Pricing, EarlyAccess,
  FAQ, FooterCTA, Reveal.
- **Deleted:** ProductCards, PainSection, SocialProof, CategoryStrip,
  CustomerExperience, LossAversion + five already-unused files.
- `npx tsc --noEmit` clean, `npm run lint` 0 errors, no horizontal overflow at
  390 or 1440.

### Measured
| | before | now | change |
|---|---|---|---|
| desktop height | 11,815px | 8,665px | −27% |
| mobile height | 13,750px | 12,582px | −8.5% |

Desktop is close to the target. **Mobile is not** — the artboard predicted
~9,700px. The extra height is real content (DishWall, the bento's stacked
tiles), not dead space, but mobile still needs a compression pass.

### Next
1. Mobile compression pass — the remaining gap to the artboard.
2. `tests/e2e/homepage-redesign.spec.ts` (Playwright half of the acceptance
   criteria: rendered contrast, height budget, reduced-motion).
3. Fill the `[X]` / `[FOUNDER NAME]` / `[CITY]` / `[DATE]` placeholders in
   `EarlyAccess` and `TrustBar` — they take props already.
4. `layout.tsx` still lazy-loads Material Symbols for `manage/`; homepage no
   longer uses it. Remove once the dashboard is migrated too.

### Revision 2 — owner feedback pass

1. **Navbar** rewritten. Scroll-aware: rides transparent over the hero, then
   materialises (paper bg, hairline, reading-progress bar) past 24px. Logo is
   now a drawn mark + wordmark + "Smart QR Menu" descender instead of the
   favicon PNG. Links grouped into a pill with real hit area. `MobileBottomNav`
   moved off Material Symbols — it was the last homepage file still using them.
2. **Hero** backdrop replaced. The three stacked violet blur circles are gone;
   it is now a four-layer mesh — cool indigo top-left, WARM ember bottom-right,
   masked dot grid, grain pass to stop banding on 6-bit panels. New micro-
   interactions: pointer parallax on the phone (rAF-throttled CSS vars, fine
   pointers only), depth-offset floating chips, glass sweep, gradient headline.
3. **Setup** copy per feedback (a/b/c). `MenuScan` replaced by `QRToMenu`: a
   printed table stand → arrow → the live menu it opens. The QR is a **real
   scannable code** to /demo via `qrcode.react` (already a dep).
4. **DishWall** → three rows, alternating direction, different speeds. Copy
   rewritten to the plainest register on the page.
5. **DinerFlow** → "So what does your customer actually do?" as a numbered
   4-step journey on a connecting rail, plus a "nothing changes for your staff"
   reassurance.
6. **Pricing** → warm ink band (distinct from the hero indigo) with the price
   card as a **restaurant bill**: docket header, dashed line items comparing a
   reprint against a year, ruled total, torn edge.
7. **Stats** → real numbers, owner-confirmed, from one exported constant
   `PROOF_STATS` in `Proof.tsx` (1,000+ menus · all 38 districts · 3 min).
   `EarlyAccess.tsx` deleted. TrustBar and FooterCTA read from the same
   constant, enforced by the acceptance test.
8. **Footer** rebuilt: brand block with contact affordances, four link columns,
   trust line, oversized clipped wordmark.

**Test change (documented, not a weakening):** the "leaves unverified numbers as
visible placeholders" assertion no longer describes the spec now that the counts
are confirmed. It is replaced by "sources every public count from one auditable
constant", which asserts `PROOF_STATS` exists AND that TrustBar/FooterCTA never
hardcode a count — strictly more constraining than what it replaced.

### Height — honest position
| | original | rev 1 | rev 2 |
|---|---|---|---|
| desktop | 11,815px | 8,665px | 9,987px |
| mobile | 13,750px | 12,582px | 14,608px |

Rev 2 is **taller**, and on mobile now exceeds the original. This is added
content, not returned dead space: two extra marquee rows, the QR→menu panel, a
fourth flow step plus reassurance block, and a much larger footer. Section
rhythm was tightened (64/104 → 56/84) and two genuinely duplicative mobile
blocks dropped, which clawed back ~700px.

If length matters more than these additions, the cheapest cuts in order are:
the DinerFlow reassurance panel (~300px), the QR→menu panel (~700px on mobile),
and the third bento tile row. That is a product call, not a technical one.

### Still open
- `founderName` in `Proof.tsx` defaults to `[YOUR NAME]` — not guessed.
- WhatsApp links use a placeholder number `919000000000`.
- `tests/e2e/homepage-redesign.spec.ts` still to write.

**Also removed:** the mobile scroll-up quick bar (`MobileBottomNav.tsx`,
rendered by `Navbar`). It re-appeared on every upward scroll, overlapped the
hero phone, and duplicated a CTA the sticky nav already carries.

### Revision 3

- **Sold-out badges → working toggles.** The static SOLD OUT / ON pills in the
  bento hero tile are now real `role="switch"` controls (`SoldOutDemo` in
  `MenuBento.tsx`). Flipping one greys the dish photo, swaps the price for
  "Sold out", and animates the knob on the spring curve. A badge *describes*
  the feature; a switch you can flip *is* the feature — and it is the only
  interactive element on the page, so it pulls the eye to the tile that
  matters most. Local state only; nothing persists or is sent anywhere.
  Verified with Playwright: 2 switches, correct `aria-checked` both ways,
  descriptive `aria-label`, and Enter toggles from the keyboard.
- **Dish wall: 3 rows → 2**, at every breakpoint (the mobile-only hide is gone).
  ROW_C's photos were folded into A and B, so all 16 still show — 8 per row.
  Two opposed rows already read as volume; a third added height without adding
  evidence.

Heights: desktop 9,863px · mobile 14,640px.

### Revision 4 — no decorative icons

Removed the `lucide-glyph-in-a-tinted-rounded-square` pattern, which was the
house style of every SaaS template and the only decorative element left on a
page whose whole argument is that everything on it is real. Three sites:

- **`MenuBento`** — the `Icon` fallback was already dead code: all four tiles
  pass a real artifact (dish photos, the bilingual line, the offer banner, the
  card + sticker). Deleted the prop, the fallback and three imports.
- **`SetupSteps`** — each step now leads with a miniature of the actual thing:
  a shop-name field mid-type with a blinking caret and the type chips; the
  notebook page inside camera viewfinder brackets; a real QR beside "sticker,
  stand or card". Drawn in markup, so crisp at any DPR and free to download.
- **`DinerFlow`** — icon squares dropped entirely. The numbered rail already
  *is* the icon; a glyph beside a numeral labelled with the same idea was
  redundant twice over.

Functional icons stay (arrows, chevrons, checks, mail, WhatsApp) — those are
affordances, not decoration.

Heights: desktop 9,842px · mobile 14,510px.

### Revision 5 — one logo, everywhere

The mark I had drawn in the nav was **wrong** — invented from memory of the
favicon as "three ascending strokes". The real vsite mark is a stepped bracket
plus a full-height bar (four rounded bars).

- **Traced properly.** Measured the real geometry off
  `public/android-chrome-192x192.png` by reading its pixels through a canvas
  (span-per-row scan), then verified the trace by overlaying the SVG on the
  raster — the traced shape covers the original with no bleed.
  Tight viewBox `0 0 147 152`, four rects.
- **New `src/components/Logo.tsx`** — single source of truth. Exports
  `<Logo>` (mark + wordmark, optional "Smart QR Menu" descender) and
  `<LogoMark>` (mark only). Four tones: `brand` / `light` / `dark` / `inherit`.
  SVG not PNG because it stays crisp at every DPR, costs no request, and
  **recolours** — the raster is locked to brand purple, which sits at poor
  contrast on the dark hero and footer.
- **Rolled out to 10 call sites**, replacing 4 wrong inline marks and 6 raster
  `<Image>` usages: `home/Navbar`, `home/FooterCTA`, `home/Pricing`,
  `home/QRToMenu`, `Sidebar` (×2), `login`, `signup`, `onboarding`, `error`,
  `not-found`. Six now-unused `next/image` imports removed.

Verified: 4 marks on the homepage, 1 each on login / signup / 404, zero page
errors, correct tone in both nav states.

**Open question for the owner:** `public/logo.png` sets the wordmark in heavy
UPPERCASE geometric type ("VSITE"), while the site has always rendered it as
lowercase "vsite" in Outfit. I kept the site convention. Worth aligning one way
or the other — the raster is what Google shows in structured data.

### Revision 6 — real contact details, centralised

Owner supplied: WhatsApp **9360706659**, founder **G Sri Gowtham**.

New `src/lib/brand.ts` — single source of truth for public identity and
contact. Created because `/contact` and `/demo` already carried the real
number hardcoded while the homepage still had `919000000000`; that drift is
exactly what a constant prevents.

Exports `WHATSAPP_NUMBER`, `WHATSAPP_DISPLAY`, `SUPPORT_EMAIL`,
`FOUNDER_NAME`, `FOUNDER_TITLE`, `FOUNDER_LOCATION`, `FOUNDER_INITIALS`
(derived from the name, not hardcoded, so it stays correct if the name is
edited) and `whatsappUrl(message?)`.

Wired into `home/FooterCTA` (×3), `home/Proof` (founder block + CTA), and
**refactored `/contact` and `/demo`** off their hardcoded copies.

Every WhatsApp link now carries a prefilled first message — it removes the
"what do I even say" pause and tells you which page the person came from with
no tracking. Verified rendered on the homepage:

    wa.me/919360706659?text=Hi G Sri Gowtham, I saw vsite online and want to set up my menu.
    wa.me/919360706659?text=Hi vsite, I have a question about the Smart QR Menu for my shop.
    wa.me/919360706659?text=Hi vsite, I would like to know more.

Founder block renders "G Sri Gowtham · Founder, vsite · Tamil Nadu",
avatar initials "SG".

All homepage placeholders are now gone. Remaining: none.

---

## QA pass — pre-production
status: PASS (with 4 defects found and fixed)

### Gates
| Gate | Result |
|---|---|
| `npm run build` | ✅ compiles; homepage 18.9 kB route / 233 kB first-load |
| `npx tsc --noEmit` | ✅ clean (one pre-existing `tests/load` error, untouched) |
| `npm run lint` | ✅ 0 errors; 0 warnings in any changed file |
| `npx vitest run` (full) | 18 failed / 353 passed — **identical to baseline** (routes 11, middleware 6, orderStatus 1). Confirmed via `git status` that none of those files were touched. Zero net-new failures. |
| `npx playwright test` (new suite) | ✅ **30/30** against the production build |

### New E2E suite — `tests/e2e/homepage-redesign.spec.ts`
30 tests, run against `npm start` (not `next dev` — dev serves unminified CSS
with different cascade timing). Covers: page/console errors, horizontal
overflow at 360/390/768/1280/1440, every reveal ending visible, WCAG AA
contrast, 12px type floor, 24×24 target size, heading hierarchy, image alt,
reduced motion, the sold-out toggles (mouse + keyboard + labels), FAQ
disclosure, mobile menu incl. Escape and scroll-lock, nav scroll state, frozen
product claims, fabricated proof + `aggregateRating`, unfilled placeholders,
contact details, the QR being genuinely scannable, every internal link
resolving, and the shared logo on 7 other routes.

### Defects found and fixed
1. **Nav tagline rendered at 9.5px.** `Logo` computed `size * 0.28`, giving
   9.52px at `size=34`. Floor raised to 12px.
2. **Nav tagline contrast 4.43:1** (needs 4.5) against the translucent scrolled
   nav. `ink-45` → `ink-70`, now 8.9:1.
3. **Footer links measured 23×23** — under WCAG 2.2 AA 2.5.8 (24×24 minimum).
   Added vertical padding.
4. **"same money" badge at 11px** → 12px.

### Defects that were in the TEST, not the product
Recorded because the reasoning matters more than the fix:
- Contrast checker resolved backdrop by walking `parentElement`. Wrong for the
  fixed `<header>`, which is a DOM child of `<main class="bg-paper">` but paints
  over the dark hero → reported white-on-white. **Hit-testing reflects paint
  order; the ancestor chain does not.** Now hit-test first, ancestors only when
  the element is absent from the stack (`pointer-events: none` overlays like the
  floating hero chips, which hit-testing cannot see at all).
- `elementsFromPoint` takes VIEWPORT coordinates, so measuring after scrolling
  back to the top sampled the wrong point for everything below the fold.
  Now walks the page and measures only what is on screen.
- Gradients live in `background-image`; `background-color` stays transparent.
  Text on a gradient is now checked against **every colour stop** and must pass
  the worst — the correct treatment, since copy has to stay legible across the
  whole sweep.
- Gradient-clipped headlines set `color: transparent` by design and are not
  measurable this way; excluded and checked by eye.
- `qrcode.react` emits the whole code as ONE `<path>`, so counting nodes proved
  nothing. Now asserts path-data length (>500 chars; actual 2,059) and a module
  viewBox — which also confirms the QR is genuinely scannable.
- Mock UI (phone screens, QR stand, setup miniatures) is now marked
  `data-mock="true"` and exempt from the type-size and contrast rules: it is a
  depiction of an interface at reduced scale, the same category as a screenshot.
  Real copy stays strictly checked.

### Performance (production build, local)
| | load | DCL | transfer | images | height |
|---|---|---|---|---|---|
| desktop 1440 | 394 ms | 47 ms | 321 KB | 1 (16 KB) | 9,841 px |
| mobile 390 | 442 ms | 41 ms | 326 KB | 5 (21 KB) | 14,596 px |

Above-the-fold image weight is small because `next/image` lazy-loads the dish
photos and serves them resized.

### Not covered — worth knowing before shipping
- Chromium only. No Safari/iOS or Firefox run (`playwright.config.ts` defines
  one project). **iOS Safari is the highest-value gap** given the audience.
- Dashboard (`/manage/*`) is auth-gated and was not exercised; `Sidebar`'s logo
  swap is verified only by typecheck and build.
- No visual-regression baseline; layout changes will not be caught automatically.
- Real-device testing on a low-end Android has not been done.

## 2026-08-27 — Monorepo restructure

status: DONE (restructure) / BLOCKED (owner actions below)

Deploy payload 106.38 MB -> 18.13 MB (apps/web); repo total 18.63 MB. App now lives in `apps/web/`.
Test fingerprint unchanged: 18 failed / 353 passed / 2 skipped (373); 3 test files failed / 10 passed (13).

Deletion audit (`91ef76b..HEAD`, `-M` for rename detection): all 2,413 deletions
fall inside the allowed set — `print-bridge/node_modules/**` (2,396),
`public/bys-print-bridge-setup.exe` (1), `print-bridge/dist/bys-print-bridge.exe`
(1), `food images 3/**` (14), `test-results/**` (1). No other deletions found.
366 renames detected in the same range, including
`src/components/home/HOMEPAGE_CONTENT.md` -> `archive/docs/HOMEPAGE_CONTENT.md`
(correctly a rename, not a delete+add).

Fresh-clone check: cloned `chore/monorepo-restructure` into a scratch
directory, confirmed `apps/web/package.json`, `apps/web/tsconfig.json`, and
`apps/web/next.config.mjs` are present, and confirmed every `@/...` import
under `apps/web/src` and `apps/web/tests` resolves to a real file. No
UNRESOLVED imports. Clone deleted afterward.

Note: three extra commits on this branch are not restructure tasks —
`91ef76b` (owner's own in-flight WIP snapshot, isolated at the branch base),
`72cc64e` (a controller fix committing 10 homepage components that were
tracked source already imported; without it a fresh clone would not build),
and `1c5d15d` (the Task 6 pre-step). None are defects.

### Owner actions required before next deploy
1. **Set Source Directory = `apps/web`** in the DigitalOcean console.
   The build FAILS at repo root without it — there is no `package.json`
   there.
2. **Upload `archive/print-bridge/dist/bys-print-bridge.exe`** to the
   Supabase `downloads` bucket. The settings-page download link 404s until
   then.
3. **Restore the three crons.** They have NEVER run on DigitalOcean —
   `vercel.json` and `netlify.toml` are both ignored by App Platform.
   Outbound email (`process-emails`, every minute), `cleanup`, and
   `expiry-reminder` are all affected. See `apps/web/.do/README.md` for
   options.

### Known pre-existing issues (NOT caused by this work)
- 18 failing tests: `tests/api/routes.test.ts` (11),
  `tests/unit/middleware.test.ts` (6), `tests/api/orderStatus.test.ts` (1).
- TS2802 at `tests/load/concurrent-orders.test.ts:214`.
- 23 seed images never wired into a seed script (`food-images-6/` has
  95 files, seeds 74; `food-images-3/` has 16, seeds 14).
- Five files over 1200 lines still need splitting — deferred by design.

## Marketing pages pass — nav visibility, pricing CTA, design alignment

status: DONE

**Reported defects**

1. *Nav invisible on every page but the homepage.* `Navbar` computed
   `onDark = !scrolled && !open`, so its light-on-dark treatment was
   unconditional. Only the homepage has a dark hero (`hero-mesh`), so on
   features/pricing/demo/blog/support the bar painted white-on-white and the
   links only appeared after scrolling. Fixed by making the treatment opt-in:
   `Navbar({ overDark = false })`, with `<Navbar overDark />` on `app/page.tsx`
   alone. Measured after the fix — links `rgb(74,68,62)` on `rgba(253,252,250,.9)`
   (8.9:1) on all five pages; homepage unchanged at `rgba(0,0,0,0)` / white 75%.
2. *"Ready to Go Digital?" removed from pricing.* It sat directly above
   `FooterCTA`, which is itself a full closing CTA on the same mesh.

**Design alignment (owner chose the full pass)**

The five inner pages were on a different system than the homepage — violet-50
gradient heroes, the cold `slate` ramp, Material Symbols icons, ad-hoc
`py-12/14/16`. All five now use the Grounded Bento tokens (`ink`/`ink-70`/
`ink-45`/`paper`/`paper-2`/`line`), the fluid `display`/`h2`/`h3`/`body`/
`caption` scale, Lucide icons, `py-section`/`lg:py-section-lg`, and a shared
`pt-32` hero band that clears the 4.5rem fixed bar (blog opened at `pt-16` and
tucked its eyebrow underneath it).

`PricingFAQ` and `SupportFAQ` were rewritten onto native `<details>/<summary>`
matching the homepage FAQ. Both dropped `useState` and their `'use client'`
boundary; answers now stay in the DOM for Google and find-in-page.

**Content mismatches fixed**

- Features advertised the frozen ordering products — Table Ordering, Live
  Kitchen Dashboard, Order Status Flow, UPI payments — none of which are in
  `SELLABLE_PLANS` while `ORDERING_FROZEN = true`. The homepage FAQ and support
  FAQ already said ordering is not part of vsite; features was the last page
  selling it. Group removed and rewritten around what ships. **To restore on
  unfreeze:** add the group back to `featureGroups` in `app/features/page.tsx`.
- Support SLA said "within 30 minutes during business hours" while demo and
  features said "within 2 hours on business days". All now say 2 hours.
- Demo's "What We'll Show You" listed "Real-time menu updates" and "Live menu
  updates" as two entries for one thing. Replaced with a four-beat timed agenda.
- Features repeated "Zero Commission" verbatim in two groups.
- Support FAQ group labelled "Orders & Payments" while every answer in it says
  vsite handles neither. Renamed "Orders & commission" in `faqData.ts` and on
  the quick-topic card.

**Verification:** `tests/acceptance/marketing-pages.test.ts` (39 assertions,
committed RED first — 26 failing — then green). Full suite: 392 passed, the
same 18 pre-existing failures in `routes.test.ts` (11), `middleware.test.ts` (6),
`orderStatus.test.ts` (1). `npm run lint` — 0 errors. `npx tsc --noEmit` — only
the known TS2802 in `tests/load/concurrent-orders.test.ts:214`.

**Still open (not done — needs an owner decision)**

Several blog posts still describe in-app ordering and payment as live
features — e.g. "How to Accept UPI Payments on Your Restaurant Table
(No POS Needed)", whose description reads "Customers scan, order, and pay
directly". That is article body copy in `src/content/blog/posts.ts`, not page
chrome, so it was left alone. It contradicts the corrected features and
support pages and should be revised or unpublished.

## Ordering frozen on every path — Smart QR Menu only

status: DONE

Owner instruction: "No order taking through any method anymore, only the Smart
QR menu." Audited all 19 order/payment-adjacent routes plus the customer menu
and the owner settings UI.

**Already correct — no change needed.** The freeze was thorough. 15 of the 17
new assertions passed before any edit:
- `shop/[slug]/page.tsx:73` — `tier` defaults to `'view'` and the assignment
  block is unconditional, so it fails safe. `normalizePlan` is the single choke
  point that strips cart, checkout, payment and Request-Bill from the menu.
- 13 order routes already returned `frozenResponse()`.
- The WhatsApp settings section is gated on `isQrOrder`, which comes from
  `usePlan()` → `PlanContext.tsx:78` → `normalizePlan`. Always false while
  frozen, so the section never renders. (An earlier session note claimed this
  toggle was reachable — it is not; the gate is one layer up in PlanContext.)

**Two gaps closed.**
1. `api/orders/[id]/verify-payment` was ungated — the only order-payment writer
   that could still execute. Now returns `frozenResponse()`.
2. `QRMenuTemplate.tsx:1918/1936` gated WhatsApp order-taking only via
   `tier === 'order_no_pay'`. Correct but indirect: one edit to the tier logic
   would silently re-expose it. Now `!ORDERING_FROZEN && …` names the flag.

**Deliberately NOT frozen.**
- `api/subscription/verify-payment` — owners paying ₹299. Freezing it stops
  revenue, not ordering.
- `api/orders/[id]/status` — read-only, creates nothing; signed email links to
  pre-freeze orders must keep resolving.

**Regression caught and fixed during this work.** Gating order verify-payment
made `tests/security/paymentAttacks.test.ts` fail 5 tests — the 403 fired
before the defences under test (signature forgery, replay/double-spend, amount
tampering, IDOR), so the suite would have passed vacuously and the coverage
would have vanished silently. That file now mocks `ORDERING_FROZEN: false` and
exercises the real handler, so the protections stay verified for the day
ordering is lifted. The two suites are complements:
`ordering-frozen.test.ts` guards the freeze; `paymentAttacks.test.ts` guards
what the freeze is hiding.

**Docs corrected.** `CLAUDE.md` claimed "WhatsApp ordering [is a] live feature"
and listed three sellable plans. Both were false and would have led the next
session to reintroduce ordering copy.

**Verification:** `tests/acceptance/ordering-frozen.test.ts` (17 assertions,
RED on the 2 real gaps first, then green). Full suite 409 passed — up from 392
— with the same 18 pre-existing failures in `routes.test.ts` (11),
`middleware.test.ts` (6), `orderStatus.test.ts` (1). Lint 0 errors, `tsc` clean
apart from the known TS2802. Live check: `POST /api/orders/whatsapp` → 403.

## Ordering repositioned as "coming soon" across all published content

status: DONE

Owner instruction: keep the mentions of menu ordering and UPI payment, but
change every article — blog, SEO, GEO, AEO — to say they are coming soon, with
the Smart QR Menu live since March 2026 and already in daily use.

Three inputs were confirmed with the owner before editing, because writing them
wrong across public SEO pages is hard to walk back: "UK payments" was a
dictation slip for **UPI**; "our window is live" meant the **Smart QR Menu**,
live since **March 2026**; and the marketing pages should move to match the
blog rather than staying silent.

**Single source of truth.** `src/content/roadmap.ts` holds
`SMART_QR_MENU_LIVE_SINCE`, `ORDERING_COMING_SOON`, `ORDERING_COMING_SOON_SHORT`
and `AVAILABLE_TODAY`. The previous round of stale claims survived precisely
because the same fact was written 30 times in prose; now the marketing pages
import the date, and whatever imports this module is the list to revisit on
launch day.

**Content corrected**
- `content/blog/posts.ts` — the article "How to Manage Restaurant Orders with
  vsite — Accept, Track & Fulfil" was a step-by-step how-to for a frozen
  feature. Rewritten (same slug, so no SEO equity lost) as "Order Management on
  vsite — How It Will Work When It Launches": opens with a not-live-yet
  callout, states what works today, then describes the flow in future tense.
- City/GEO article (`digital-menu-software-india-cities-2026`) — 8 edits.
  Madurai and Hyderabad claimed live UPI payment and "the QR ordering feature
  is popular"; the comparison table listed "QR ordering + UPI payment" as the
  key feature used in two cities.
- Contactless-dining article — "Step 3: Kitchen Screen" claimed orders arrive
  in real time. Now labelled coming soon, with a callout separating the
  industry-wide definition of contactless dining from what vsite does today.
- `content/seo-pages/data.ts` — 29 edits across qr-menu, digital-menu-india,
  cafe, cloud-kitchen, bakery, bar/pub, sweet-shop, ice-cream and
  online-menu-maker. The cloud-kitchen page was the worst: its H1 was "Cloud
  Kitchen Software with QR Menu & UPI Ordering" and it sold a Live Kitchen
  Dashboard, direct ordering and UPI payment as shipping features.

**Marketing pages aligned**
- `/features` — hero now dates the launch and says ordering is coming next; a
  new "Coming soon" band lists the four ordering capabilities on dashed-border
  cards with "Soon" chips, so they cannot be misread as the live feature cards
  above.
- `/pricing` — a roadmap note under the price: ordering with UPI arrives inside
  the same ₹299, no upgrade, no commission.

**`CLAUDE.md` rule relaxed.** Was "do not describe ordering as available in UI
copy, marketing pages or docs". Now: never as available, always fine as coming
soon, reuse the `roadmap.ts` strings. The old absolute rule would have led the
next session to delete this work.

**Verification:** `tests/acceptance/ordering-roadmap-copy.test.ts` (16
assertions, RED at 15 first). It guards both failure modes deliberately — it
fails if content claims ordering works today, AND it fails if ordering is
scrubbed from the content entirely, which is what the owner explicitly did not
want. Full suite 425 passed (up from 409), same 18 pre-existing failures. Lint
0 errors, `tsc` clean apart from the known TS2802. All six edited pages return
200 live.

## Fix: existing users with stores forced through onboarding as new users

status: DONE (bug fix). Onboarding redesign: proposed, awaiting direction.

**Reported:** owner signs in with OTP, is treated as a brand-new user and
pushed to `/onboarding?new=true`, cannot reach the dashboard. Escaped only by
completing onboarding (creating another store) — after which the dashboard
showed the 3–5 stores they already owned.

**Root cause.** `ManageLayoutClient` gated dashboard access on
`profiles.onboarding_completed` alone and never asked whether the account
already owned any sites. Two independent ways that flag misreports an existing
user, and both land on the same branch:

1. **The profiles row is missing.** Provisioning used to be gated on Firebase's
   `isNewUser` (true exactly once per account), so any account whose first
   sign-in failed after the Firebase account was created never got a row. Those
   users still created stores, because `sites` has no FK dependency on
   `profiles`. The heal path in `ManageLayoutClient` then INSERTed
   `onboarding_completed: false` — which is what pinned them inside onboarding.
2. **The row exists but the read returns nothing**, because `profiles` RLS is
   select-own against the Firebase uid (migration `002_firebase_auth_rls.sql`)
   and the token was momentarily wrong. Indistinguishable at the call site.

**Confirmed against production** (read-only, aggregate): 28 profiles, 55 sites,
**29 distinct site owners** — so at least one owner has no profile row. Two
owners currently hold sites with no `profiles` row at all and are locked out
right now. The reporter is no longer among them: completing onboarding set
their flag, which is why only one `onboarding_completed = false` row remains
and it owns zero sites.

**Fix.** Site ownership is the durable fact that makes someone an existing
customer, and it was the one thing the gate never consulted.
- New `src/lib/auth/onboardingGate.ts` — `decideOnboardingGate()`, a pure
  function, so the rule is unit-testable instead of buried in a React effect.
  Owning ≥1 site ⇒ allow, and flag the stored profile for repair when it
  disagrees. Zero sites ⇒ onboard. Errored read ⇒ fail open, write nothing.
- `ManageLayoutClient` now waits for the site list before deciding, and repairs
  a missing/stale profile row instead of trapping the user. The separate
  "deleted all stores" effect folded into the same decision.
- `api/onboarding/complete` changed UPDATE → upsert. A plain UPDATE against a
  missing row matches zero rows and *still reports success*, so an account with
  no profile could finish onboarding, be told it worked, and be bounced back on
  the next visit. That was the server-side half of the same bug.

**Verification:** `tests/acceptance/onboarding-gate.test.ts` (8 assertions, RED
first). Full suite 433 passed, same 18 pre-existing failures. Lint 0 errors,
`tsc` clean apart from the known TS2802.

**Not done — needs owner decision**
- The 2 locked-out owners heal automatically on next sign-in under this fix. A
  one-shot backfill would unblock them without waiting; it writes to production
  so it was not run unilaterally.
- `?new=true` is misnamed and overloaded (see notes for the redesign): it is set
  for a brand-new account, for "you deleted every store", AND by
  `DashboardHeader` when an existing owner adds another store. It means "fresh
  wizard, no back button", not "new user".

## Onboarding flow: one server-side entry point after OTP

status: DONE

Owner chose "server decides, one entry point". Backfill of the 2 profile-less
owners declined — they are test users, and the gate fix heals them anyway.

**New:** `src/app/auth/continue/page.tsx`. Both /login and /signup now redirect
here after OTP instead of each deciding for themselves. It verifies the Firebase
cookie server-side, counts the account's sites in a single `head: true` COUNT,
heals a missing `profiles` row, and issues the redirect before any HTML ships —
so no dashboard flash and no client round-trip.

**Why this shape.** The old flow asked "is this a new user?" twice, from two
unreliable signals, on two code paths: Firebase's `isNewUser` at the page level
(true exactly once per Firebase account, unrelated to store ownership), then
`profiles.onboarding_completed` in the client gate. Now it is asked once,
server-side, against site ownership. `ManageLayoutClient`'s gate stays as
defence in depth for direct navigation to /manage/* that skips this route.

**`?new=true` retired.** It was overloaded to the point of meaninglessness —
set for a brand-new account, for "you deleted every store", and by
`DashboardHeader` when an existing owner adds another store. It only ever meant
"fresh wizard, no back button". Replaced by an explicit
`?intent=first-store|add-store`. The onboarding page still accepts `new=true`
so links already in flight keep working.

**Open-redirect hardening.** `next` arrives from a query string. `safeInternalPath`
rejects protocol-relative (`//evil`), absolute, `javascript:` and
backslash-containing paths — a bare `startsWith('/')` check admits `//evil.example`,
which browsers follow off-site. Verified live: `?next=/manage/orders` is
preserved through the login bounce, `?next=https://evil.example` and
`?next=//evil.example` are both dropped to `/login`.

**Failure direction is deliberate.** If the site COUNT errors, `/auth/continue`
falls towards the dashboard, not onboarding. The dashboard's own gate fails open
too, so the user sees an empty dashboard they can retry — rather than being
marched through a wizard that has them create a duplicate store. Getting this
backwards is the bug the route exists to prevent.

**Verification:** `tests/acceptance/post-auth-destination.test.ts` (8
assertions, RED first) plus the 8 in `onboarding-gate.test.ts`. Full suite 441
passed, same 18 pre-existing failures. Lint 0 errors, `tsc` clean apart from the
known TS2802. Live: `/auth/continue` with no cookie → 307 to `/login`.

## Homepage: the offers card now demonstrates itself

status: DONE

The "Offers, live in a minute" bento tile held a static gradient strip — a
picture of an offer banner. It now carries a working control: flip the switch
and the diner's phone beside it updates. A visitor understands what "live in a
minute" means without signing up, which is the same argument the sold-out card
above it already makes.

**Layout.** Offers was promoted from a 1-column tile to a 2-column card (owner
control left, diner phone right) — a toggle and a phone cannot sit side by side
in a third of the row. With 5 tiles in a 3-column grid that left NFC alone
beside two empty cells, so NFC became a full-width strip. Rows now read
2+1 / 1+2 / 3 with no ragged edge. Short tiles gained `justify-center` because
they stretch to match the tall demo cards and were leaving a visible void.

**The phone reuses `QRToMenu`'s** — same 15rem body, 6px ink bezel, photo
header, veg/non-veg square, row treatment. New `dinerMenu.ts` holds the menu
data both phones render, so the two mockups on one page cannot list different
dishes or prices; `QRToMenu` now imports from it. A second, different-looking
phone would read as a second product.

**The micro-animation** is three cooperating pieces in `globals.css`:
`.offer-pop` (one-shot spring entrance for the badge and discounted price),
`.offer-pulse` (slow "live" breath on the dots — a hard blink is tiring and
reads as an error state), and `.offer-row-glow` (a ring that runs twice on the
offer's row then stops, so the eye is pulled to the ITEM, not just the banner,
without leaving a permanently flashing element on the page). Reduced motion
keeps every end state and removes only the movement.

**Two bugs found by measuring rather than eyeballing**
1. The banner's `grid-rows-[0fr]` collapse did nothing: grid items default to
   `min-height: auto` and refuse to shrink below content height. Needed
   `min-h-0` on the child. Without it the banner stayed 28px tall and merely
   turned transparent.
2. Row photos did not match their dish names (a momo under "Lunch Thali"). The
   tile two cards away promises photos "matched to the dish, not a stock
   plate", so the demo was disproving a neighbouring claim. Dishes are now
   chosen from the photos that exist.

**Test note.** `homepage-redesign.spec.ts` asserted the page has exactly two
`role=switch` elements; the offers switch makes three. Scoped that query to the
sold-out demo via a `data-testid` rather than bumping the number — the test is
about the sold-out toggles working, and a page-wide count would break again on
the next interactive demo. The `offer-demo` spec asserts the banner slot's
height rather than the element's presence: the banner stays mounted so it can
animate closed, and a clipped child still reports its natural bounding box, so
both `toHaveCount(0)` and `toBeVisible()` would misreport what a visitor sees.

**Verification:** `tests/e2e/offer-demo.spec.ts` (7 tests, RED first — off/on/off,
keyboard, live region, side-by-side on laptop, stacks without overflow on
390px). 37/37 Playwright pass across the homepage suites. Unit 441 passed with
the same 18 pre-existing failures. Lint 0 errors, `tsc` clean apart from the
known TS2802.

Note: `homepage-redesign.spec.ts` "every internal link resolves" fails against
`next dev` — the sequential fetches outrun the test timeout while pages compile
for the first time. It passes once warm. The spec header already says to run it
against a production build.

## QR menu card: P0 + P1 from the UX teardown

status: DONE (P0 and P1). P2 — scroll-spy nav, owner-set badges — not started.

**Defects fixed**
1. The detail sheet tested `ks_quadrant === 'star'` while the database stores
   `Star`, so the recommendation chip never rendered there once: the badge
   showed in the list and vanished the moment the customer opened the item.
   Replaced with `resolveBadge()`, which matches case-insensitively and covers
   all three quadrants rather than only Star.
2. `BrowseResultCard` (search) had no discount branch at all, so a customer who
   searched for a discounted dish saw full price. It now delegates to the same
   card as the main list.
3. The discount chip used `#13801C` — the exact green that means "vegetarian"
   inches away on the same card. Gone; savings read in brand pink, with green
   used only for the unambiguous "Save ₹65" money figure.

**New pure modules, so these bug classes are testable at all**
- `src/lib/menu/badges.ts` — `resolveBadge()` + the badge specs.
- `src/lib/menu/offer.ts` — `resolveOffer()`. Three rules the inline version
  lacked: the percentage is DERIVED from the two prices rather than read from
  the stored `discount_pct` (which does not follow later price edits, so a card
  could print "Flat 80% Off" above a price that was 20% off); an
  `original_price` at or below the selling price is refused instead of
  rendering "-25% OFF"; and a saving under 5% is not shown, because a 1% badge
  cheapens every real offer beside it. Also accepts numeric strings — the old
  `numMeta` returned 0 for them, silently disabling those offers.

**New `MenuItemCard`** replaces two drifted implementations. Grid layout with
automatic height: the old `height:138px` with absolutely-positioned children
was the structural blocker — no vertical room for a ribbon or badge without
overlap. An offer now restyles the whole card (tinted ground, brand border,
full-width ribbon), not just the price row, which is what makes it findable
while scrolling. Savings are stated in rupees as well as percent. Badges are
pills on the card body, not an 8px strip over the photo. Descriptions went from
10px/300/#808080 to 13px/400/#5C545C. The whole card carries an `aria-label`
naming the dish, its badge and both prices — the badge was `aria-hidden`.

**Motion layer** added to the template, which had three keyframes and one
0.12s transition: image skeletons with a shimmer and fade-in (photos used to
pop in as they decoded), a scale press state instead of an opacity drop, a
visible focus ring, and the offer ribbon's slow pulse. A
`prefers-reduced-motion` block now exists — there was none anywhere in the file.

**Hydration bug caught and fixed during the work.** The template's
`<style>{`…`}</style>` block escaped quotes differently server vs client once
the CSS contained `[data-offer="true"]`, producing a "Text content did not
match" hydration error. Converted to `dangerouslySetInnerHTML`, the standard
way to ship CSS from React.

**`/shop/preview` is now the visual harness** — its sample menu covers every
card state (plain, each of the three badges, offer, offer+badge, missing photo)
and is what the e2e suite drives.

**Verification:** `tests/unit/menuCard.test.ts` (11 assertions) and
`tests/e2e/menu-card.spec.ts` (11 tests), both RED first; the e2e suite passes
`--repeat-each=2` (22/22) after the goto helper was hardened — the preview route
resolves a Suspense boundary after `load`, and locators taken before that read
as detached, where `getComputedStyle` returns empty strings that look like
"styles are identical" rather than an error. Unit 452 passed with the same 18
pre-existing failures. Lint 0 errors, `tsc` clean apart from the known TS2802.

**Found, not fixed — needs a decision.** Microsoft Clarity is loaded in
`layout.tsx:216` but `clarity.ms` is absent from the CSP `script-src` in
`next.config.mjs:22`, so it is blocked on every page and has never collected a
session. Relevant because the point of this work is measuring order value.
CSP is security config, so it was left alone.

## Policy pages, billing truth and signup consent — status: DONE (2026-08-30)

**Why:** a smoke test of the payment lifecycle found three public claims that
did not match the code. vsite bills through the Razorpay **Orders** API — one
30-day period, paid manually, no card mandate — so there is no recurring charge
to cancel.

- `/terms` promised "cancel your subscription at any time from the Settings
  page". No such control exists anywhere in `/manage`; the only Cancel buttons
  close modals.
- `/pricing` and the footer sold the same non-existent button.
- `/privacy` named Stripe. Only Razorpay is wired up.

**Shipped**
- `src/content/policy.ts` — single source for the billing sentence.
  `TRIAL_DAYS` and `PLAN_PRICE_INR` derive from `productFlags` so they cannot
  drift from what is enforced.
- `/terms` and `/privacy` rewritten: accurate policy, moved onto the ink/paper
  design system (both were still on the slate ramp and started at `pt-16` under
  the 4.5rem fixed navbar), numbered clauses with a desktop contents rail.
- `/terms` opens with the 30-day cycle drawn as a four-step timeline
  (`components/policy/BillingCycle.tsx`).
- Signup takes an explicit ticked agreement to both documents before sending the
  OTP — guarded in `handleSendOTP` as well as on the button, because both inputs
  submit on Enter.
- `tests/acceptance/policy-and-consent.test.ts` — 24 assertions, green.

**Verified:** `npx vitest run` (18 pre-existing failures, unchanged),
`npm run lint` (no errors, no warnings on touched files), `npx tsc --noEmit`
(one pre-existing unrelated error in `tests/load/concurrent-orders.test.ts`),
`npm run build` (clean; /terms, /privacy, /signup, /pricing all prerendered),
and the rendered HTML checked over HTTP.

**Not done / follow-ups**
- `tests/api/routes.test.ts` is stale: 11 failures because it still tests the
  old Razorpay **Subscriptions** (autopay) flow — expects `subscriptions.create`,
  a 409 on an active sub, and a `subscriptionId` response. The route moved to the
  Orders API and now deliberately allows repurchase while active. These are dead
  tests, not regressions, but they mask real coverage of the payment path.
- No refund API route exists. Refunds are currently a manual Razorpay-dashboard
  action; the policy now says payments are non-refundable, which matches.

---

## 2026-08-30 — Pre-launch QA pass: full suite green

status: DONE

Ran the whole suite against a production build and fixed everything that was
red. Vitest **641 passed / 0 failed** (was 618/18), `tsc --noEmit` exit 0 (was
1), `npm run lint` 0 errors, `npm run build` clean.

**Product fixes**
- The JSON-LD `description` on `/` and `/about` said "AI-powered QR menus **and
  ordering**". Body copy was honest, but that string is what a search result
  shows, so the one place a stranger reads about us claimed a product we do not
  sell. Dropped "and ordering" from both.
- `console.log` × 23 across 10 routes → new `src/lib/platform/logger.ts`, whose
  `debug` is a no-op when `NODE_ENV === 'production'`. `warn`/`error` always
  run. Verified silent against the production server.
- `verify-payment` was printing customer invoice **email addresses** into the
  log drain on every successful payment. Now logs the count only.
- `tsconfig.json` had no `target`, so `tsc` fell back to ES3 and rejected
  `Set` iteration the app uses freely. Set `"target": "es2020"` to match SWC.
  (`incremental: true` caches diagnostics — delete `*.tsbuildinfo` when a
  compiler option changes or the old errors persist.)

**Stale suites rewritten to the shipped contracts** (all were testing the
*absence* of defences that have since landed, per the follow-ups noted above):
- `tests/unit/middleware.test.ts` — forged tokens signed `fakesig` were being
  asserted as ACCEPTED. The middleware verifies RS256 against Google's JWKS
  now, so they were correctly rejected. Mocked `jose` (signature checked before
  `exp`, so genuine-but-expired stays distinguishable from forged) and added
  the missing cases: a forged token must reach /login and never /auth/refresh,
  and every response must carry `no-store`. 14 → 20 passing.
- `tests/api/routes.test.ts` — the Razorpay mock exposed `subscriptions.create`
  while the route calls `orders.create`, so the route 502'd and read as a
  provider outage; `409 on active sub` became "allows early renewal"; the
  response field is `orderId`, not `subscriptionId`; `/api/images/match`
  authenticates from the session **cookie**, not a bearer header; and the
  onboarding route takes **JSON**, not FormData. Replaced every hand-built
  `select().eq().single()` ladder with a chainable `qb()` helper so the next
  added `.eq()` does not read as a 500.
- `tests/api/orderStatus.test.ts` — asserted an UNauthenticated caller receives
  `customer_name`, `items` and `subtotal`. The route deliberately withholds
  those; order ids travel in shareable URLs. Split into the progress-only case,
  an explicit "withholds PII" case, and the signed-link full-receipt case.

**Left alone deliberately**
- The menu card offer treatment. `tests/e2e/menu-card.spec.ts` (uncommitted)
  demanded an `offer-ribbon` element reading "SAVE ₹65 · 25% OFF", which
  `tests/acceptance/menu-card-system.test.ts` forbids outright — that file
  freezes the design settled on the canvas: one signal, the tinted ground, with
  the saving in the price row. The E2E spec's stated reason ("an offer restyled
  only the price row, so it was invisible while scrolling") is not true of the
  tint. Fixed the spec instead; the component is unchanged. Two of its
  assertions were broken under *either* design: it compared `backgroundImage`
  (`none` on both cards) where the tint uses `background-color`.

**Follow-ups**
- `tests/e2e/menu-card.spec.ts` line ~91 is flaky under parallel load — it
  waits on `networkidle` and passes in isolation. Worth a deterministic wait.
- Sentry deprecations at boot: `disableLogger` and `automaticVercelMonitors`
  in `next.config.mjs` move under `webpack.*` in the next major.


---

## Dashboard UX pass (two review reports) — status: DONE

Acceptance: `tests/acceptance/dashboard-ux.test.ts` (15 assertions, written RED
first). Full suite green: 30 files, 729 passed / 2 skipped. `tsc --noEmit`
clean, `next lint` clean of new warnings.

The reviews ran against **production**, so several findings were already fixed
in the working tree and are not re-fixed here. Findings were re-validated
against local source before any change.

**Revenue — an active plan could not be renewed**
`subscription/page.tsx` disabled its only button whenever the plan was active
(`disabled={isQrMenuActive || isTrialActive}`), and `openPayment()` returned
early on the same condition. Renewal was reachable *only after expiry*, while
the page told the owner "Renew to extend". `verify-payment` has always based a
same-plan renewal on `Math.max(Date.now(), currentExpiryMs)` — the backend was
built for early renewal and the UI forbade it. Button now reads "Extend by 30
days — ₹299" while active.
⚠️ The success detector watched "did any plan become active", which is already
true during a renewal and resolved the modal before `verify-payment` wrote
anything. It now compares expiry against a baseline captured when the modal
opens (`expiryAtOpenRef`).

**The printed poster**
`qr_menu` was routed to `/brand poster scan order.png` — a baked PNG whose
wording (an instruction to order) and artwork (sports equipment) are pixels, so
neither was fixable as copy. Menu-only plans now get `drawMenuPoster()`, drawn
on canvas at 1240×1754: design-system indigo, "SCAN FOR MENU" with the Tamil
line, a three-step how-to, no ordering language. Ordering plans keep the baked
templates for unfreezing.

**Ordering copy in dashboard chrome**
Seven strings swept. `ordering-roadmap-copy.test.ts` only reads `src/content/**`,
so everything under `app/manage/`, `app/login`, `app/signup` and `components/`
drifted freely — that is how "Manage your orders in real-time" survived.
`dashboard-ux.test.ts` now covers those surfaces.

**Dead controls**
Header search was a bare `<input>` with no `onChange` and no results surface —
now routes to `product-inventory?q=`, which the inventory page seeds from. The
"⌘ + F" hint advertised a Mac chord to Windows/Android owners and bound
nothing; it is Ctrl+K and actually bound. Login/signup "Support" and "Help
Center" both pointed at `#`; one working Support link remains. Insights' "Today"
was a `<span>` in link-blue reading as a range picker — `menu-summary` exposes
no range parameter, so it is now styled as the label it is.

**Layout**
- Subscription: `lg:grid-cols-3` inside `max-w-3xl` with one card under the
  freeze gave a 224px card in a 1105px column. Column count now follows card
  count; features run two-up.
- QR: tracks were `1fr 340px` with the poster in the narrow one. Now `1fr
  340px` with the poster ordered into the wide track, and `order: 0` on mobile
  so it is no longer 661px down a 583px viewport.
- Inventory: added `ProductThumb` (list had no photos at all despite every
  product having one), two-line mobile card, search box, "onwards" on variant
  prices.
- Setup guide: completed steps fold behind a "N done" row. Insights moved from
  754px to 554px on the dashboard.

**Touch targets**
Mobile Edit and Delete were 30×30 with a 4px gap — a mistap destroyed menu
data. Card body is now tap-to-edit, the sold-out switch sits between it and
Delete, and every one of those is ≥44px. Category chips raised to 44.

**Other**
- Microsoft Clarity was loaded on every page and refused by our own CSP, so it
  recorded nothing. Added `clarity.ms` to `script-src`/`connect-src`.
- QR card request had **no City field** — the address was undeliverable. Added
  through the route and the notification email, with pincode `inputMode`
  numeric + 6-digit validation and a real Indian-mobile check. Shop name and
  phone now prefill.
- OTP inputs got `autocomplete="one-time-code"`, ids and per-digit labels.
- `#99A1AF` (2.60:1 on white, below AA) replaced with `#6B6A7B` across the
  dashboard surfaces.

**Not done — needs backend or product decisions**
- Invoice history / GST invoice download on the subscription page. There is no
  invoice source for `qr_menu`; the layout leaves room for it.
- A real Today/7-day/30-day range: `menu-summary` returns only `scans_today`
  and all-time totals.
- The ₹299 plan lists "NFC card + QR stickers" as included while the QR page
  charges ₹99/card. **This is a pricing decision, not a code fix** — left for
  the owner to settle, then change both strings together.
- Structured opening hours, category title-casing, and moving "Delete Category"
  out of the product drawer.

---

## Mobile UX pass + two reversals — status: DONE

750 tests green (32 files), `tsc --noEmit` clean, lint clean. Verified in
Chrome at 412×850 on every screen changed.

**Removed rather than half-fixed**
- Global header search (desktop inline, mobile icon and expanded row), the
  Ctrl+K binding, and the `?q=` handoff. Owner's instruction: if it does not
  work, remove it.
- The in-page product search on `product-inventory`.
- QR page "Design Tip" card and the disabled "Customise Poster — Soon" button.
- The page-level "N products missing an image" banner. The same fact was on
  every affected card, so the page looked like it had two problems. The flag
  now sits beside the sold-out toggle, where the owner is already tapping.

**Sticker order status**
Ordering stickers only sends an email — there is no orders table — so the card
looked untouched afterwards and an owner could not tell whether the request
went through. Now records the order and shows "N stickers ordered on DATE".
⚠️ Held in **localStorage**, so it is per-device: a second phone will not show
it. Durable status needs a table and a migration, which was not in scope.

**Mobile bug found while verifying**
`.qr-poster` was `position: sticky` at every width. In the single-column mobile
layout a sticky element taller than the viewport stays pinned and paints over
what follows — it was completely hiding the sticker card. Sticky is now scoped
to `min-width: 961px`.

### Two reversals, both the owner's call

**1. The poster is back on the owner's "Scan & Order" artwork.**
*(Superseded 2026-09-26 by the owner: frozen / qr_menu posters now read "SCAN FOR MENU" — see the top entry.)*
`drawMenuPoster` is deleted; `qr_menu` composites onto
`/brand poster scan order.png` again.
⚠️ **This conflicts with the ordering freeze and that is known and accepted.**
The poster goes on a customer's table telling them to order, while every order
route returns 403. Flagged before implementing; the owner confirmed. Do not
"fix" this silently — it is a decision, not an oversight.
`tests/acceptance/dashboard-ux.test.ts` now guards the chosen shape and carries
the before/after in a docblock.

**2. No early renewal. Plain 30-day cycle.**
`Extend by 30 days` removed; an active plan shows a disabled "Current plan"
with "Active until <date>". `openPayment` refuses again while active, and the
success detector no longer needs the expiry baseline (with no early renewal the
plan is always inactive when the modal opens, so "a plan became active" is once
again a sound signal on its own).
⚠️ Accepted consequence: the owner cannot pay before expiry, so the menu is
offline between expiry and payment. The T-3 reminder email is what keeps that
window short.

**Unchanged by request:** banner management, settings.

---

## Per-site invoices + zoom-robust layout — status: CODE DONE, MIGRATION PENDING

752 tests green, `tsc` clean, lint clean.

### 1. Invoice history was not isolable — schema gap, not a query bug

`billing_history` had no `site_id`. It recorded *who* paid, never *which store
the payment was for*, so an owner with five stores saw one merged list on all
five. No query could have separated them.

- **Migration `053_billing_history_site_id.sql`** adds `site_id uuid` →
  `sites(id) ON DELETE SET NULL` (a deleted store must not erase the record
  that money changed hands), plus `(user_id, site_id, created_at DESC)`.
- **Backfill is deliberately partial.** Only 5 of 40 existing rows can be
  attributed with confidence — those whose payer owns exactly one store. The
  other 35 belong to multi-store owners and nothing distinguishes them:
  `plan_name` does not name a store, and two stores on the same plan match on
  amount and date. Guessing would file a real payment under the wrong store,
  which is worse than leaving it NULL.
- Both writers (`verify-payment`, `razorpay` webhook) now record `site_id`.
- The endpoint **requires** `site_id` and 400s without it — defaulting to
  "every store this user owns" is the bug being fixed.

⚠️ **The migration has NOT been applied.** Until it is, the invoice panel shows
its error state, because the query filters on a column that does not exist.
Applying it is a schema change against production billing data and needs an
explicit go-ahead.

### 2. Zoom broke the layout because breakpoints measured the wrong box

Chrome desktop zoom does not scale the layout — it changes how many CSS pixels
fit. 150% on a 1440px monitor is a 960px viewport. That part is fine; the bug
was that breakpoints measured the **window** while content sits in a column the
sidebar has already narrowed. At a 1020px window the content area is 956px, so
`lg:` (1024px) said "phone" and handed a 956px column the phone layout —
stretched, with a dead gap between each dish and its toggle.

Fixed with **container queries**, so a component responds to the space it
actually has regardless of whether a sidebar, a zoom level or a small window
took it:

- `.cq` / `.cq-wide` / `.cq-narrow` in `globals.css`; the narrow layout is the
  default and width must be *earned*.
- Product list switches table↔cards on **container** width (720px), not
  viewport.
- Table tracks were ~742px of fixed columns — nothing could give ground when
  space tightened. Now intrinsic `minmax()`, defined once as `GRID_TRACKS` and
  shared by header, skeleton and rows so they cannot drift apart.
- `.qr-grid` aside: hard `340px` → `minmax(260px, 340px)`.
- `min-w-0-all` opts flex/grid children back into shrinking — the usual cause
  of a row overflowing when squeezed.
- Fluid type helpers (`clamp()`) available for headings.

**Verified** at container widths 1200 / 956 / 820 / 720 / 640 / 520 / 420 /
360: correct layout at every step and **zero horizontal overflow at any width**.

---

# Security remediation — 2026-09-12

status: DONE

All 14 findings from `SECURITY_FINDINGS.md` are fixed. `npx vitest run` 833
passed / 1 skipped (37 files, was 752/2 across 32), `npx tsc --noEmit` clean,
`npm run lint` clean (pre-existing warnings only).

Five new suites, written failing-first:
`tests/security/subscriptionReplay.test.ts`, `cronAuth.test.ts`,
`aiCostAbuse.test.ts`, `publicEndpoints.test.ts`, `configHardening.test.ts`.

## What was actually wrong

**1 — CRITICAL. One ₹299 payment bought an unlimited subscription.**
`verify-payment` deleted its replay check on the stated reasoning that "the
subscription update below is idempotent". It was not: it computed
`max(now, current_expiry) + 30 days` and ran unconditionally, so re-POSTing the
same Razorpay success payload — a static HMAC the customer's own browser
receives — added 30 days per call, 10/hour. The `billing_history` unique
constraint was explicitly tolerated, so it deduplicated the *invoice* while the
subscription kept extending, and one payment row was all the evidence left.
Fixed by making activation a conditional update on `razorpay_status='created'`
— the same predicate the Razorpay webhook already used — plus nulling the
consumed `razorpay_subscription_id`. A replay now matches zero rows and returns
`alreadyActive` with the *stored* expiry.

**2 — HIGH. `curl -H 'x-vercel-cron: 1'` was a valid credential.** Sound on
Vercel, which strips the header at the edge; vsite runs on DigitalOcean, which
forwards it. The route fired paid ZeptoMail sends, stamped
`expiry_reminder_sent_at` on live rows, and returned a churn dashboard in the
response body. **5 — MEDIUM**, same family: `cron/cleanup` did
`if (!secret) return true` in front of a bulk delete. The three cron routes had
three hand-rolled auth checks — one correct, one fail-open, one bypassable.
Replaced with one shared `authorizeCron`, fail-closed, constant-time.

**3 — HIGH. `bulk-import/insert` had no rate limit and a quota that could not
hold.** It charged `photosCount` (a request-body number, 1–5) for work driven by
`items.length` (up to 300 → six parallel GPT-4o-mini calls); it charged *after*
the spend and only on success; and it incremented by blind upsert of `read + n`,
so twenty concurrent requests all read zero and the counter finished at one
increment. Now: rate limited, metered in AI work units computed from the
payload, and reserved by compare-and-swap *before* the first OpenAI call, with a
release on failure.

**4 — HIGH. GST verification was an unmetered pay-per-lookup drain**, cache
bypassed by varying a GSTIN that was only format-checked. **Frozen**, per your
call that GST belongs to the phased-out ordering product: `verify`, `complete`
and `reset` now return `frozenResponse()`; `GET .../gst` stays open so settings
can still render stored state. The settings tab was already unreachable
(`qrMenuOnly` hides it, `normalizePlan` makes every store `qr_menu`), so this
costs no working UI — the routes were reachable only by direct HTTP. Added to
`ordering-frozen.test.ts`, so they come back with the product.

**6-14** — `authorized` payments no longer activate a plan (funds reserved,
never captured, auto-void); order/amount now asserted against Razorpay's own
record; upload routes bound the body before `formData()` buffers it; the
menu-scan limiter no longer keys on a header the caller writes, and gained a
per-site bucket; `orders/[id]/status` is throttled *before* its 800ms timing pad
rather than after; the Sentry example route and page are deleted; the invoice
recipient list no longer includes the `X-User-Email` request header; CSP drops
`unsafe-eval`; Postgres and ZeptoMail error text is logged instead of returned.

## Behaviour changes a real user could notice

- **Bulk import allowance is now metered by work, not photo count.** A 60-item
  import costs 3 of 15 units/day (~5 imports); a 300-item one costs 7. Items
  that arrive with descriptions are nearly free. The old counter was 15 of a
  unit that did not track cost. Error copy says "of 15 today" rather than
  "photos".
- **Bulk import is capped at 10 requests/hour per user.** Placeholder — I have
  no usage distribution. Say the word and I will re-tune it.
- **A payment caught mid-capture returns 202 `PAYMENT_PENDING`** instead of
  silently activating. The client should poll rather than show an error.
- **Menu scans are capped at 120/minute per store.**
- **Order-status polling is capped at 60/minute per IP** (the screen polls ~0.5/s).
- **Invoices no longer go to an address passed in a request header** — only to
  `sites.notification_emails` and `profiles.contact_email`.

## Not closed from the repo — needs you

1. **Set an ingress body limit** on the DO app. The in-handler checks cannot see
   a chunked request, and `formData()` buffers before handler code runs.
2. **Give the crons a real schedule.** `kind: PRE_DEPLOY` runs once per deploy.
3. **Smoke-test signup (Firebase OTP) and a ₹299 checkout** after the CSP change.
4. **Confirm `CRON_SECRET` is set on the DO app** — routes now fail closed.

## Addendum — found by running the server, 2026-09-12

**Finding 15. Two of the three cron routes answered 405 to the scheduler.**
Every job in `.do/app.yaml` invokes its route with `curl -X POST`. `cleanup` and
`process-emails` exported only `GET`. So on DigitalOcean neither has ever run:
**the email queue has never been drained** — invoice and expiry mail have been
queuing in `email_queue` since the platform move, not failing, just never
picked up.

Not a vulnerability, and no unit test would have caught it: each route
authenticated correctly and then 405'd on the verb. It showed up in the first
curl against a running server. `cronAuth.test.ts` now asserts each route answers
the verb `.do/app.yaml` actually sends, and reads the spec file to check the two
have not drifted apart again.

Live-verified against `npm run dev` (all three routes):
forged `x-vercel-cron` → 401 · no credentials → 401 · wrong secret → 401 ·
correct secret → 200.

Suite after the fix: 844 passed / 1 skipped, tsc clean, 0 lint errors.

## Finding 13 (CSP) — verified end-to-end against a production build

Removing `'unsafe-eval'` is **safe**. Verified in Chrome against `npm run build
&& npm run start`, not against the dev server — the distinction turned out to
matter.

**The dev server reports a false positive.** On `npm run dev` the console shows:

    EvalError: Evaluating a string as JavaScript violates the following
    Content Security Policy directive ... 'unsafe-eval' is not an allowed source

Its stack frame is `@next/react-refresh-utils/dist/runtime.js` — Fast Refresh,
which exists only in development and is not in a production bundle. Reverting
the CSP on that evidence would have restored the weakness to satisfy a tool that
never ships. **Anyone re-testing this must use a production build.**

Against the production build, the full phone-OTP path ran clean:

  login → reCAPTCHA init → OTP send → OTP verify → Firebase token →
  POST /api/auth/session (same-origin check enforced, NODE_ENV=production) →
  cookie set → middleware verify → dashboard

Zero CSP violations. Zero console errors of any kind. So reCAPTCHA — the bundle
most likely to have wanted eval — does not need it.

Also incidentally confirmed on the production build: `/api/auth/session`'s
same-origin guard accepts a legitimate same-origin DELETE (it is only active
when NODE_ENV=production, so a dev run never exercises it), and the middleware
expired-token → `/auth/refresh` silent-refresh path works.

---

## 2026-09-13 — Signup friction pass: OTP entry, menu questions, Store Details

status: DONE (code) · migration 054 PENDING APPLY

Three small, high-traffic surfaces. Everything shipped TDD: failing
acceptance committed first, then implementation. Full suite green —
916 passed, 1 skipped, 40 files. No new dependencies.

### 1. OTP entry (`tests/acceptance/otp-entry.test.ts`)

Three defects, one cause. `handleOtpChange` did `value.slice(-1)` — it
assumed a box only ever receives one character, which is what typing
looks like. Paste and iOS/Android autofill both deliver all six digits
to a single box, so five were discarded; and `handleOtpPaste` never
called `preventDefault()`, so the native paste re-entered that same
handler and undid the six boxes it had just set. Auto-verify did not
exist at all.

New rule: a box may receive any number of characters, from any source,
and the form distributes them. Parsing is now a pure module
(`src/lib/auth/otpInput.ts`), the React parts a shared hook
(`src/hooks/useOtpInput.ts`), so /login and /signup cannot drift again.

Auto-submit is guarded by a ref keyed on the code — Firebase consumes a
code on first use, so a double fire flashes "invalid code" at an owner
whose login succeeded. Same reasoning as the post-otp-handoff fix.

**Deliberately NOT built: the WebOTP API.** It only fires for an SMS
whose last line is `@domain #code`. Firebase Auth does not send that
format, so it would be dead code that looks like a feature.

`AuthUser` gained a read-only `phoneNumber` (off the Firebase user) so
settings can prefill the number the owner already verified. Additive;
no auth logic touched.

### 2. Onboarding menu questions (`tests/acceptance/onboarding-navigation.test.ts`)

All of it follows from one fact: a real menu is 40+ items, so reaching
Continue means being scrolled to the bottom.

- `transition()` swapped the step without resetting scroll, so question
  2 opened partway down its own grid, heading off-screen. Reset now
  happens inside the 280ms fade where the jump is invisible.
- Back existed only in a non-sticky header — gone from view at exactly
  the moment it is wanted. Each question now has its own Back beside
  its own Continue. The header one stays.
- Publish loader gained "Adding images to your items…", before "Almost
  ready…". It is the slowest step and the one being paid for.
- Skip removed (owner request): with nothing selected, Continue already
  produced the same menu.

### 3. Store Details (`tests/acceptance/store-details.test.ts`)

Removed the two fields that ask an owner to do marketing — logo upload
and description — plus the `show_logo` toggle that existed only to hide
the first. 052 had already conceded the point in a schema comment
("most stores have no logo") and shipped the toggle anyway.

Added what is true of every store and answerable in a tap: business
type (5 chips, TN-weighted — mess/tiffin is not a restaurant), location
+ PIN with validation, and a timing picker (24h chip or half-hourly
dropdowns) replacing the free-text box that collected "9-11" and
"morning to night". Mobile is seeded from the OTP-verified sign-in
number when blank, and stays editable — a shop's published number is
often the counter landline.

**The one real loss, and its replacement.** `sites.description` was the
meta description and OG blurb for every public menu. It is now BUILT
from type + location (`buildMenuDescription`), so every menu gets its
own sentence without anyone writing one, and it cannot go stale. Per-
store OG images are gone with the logo; the root layout default covers
the card.

Two dead components (`MenuTemplate.tsx`, `ShopTemplate.tsx`) were
unreferenced by anything and only surfaced because they read the
dropped columns. Moved to `delete/` rather than patched — one of them
carried placeholder copy about "artisans worldwide" from a different
product entirely.

**Tests deleted, with explicit owner sign-off:** the `show_logo`
assertions in `tests/acceptance/menu-theme.test.ts` and
`tests/api/menuThemeRoute.test.ts`. This is feature removal, not
test-gaming — `store-details.test.ts` now asserts the ABSENCE of all
three columns, which is strictly stronger. Flagged and approved before
the change because CLAUDE.md forbids editing tests to make them pass.

### Migration 054 — NOT YET APPLIED

`supabase/migrations/054_drop_site_branding.sql` drops
`sites.image_url`, `sites.description`, `sites.show_logo` and the two
archive columns, and adds `sites_pincode_format`.

Order is load-bearing and asserted by the test: `delete_site()` (from
015) is rewritten BEFORE the columns it SELECTs into `deleted_sites`
are dropped, and offending legacy PINs are NULLed before the CHECK is
added. One transaction.

**The app code is already deployed-shaped for post-migration.** Nothing
selects the dropped columns any more — Supabase 400s a whole query on
an unknown column, so a stale name would take out the entire settings
screen, not just one field. Apply 054 before shipping this code.

Uploaded logo FILES are intentionally left in storage. Deleting bytes
is not something a schema migration should do silently.

### 2026-09-17 — Reliability audit: three live defects fixed
status: DONE

A full-stack bug hunt (UI → API → auth → DB → external services). Three
confirmed defects, each reproduced with a failing test before any fix, plus one
finding reported and deliberately left unimplemented. Full suite 953 passing,
`tsc --noEmit` clean, `next lint` exit 0.

**1. Rate-limit windows longer than 5 minutes did not exist (P1).**
`sweep()` in `lib/platform/rateLimit.ts` evicted buckets on a hardcoded
5-minute idle threshold, and `rateLimit()` sweeps before it reads the key — so
the bucket was rebuilt empty on the next call. All seven `windowMs: 60*60_000`
call sites were really ~5-minute limiters. Worst case is
`/api/onboarding/extract`, where that limiter is the ONLY thing in front of a
paid GPT-4o vision call. Eviction is now derived from each bucket's own
`windowMs`. Regression: `tests/unit/rateLimit.test.ts`.

**2. Paying customers who abandoned a renewal stopped getting expiry warnings (P2).**
`razorpay_status` is the activation replay guard, so create-subscription resets
it to `'created'` on every order — including an early renewal by an active
customer. Abandon the Razorpay modal and the row stays `'created'`. The
expiry-reminder cron filtered on `'active'` and silently skipped them; the store
went dark with no warning. The sweep now keys off `store_expires_at`, which is
NULL by default and written only after capture. Regression:
`tests/api/expiryReminder.test.ts`.

**3. Un-awaited Supabase writes could exit the process (P1).**
Six fire-and-forget chains used `.then(({ error }) => ...)` with no rejection
handler. PostgREST errors resolve in band, but transport failures reject —
unhandled, on Node 22, that exits the process, and `instance_count: 1` means the
whole platform. `notify()` is on the revenue path (verify-payment, un-awaited).
Fixed with `then`'s second argument, because `PostgrestBuilder` only implements
`PromiseLike` and has no `.catch()`. Regression:
`tests/unit/fireAndForget.test.ts`, whose scanner is await-aware so it does not
demand handlers on awaited chains that already surface as a 500.

**REPORTED, NOT FIXED — `/api/manage/menu-summary` scans_total (P2).**
`scans_total` selects every `menu_scans` row a site has ever recorded, with no
bound, and dedupes visitor_ids in JS — on an endpoint the dashboard polls every
30s. One row is written per pageload, not per visitor, so the table grows with
traffic forever and nothing purges it (`cron/cleanup` does not touch it). Two
consequences: wasted CPU/network that scales with store age, and — if the
project's PostgREST "Max Rows" is at the Supabase default of 1000 — a silently
truncated "Total Visitors".

The correct fix is a `count(distinct visitor_id)` RPC, which needs a migration.
CLAUDE.md forbids writing migrations without explicit instruction, so this is
left for a decision rather than implemented. Suggested shape: one SQL function
returning today's and all-time distinct counts, replacing both row-fetches.

### 2026-09-17 — One loading system, replacing 47 ad-hoc indicators
status: DONE

Every loading affordance in the product was hand-rolled. The audit found 47:
29 `animate-spin` rings across 14 files, 18 inline `animation: spin` across 7,
`@keyframes spin` declared 6 separate times, five duplicate opacity-pulse
keyframes, and 4 raw "Loading..." strings — drawn in four different purples
(`#5137EF`, `#5452F6`, `#5E17EB`, a stray `blue-600`).

**Design.** Every one of the 47 was a rotating ring — the most generic loading
affordance in software, and one that collapses to a grey smudge at 12px on the
phones this dashboard actually runs on. `BrandLoader` already owned a better
gesture: the vsite mark assembling by raising its four bars in sequence. That
stagger is now the loading gesture at every scale, same easing, same 0.12s
offset, so the splash and a 12px button spinner are one idea at two sizes.
Skeleton sweep and progress track travel the same left-to-right axis.

**Built** (`src/components/loading/`, motion once in globals.css):
Spinner (5 sizes × 4 tones), Skeleton/SkeletonText/SkeletonRows, ProgressTrack
(indeterminate + determinate), SectionLoader, PageLoader, LoadingOverlay.

**Two judgement calls, not oversights.** The dashboard refresh button keeps a
rotating icon — the glyph is the affordance and bars would remove its meaning;
it moved to the shared `.vs-icon-spin`. `LaunchLoadingScreen`'s ring became a
static icon well plus a ProgressTrack, because menu extraction runs to 60s and a
spinner held that long reads as stuck, which is when owners reload and lose
their upload. `BrandLoader` keeps its inlined CSS (hydration-critical).

**Accessibility.** Decorative by default — a spinner in a button labelled
"Saving…" must not announce itself twice. Only region-level loaders take
`role="status"`; ProgressTrack is a `role="progressbar"`. Reduced motion keeps
every indicator visible and drops the movement.

**Verified.** Reviewed in-browser on a temporary kitchen-sink page (since
deleted): the first pass rested at 0.32 opacity and read as pale lavender
dashes at small sizes, so the floor was raised to 0.55 — the resting state is
what a spinner mostly looks like, not the peak. `tsc --noEmit` exit 0,
`next lint` exit 0, `vitest` 953 passing. No ad-hoc indicator remains: rotating
rings 0, inline spins 0, duplicate keyframes 0.

---

## Concept-based dish-image matching — status: DONE (pending backfill decision)

Branch `feat/concept-image-matching`. Goal: `docs/GOAL.md`. Research and evidence:
`docs/image-matching-rnd.md`. Benchmark output: `docs/poc/image-matching/BENCHMARK.txt`.

**Why.** `Dal Fry` was showing the **fish fry** photo. Tracing it found the
keyword tier was innocent (it correctly returned null at 0.50 against a 0.80
bar) — the wrong image came from the vector layer beneath it. Three structural
causes: the index embeds two-sentence *descriptions* rather than dish names; the
thresholds (0.35 / 0.45) sit below the measured noise floor, where 88% of the
library has a decoy above 0.45; and the matcher had no way to abstain. Cosine
was being used as a decision when it is only a ranking.

**What shipped.** `conceptVocabulary.ts` (data: ~190 concepts, aliases, diet,
core/head roles) and `conceptMatcher.ts` (normalise → phrase concepts → token
concepts with a Damerau-Levenshtein typo fallback → five hard gates →
IDF-weighted Jaccard → specific/generic/abstain). `imageLibrary.ts` caches the
library per process, selecting only `image_url, description` — never
`embedding`, which is ~4–5 MB of egress per cold start. Both call sites now
share one matcher, ending the 0.35-vs-0.45 disagreement between onboarding and
the inventory screen. The OpenAI embedding call, the gpt-4o-mini rerank and the
`match_default_image` RPC are gone from the request path.

**Measured, 1,067 real production item names:**

| | before | after |
|---|---|---|
| veg item shown a non-veg photo | **20** | **0** |
| coverage | 85.8% | 83.5% |
| gained an image | — | +82 |
| lost an image | — | −106 (only **17** were plausible; 89 were already wrong) |
| per-item latency | network-bound | **0.28 ms** |
| OpenAI calls per onboarding | 1 + N reranks | **0** |

**Three bugs the tests found, not anticipated.** SHAWARMA was classified as
inherently non-veg, which made the matcher reject `veg shawarma`'s own correct
picture. `fries` (a potato dish) was conflated with `fry` (a method), sending
"loaded fries" to fried-wings. And Gate 4 originally blocked any coreless query
from a cored image, which cost 8 shawarma variants their photo — relaxed to
require a head disagreement too, recovering 32 items.

**Known follow-ups, not done here.**
- 17 genuine regressions, all one shape: a known core plus a modifier-only query
  (`butter paneer`, `chilli fish`, `mushroom chilly`) where Gate 5 abstains
  rather than crossing a head boundary. Fixable in the vocabulary.
- The 20 wrong images already live are **untouched**. Nothing recomputes stored
  `image_url`; only items created or edited after deploy use the new matcher.
  A backfill needs a dry-run report and explicit approval first.
- `roll` appears on 28 distinct menus and the library has no roll photograph.
  No matcher change substitutes for taking the picture.

**Verified.** `npx vitest run` 1047 passing / 1 skipped (44 files, includes 94
new acceptance assertions across 10 acceptance criteria), `npx tsc --noEmit`
exit 0, `npm run lint` clean for all new files.

## 2026-09-23 — AI menu page limits per store (`ai-page-limits`) — status: BUILT, in QA

Contract / design / architecture: `docs/features/ai-page-limits/`. Flag `AI_PAGE_LIMITS` (default OFF).

**Rules (owner):** onboarding 15 pages per store; bulk upload 2 pages for the whole trial,
5 per billing month once paid (resets on the payment date), 0 after an unpaid trial.
Unread pages refunded. No rupee meter (owner: pages alone keep a trial store ≤ ₹35).
Onboarding is now English only (owner amendment during build).

**Built:** migration `057_ai_page_usage.sql` (expand-only; NOT applied yet — release step),
`lib/menu/aiPageLimits.ts` (pure rules + modal view), `lib/menu/aiPageLedger.ts` (RPC wrapper,
never throws), `GET /api/bulk-import/allowance`, page gates in onboarding extract / bulk extract,
bind in `/complete`, per-user $ cap on bulk extract + insert (AC9), bulk modal with PDF.

**Found while building:** the ledger could throw out of best-effort paths (bind in `/complete`,
refund in `finally`) when the DB client threw or resolved empty — both would have turned a
successful launch into a 500. Fixed test-first. Found only by running the whole suite with the
flag ON, which is now part of the exit check.

**Verified:** `npx vitest run` 1174 passed / 3 skipped with the flag OFF **and** with it
temporarily ON; `npx tsc --noEmit` exit 0; `npm run lint` no errors (pre-existing warnings only;
touched files clean).

**Open for QA / release:** apply 057 via `apply_migration` (owner approves) before the flag-ON
deploy; E2E `tests/e2e/ai-page-limits.spec.ts` on the flag-ON commit; business-context.md must
exist for business QA.
