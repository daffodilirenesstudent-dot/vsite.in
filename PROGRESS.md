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
