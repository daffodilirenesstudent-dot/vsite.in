# Progress Log
status: DONE
## Iteration history

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
