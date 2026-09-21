# Agent Notes
_Gotchas, conventions, and dead-ends discovered while building. Append-only. Read at the start of every session._

## CDN cache poisoning of RSC payloads (2026-08-18)

**Symptom.** `https://vsite.in/manage/dashboard` rendered the raw React flight
payload (`2:I[9107,[],"ClientPageRoot"]…`) as plain text instead of the
dashboard.

**Cause.** Next.js serves two bodies from one URL — `text/html` for a document
navigation, `text/x-component` for an RSC navigation — and signals it with
`Vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch`. Cloudflare honours
`Vary` only for `Accept-Encoding`, so its cache key was URL-only and whichever
variant was cached first was replayed to everyone, for the
`s-maxage=31536000` Next.js stamps on statically prerendered routes. Measured
inversion: a plain GET of `/manage/dashboard` returned `text/x-component`,
while a GET of `/` with `RSC: 1` returned `text/html` with `Age: 5638846`.

**Second-order effect.** A CDN hit never reaches the origin, so middleware
never ran: an anonymous GET of `/manage/dashboard` returned `200` instead of a
`307` to `/login`. The auth gate was bypassable whenever Cloudflare had a HIT.
No user data leaked — the dashboard is `'use client'` and loads everything
through authenticated API calls, so the cached payload was an empty shell.

**Gotcha worth remembering.** Middleware-set response headers DO override the
static route cache's `Cache-Control` in Next 14 — verified on a real
`next build`/`next start`: `/login` returned `x-nextjs-cache: HIT` *and*
`cache-control: private, no-store`. Do not assume the route cache wins.

**Deliberately NOT fixed in code.** Marketing pages outside the middleware
matcher (`/pricing`, `/features`, `/shop/[slug]`) still carry
`s-maxage=31536000` and remain exposed to the same HTML/RSC swap — cosmetic
there, since nothing varies by cookie. Widening the matcher would put a
JWKS-backed `jwtVerify` on the `/shop/[slug]` QR-menu hot path to fix a
cosmetic bug on brochure pages. The correct fix is a Cloudflare Cache Rule
bypassing cache when the `RSC` header is present; a CDN cache key cannot be
expressed in application code.

**Blocker — pre-existing red test suite.** `npx vitest run` is red on master
independent of this work: 93 failed / 407 passed across 11 files. In
`tests/unit/middleware.test.ts` the cause is stale tests — they forge JWTs with
`fakesig`, which the real `jwtVerify` correctly rejects, and they still assert
the `expired=true` redirect that `/auth/refresh` replaced. Hypothesis: never
updated when the silent-refresh flow landed. Not fixed here (CLAUDE.md: do not
modify tests to make them pass; out of scope for this fix).

## New signups never got a `profiles` row (2026-08-18)

**Symptom.** Phone+OTP signup created the Firebase account, but `profiles` had
no row for it.

**Root cause — one-shot provisioning gate.** `AuthContext.provisionNewUser`
inserted the profile only `if (isNew)`, where `isNew` came from Firebase's
`getAdditionalUserInfo(credential).isNewUser` — true exactly once per account.
It ran AFTER `await syncCookie()`, which POSTs `/api/auth/session`, rate
limited to 30/min/IP. Any failure in between (429 under a signup burst, a
dropped mobile connection) aborted `verifyOTP` with the Firebase account
already created. On the retry `isNewUser` was false, so the insert was skipped
— permanently. The comment claiming "both writes are idempotent so a retry
heals partial failure" was true of the subscription upsert and false of the
profile, which the `isNew` gate excluded.

**Why nothing else recovered.** `AuthContext` held the ONLY profiles insert in
the codebase; `/api/onboarding/complete` merely UPDATEs, and a zero-row UPDATE
reports success, so `onboarding_completed` never got set. `ManageLayoutClient`
sends a user with no profile row to `/onboarding?new=true` — which completes,
updates nothing, and bounces back. An unbreakable onboarding loop.

**Second defect.** `provisionNewUser(uid, phone, name, isNew)` accepted `phone`
and never wrote it, so `profiles.phone_number` was never populated even when
the row existed. `DashboardHeader` selects that column.

**Third defect.** The thrown `Error('Failed to create your profile…')` was
routed through `friendlyAuthError`, which only maps Firebase `code` values and
so replaced it with "Something went wrong. Please try again." — erasing the one
detail that would have identified this in production. Fixed with a distinct
`ProvisioningError` type the auth layer passes through verbatim.

**Fix.** Logic extracted to `src/lib/provisionUser.ts` (unconditional,
idempotent, writes `phone_number`, tested in `tests/unit/provisionUser.test.ts`)
and called on every `verifyOTP` BEFORE the cookie sync. `ManageLayoutClient`
heals a missing row on dashboard load, because `/auth/refresh` renews an
expired token without going through `verifyOTP` — so a stranded live session
would otherwise never re-provision.

**Latent issue, NOT the cause, worth fixing separately.** Migration 002 claims
`public.custom_access_token_hook` "fires when Supabase issues a session token
and stamps 'authenticated' onto every Firebase login". That is wrong: Supabase
Auth hooks fire only for tokens Supabase Auth itself mints, never for
third-party Firebase JWTs passed via the client's `accessToken` option. Firebase
tokens therefore carry no `role` claim. It does not block these writes — the
live policies from 003/015 use `(auth.jwt() ->> 'sub')` with no `TO` clause, so
they evaluate for any role — but anything later written as `TO authenticated`
will silently fail for every user. The supported fix is a Firebase blocking
function setting a `role: "authenticated"` custom claim.

**Gotcha.** CLAUDE.md says "No Prisma, no Drizzle, no migrations folder in
repo". Stale — `supabase/migrations/` exists with 50+ files and is the only
record of the live RLS policies.

### Production data confirming the above (checked 2026-08-18, read-only)

Queried via the service-role REST API (the Supabase MCP server was not exposed
to the session).

| Check | Result |
|---|---|
| profiles rows | 24 |
| user_subscriptions rows | 23 |
| distinct site owners | 25 |
| profiles with `phone_number` set | **2 of 24** |
| subscription rows with no profile | 0 |
| **site owners with no profile row** | **2** |

Both defects are confirmed live, not theoretical:

1. **22 of 24 profiles have a null `phone_number`** — the unused `phone`
   argument. One row even has `full_name = "+911234567890"`, the phone-as-name
   corruption `DashboardHeader` already guards against.

2. **Two owners have a LIVE site but no profile row AND no subscription row:**
   `menu-demo` ("menu demo", created 2026-08-05) and `blackbloom`
   ("BlackBloom", created 2026-08-07). Neither write ran for them, which places
   the failure before `provisionNewUser` — i.e. the awaited `syncCookie` threw,
   the Firebase account already existed, and every retry afterwards saw
   `isNewUser === false`. They completed onboarding anyway, because
   /api/onboarding/complete creates the site with the service-role client
   (bypassing RLS) and its profile UPDATE silently matched zero rows. Their
   menus are serving customers while their dashboard bounces to /onboarding on
   every visit and they have no plan/limits row at all.

**This also rules out the competing hypothesis.** 24 profiles were created by
the client-side path, so Supabase third-party auth and the RLS INSERT policy
work correctly. The missing `role` claim from migration 002 is latent, not
active — it blocks nothing today.

---

## Product freeze: QR ordering (2026-08-18)

vsite now sells **one** product: the Smart QR Menu (`qr_menu`, ₹299/mo, 7-day
trial). QR Ordering without payment (`qr_order`) and with payment (`pay_eat` /
legacy `pro`) are **frozen, not deleted**.

**Single switch:** `ORDERING_FROZEN` in `src/lib/productFlags.ts`. Flip to
`false` and redeploy to restore all three products. It is a hardcoded constant,
not an env var, deliberately: a missing `NEXT_PUBLIC_*` on a fresh deployment
would silently *unfreeze* the product. A constant fails closed.

### Gotchas for anyone touching this

1. **Two unrelated Razorpay systems.** Do not confuse them.
   - *SaaS billing* (how vsite gets paid): `api/subscription/*`,
     `api/webhooks/razorpay/route.ts`. **Live — never freeze.**
   - *Sub-merchant OAuth* (how a restaurant took customer payments):
     `api/manage/payments/razorpay/*`, `api/webhooks/razorpay/oauth/route.ts`.
     This is the ordering-payment surface.

2. **Block CREATE, never block SETTLE or READ.** A payment captured just before
   deploy still needs its webhook to land, or we take money and never provision.
   Deliberately left live: `api/orders/[id]/verify-payment`,
   `api/orders/[id]/status`, `api/webhooks/razorpay/oauth`, and
   `api/webhooks/razorpay`. Do **not** add a `plan !== 'qr_menu'` rejection to
   the webhooks — they must honour whatever plan is in an existing order.

3. **Normalize the plan, not just the booleans.** Several call sites read the
   raw plan or the raw DB row and bypass `PlanContext`. The two chokepoints are
   `PlanContext.tsx` (dashboard) and `shop/[slug]/page.tsx` (public menu); both
   run `normalizePlan()`. `manage/subscription/page.tsx` deliberately reads the
   *stored* plan so a paying ordering customer still sees a truthful billing
   state.

4. **`isQrMenu` changed meaning.** It used to be `!isPayEat`, which was also
   true for `qr_order` stores — six call sites hand-rolled
   `isQrMenu && !isQrOrder && !isPayEat` to compensate. It now genuinely means
   menu-only, and those derivations were simplified.

### Accepted residuals (app-layer freeze only — migrations untouched)

- `process_order_v2` still reads `store_plan` from the DB and would still accept
  a `qr_order` store. It needs the service-role key, which only our server
  holds, so the route-level 403s make it unreachable in practice.
- `supabase/migrations/011_atomic_store_limits.sql:23` hardcodes
  `v_trial_ms := 14 days` for store-limit enforcement, so the DB enforces a
  14-day window for store limits while the app enforces 7. Divergence is known
  and deliberate.

### Trial duration was a live bug

`TRIAL_DURATION_MS` was defined in **6 files at two different values** — 7 days
in `PlanContext`, 14 days in `toggle-live`, `shop/[slug]`, `DashboardHeader`,
`onboarding/complete`. The dashboard expired the trial at day 7 while the public
menu stayed live to day 14. Now defined **once**, in `productFlags.ts`, and a
test asserts it is never redefined elsewhere.

## Gotcha — staggered reveals need a parent-keyed CSS rule

`<Reveal stagger={n}>` (src/components/home/Reveal.tsx) puts `data-visible` on
the **parent** and leaves `data-reveal` on each **child**. The obvious CSS —
`[data-reveal][data-visible='true']` — therefore never matches a staggered
child, and every staggered element sits at `opacity: 0` forever. It looks like
an IntersectionObserver bug and is not one.

`globals.css` needs BOTH selectors:

```css
[data-reveal][data-visible='true'],
[data-visible='true'] > [data-reveal] { opacity: 1; transform: none; }
```

Symptom if the second is missing: sections render at full height with correct
layout but invisible text — large blank bands in a full-page screenshot.

## Gotcha — editing globals.css can wedge `next dev`

Editing `src/app/globals.css` while the dev server is running can leave the
Tailwind utilities layer stale (`__webpack_modules__[moduleId] is not a
function` in the browser console, then a page that renders with no utility
classes at all — unstyled black text on white). It is not a Tailwind config
error. `rm -rf .next` and restart the dev server.

## Repo layout gotchas (2026-08-27)

- **Run everything from `apps/web/`.** `npm`, `npx vitest`, `npx tsc`,
  and `npm run lint` all fail at the repo root — there is no
  `package.json` there by design.
- **`@/*` still means `apps/web/src/*`.** `tsconfig.json` moved with
  `src/`, so the alias is unchanged.
- **`src/lib` has no barrels, deliberately.** Import deep paths
  (`@/lib/platform/db/supabase-server`). A barrel re-exporting a
  `server-only` module would break any client component importing an
  unrelated symbol from it.
- **`archive/` is never build context.** Do not import from it.
- **`*.exe` is gitignored.** Binaries go to Supabase Storage.

## Post-OTP routing: never ask Firebase whether a user is new

`getAdditionalUserInfo(credential).isNewUser` answers "was this Firebase account
created just now?" — NOT "does this person have stores?". The two diverge, and
trusting the former routed owners of live stores into onboarding as new users
with no exit but creating a duplicate store.

`profiles.onboarding_completed` is not trustworthy either: the row can be
missing (provisioning was once gated on `isNewUser`, so accounts whose first
sign-in failed never got one — while still creating sites, which have no FK to
`profiles`), or present but invisible, since `profiles` RLS is select-own
against the Firebase uid.

**Site ownership is the deciding fact.** One place decides:
`src/app/auth/continue/page.tsx`, using `resolvePostAuthDestination`. The client
gate in `ManageLayoutClient` uses `decideOnboardingGate` for the same rule and
exists only as defence in depth for direct /manage/* navigation. Do not add a
third answer to this question.

Also: a Supabase `.update()` against a missing row matches zero rows and STILL
reports success. `api/onboarding/complete` upserts for exactly this reason.

## A red test may be asserting the absence of a defence

Three suites here failed *because the code got safer*, and each one read like a
route bug until traced:

- Middleware forges a JWT and signs it `fakesig`. Signature verification
  against Google's JWKS landed, so the token is now correctly rejected — the
  test was asserting that forged tokens are accepted.
- `/api/orders/[id]/status` stopped returning `customer_name`, `items` and
  `subtotal` to unauthenticated callers, because order ids travel in shareable
  URLs. The test asserted the PII was present.
- `/api/images/match` moved from a bearer header to the session cookie, so a
  header-authenticated test gets a correct 401.

Before "fixing" a route to satisfy a red test, check `git log` on the route: if
the behaviour changed deliberately, the test is what needs rewriting. CLAUDE.md
says fix the implementation, not the test — that rule assumes the test still
describes the intended contract.

## Two test files can encode two different designs

`tests/acceptance/menu-card-system.test.ts` freezes the QR-menu card design and
says so ("frozen here so it cannot drift back"). It forbids an offer ribbon
outright. `tests/e2e/menu-card.spec.ts` was later written demanding one. Adding
the ribbon turns the acceptance suite red; the frozen file wins. Read the
acceptance suite before changing anything in `MenuItemCard.tsx` or
`menuTokens.ts`.

## `tsc --noEmit` caches its diagnostics

`tsconfig.json` sets `incremental: true`, so `*.tsbuildinfo` replays previous
errors even after you fix the compiler option that caused them. Delete the
buildinfo when an error survives a change that should have cleared it.

## Mock supabase query builders chainably, not shape-by-shape

Hand-written `select().eq().eq().single()` ladders in `tests/api/routes.test.ts`
had to mirror each route's call chain exactly, so adding one `.eq()` produced
`undefined is not a function` → a 500 that looked like a route bug. Use the
`qb()` helper in that file: any chain, one settled result.

## Never log PII, even at debug level

`src/lib/platform/logger.ts` — `debug` is a no-op in production, `warn`/`error`
always run. `verify-payment` was printing customer invoice email addresses on
every successful payment. Log the shape (a count, an id, a duration), never the
addresses, tokens or card details.


## The menu's frozen suites read SOURCE TEXT, not rendered output

`tests/acceptance/menu-card-system.test.ts` `readFileSync`s `MenuItemCard.tsx`,
`menuTokens.ts` and `QRMenuTemplate.tsx` and regex-asserts on literals. Moving a
hex into a theme object breaks it even when the rendered pixel is identical, and
CLAUDE.md forbids editing tests to pass. The way through is additive: leave `T`
exactly as it is and layer `TV` on top, where every entry is
`var(--qr-x, <the classic literal>)`. The literal stays in source, so the suite
still finds it, and Classic stays byte-identical for the live menus.

## `sites.primary_color` predates the migrations folder

It existed with the DASHBOARD's violet `#5137EF` as its default and was read by
zero lines of code. Migration 052 repurposed it as the menu brand colour and
backfilled every row to `#EF59A1`. If you find a column nothing reads, check
whether it is genuinely unused before adding a parallel one.

## A theme default is exempt from the contrast clamp; owner input is not

`resolveAccent()` darkens an owner's colour to 4.5:1 because the accent is drawn
as price text. The shipped pink is only 3.2:1 — clamping it would silently
restyle every live menu, so design-reviewed defaults pass through untouched and
a stored value equal to the theme default is treated as the default. Do not
"fix" that asymmetry without re-reviewing Classic.

## The live menu gate is trial-based, and every test store has lapsed

`shop/[slug]/page.tsx` computes `canGoLive` from a paid `store_expires_at` OR
`sites.created_at + 7 days`. Every store in the database has a NULL expiry and a
long-expired trial, so real menu URLs render "Shop Currently Unavailable". A
`NULL` expiry does NOT mean unlimited. To view a real menu locally, set
`store_expires_at` into the future for that one site, then put it back.

## `await request.json()` returns null for a valid body

`JSON.parse('null')` succeeds, and reading a field off it throws a 500 on a
route anyone can reach. `api/onboarding/complete` documents this; the menu-theme
route repeated it and a test caught it. Reject the shape
(`null | non-object | array`) before touching a field.

## Tamil is not covered by the root layout's fonts

`app/layout.tsx` loads Outfit/Poppins/Manrope with `subsets: ['latin']` only, so
Tamil dish names fall back to an uncontrolled system face. `app/shop/layout.tsx`
loads the Tamil faces for the menu route only, and each pairing lists the Latin
face first with the Tamil face right after — the browser resolves family per
glyph, so no component has to branch on script.

## Gotchas from the dashboard UX pass

- **A template literal in a `<style>{`…`}</style>` block will swallow backticks.**
  Writing an explanatory CSS comment with `` `order` `` in it closed the string
  and produced ten misleading JSX parse errors in `qr/page.tsx`. Never use
  backticks inside those CSS blocks.
- **`order` on a grid child reorders which *track* it lands in, not just its
  visual position.** Setting `grid-template-columns: 340px 1fr` and giving the
  poster `order: 1` put the poster in the 340px track — the opposite of the
  intent. Put the wide track first and order into it.
- **`ordering-roadmap-copy.test.ts` only reads `src/content/**`.** It does not
  see `app/manage/`, `app/login`, `app/signup` or `components/`. Dashboard copy
  is guarded by `tests/acceptance/dashboard-ux.test.ts` instead — add new owner
  surfaces to its `OWNER_SURFACES` list.
- **Those two suites read source text, so an explanatory comment containing a
  banned string fails the test.** That is the guard working; reword the comment
  rather than loosening the pattern.
- **The subscription success detector cannot key off "a plan is active".** On a
  renewal it is already true, so the modal resolves before `verify-payment`
  writes. Compare `store_expires_at` against a baseline captured when the modal
  opens.
- **`verify-payment` already supports early renewal** —
  `Math.max(Date.now(), currentExpiryMs)` for a same-plan payment. Do not add
  client-side guards that block paying while active; remaining days carry over.
- **The QR posters are baked PNGs.** `/brand poster scan order.png` has its
  wording and its sports artwork in pixels. Menu-only plans use the canvas
  `drawMenuPoster()`; only the ordering plans still composite onto a PNG.

## Gotchas from the 2026-09 security remediation

- **Platform-shaped assumptions are the recurring bug class here.** Three
  separate findings came from code that was correct on Vercel and became a
  vulnerability on DigitalOcean: `x-vercel-cron` as proof of identity, a
  "platform caps the body at ~4.5MB" comment the upload routes relied on, and
  trusting the leftmost `X-Forwarded-For` entry. Nothing failed loudly at the
  move. When you read a comment naming a host, check it is still the host.
- **`getClientIp` is the only place a client IP may be derived.** It prefers
  `x-real-ip` (the ingress *sets* it) and otherwise takes the **rightmost**
  `X-Forwarded-For` entry, because a proxy appends and the leftmost value is
  attacker-written. `track-menu-scan` had its own copy reading `[0]`, which let
  anyone mint a fresh rate-limit bucket per request.
- **`authorizeCron` is the only cron gate.** All three `/api/cron/*` routes share
  it and fail closed. They previously had three hand-rolled copies that drifted:
  one correct, one fail-open, one accepting a header. Do not add a fourth.
- **A `rateLimit()` call does not fix a cost-abuse finding.** The limiter is
  per-process and is wiped by every restart, and `deploy_on_push: true` means
  every push to master is a restart. Where the thing being limited costs money,
  claim it atomically in Postgres *before* spending — see the compare-and-swap in
  `api/bulk-import/insert`.
- **Check-then-act on a quota is not a quota.** `bulk_import_usage` was read,
  checked, then blind-upserted as `read + n`, so concurrent requests all passed
  and one increment survived. The CAS pattern (`.eq('photos_used', observed)` on
  the update, retry on zero rows) needs no migration.
- **A skipped test that asserts a property is worse than no test.** The
  `it.skip` in `paymentAttacks.test.ts` claimed verify-payment "only activates
  from razorpay_status=created". It never did — the webhook did. The claim read
  as coverage in a grep for two months.
- **The security suites read source text**, like the roadmap ones. An
  explanatory comment quoting a banned string fails the test. Usually reword the
  comment; loosen the assertion only when it was genuinely over-broad (e.g.
  "never mentions `x-vercel-cron`" → "never *reads* `x-vercel-cron`"), and say so
  in the test.

### Operational items this pass could not close from the repo

- **No ingress body limit.** The extract routes now reject on `Content-Length`
  and re-check what landed, but a chunked request declares no length, and
  `request.formData()` buffers before any handler code runs. A real ceiling has
  to be set at the DigitalOcean ingress (or Cloudflare, if it fronts the app).
- **The crons are not scheduled.** `kind: PRE_DEPLOY` in `.do/app.yaml` runs once
  per deploy. Expiry reminders will not fire on the day they are due until an
  external trigger POSTs with the bearer header.
- **CSP `unsafe-eval` was removed — smoke-test signup and checkout.** Firebase
  phone OTP (reCAPTCHA) and Razorpay Checkout are the two bundles that could
  plausibly want it. A CSP violation in the console names the directive.
- **Confirm `CRON_SECRET` is set on the DO app.** Every cron route now fails
  closed, so an unset value stops the jobs (visibly) rather than opening them.

## sites.type is NOT the business type (2026-09-13)

`sites.type` holds `'Shop' | 'Menu'` on every live row. It is the product-kind
discriminator: `PosterGenerator.tsx` prints it onto the **QR poster** ("MENU"
vs "SHOP"), and `ShopCard` and `SiteInfo` branch on it. The TS type says
`type: 'Shop' | 'Menu'` and means it.

Business type (restaurant / cafe / takeaway / mess / tea_shop) is a separate
column, `sites.business_type`, added in 054 and CHECK-constrained to those five
ids.

The first draft of 054 reused `sites.type` because it looked free from the
column name and the app code read it loosely (`site.type as string | null`).
Only a `GROUP BY type` against production caught it — all 59 rows were `'Menu'`.
Writing `'cafe'` there would have mislabelled printed standees already sitting
on tables, which is unrecoverable without a reprint.

**Check what a column actually holds before reusing it.** A schema name plus a
loose TS cast is not evidence that a column is unused.

## Dropping a column: enumerate call sites, do not list files (2026-09-13)

PostgREST rejects the **entire** query with `42703` when a select names a
column that no longer exists — it does not omit the field. Most Supabase call
sites here destructure only `data` and ignore `error`, so the failure surfaces
as **empty data**, not as an error.

After 054 dropped `sites.image_url`, `SiteContext` still selected it. Its site
list came back `[]`, the onboarding gate read that as "no stores", and every
existing owner — including multi-store accounts — was redirected to
`/onboarding?intent=first-store`, then looped straight back after completing it.

The acceptance test had been written against a hand-listed set of five files.
Three offenders sat outside that list (`SiteContext`, `NotificationContext`,
`DashboardHeader`). Rewriting it to walk `src/**/*.ts(x)` and regex every
`from('sites').select(...)` found all three immediately.

**When dropping a column:** scan the whole tree for both the select AND the
reads (`site.<column>`). `NotificationContext` branched on `site.description`
to compute "settings incomplete" — with only the query fixed, every owner would
have been flagged incomplete forever.

## Menu theme vars must sit above the overlays (2026-09-13)

`themeCssVars()` is applied with `style={themeVars}`, and CSS custom properties
inherit through the **DOM**. In `QRMenuTemplate` the vars sat on
`.qr-wrap.qr-shell`, but all nine overlays — search, the product detail sheet,
and the seven frozen ordering screens — are **siblings** of that element, not
children.

So no overlay ever saw a variable. Every `TV.*` inside one silently resolved to
its `var(…, fallback)` Classic default. A store branded black rendered a black
main list and a **pink** search overlay from the same `MenuItemCard` — with no
error, no warning, and nothing wrong in either component.

This is worth remembering because it masks unrelated fixes: changing a chip from
`T.pink` to `TV.accent` inside an overlay appeared to do nothing at all, which
looks like the edit failed rather than like a scoping bug.

The vars now sit on the component's outermost element. **Any new overlay must
render inside it** — `menu-theme.test.ts` asserts SearchOverlay and
ProductDetailSheet appear after the themed root.

## A rate-limit GC must evict on the caller's own window (2026-09-17)

`rateLimit()` sweeps the bucket Map BEFORE it looks the key up, and `sweep()`
was evicting on a hardcoded 5-minute idle threshold while knowing nothing about
each bucket's `windowMs`. An evicted bucket is rebuilt empty on the very next
call, so **every limiter declaring a window longer than five minutes silently
enforced a ~5-minute one**.

That was all seven expensive call sites — both AI extract routes,
create-subscription, verify-payment, onboarding/complete, bulk-import/insert and
qr-card-request, each passing `windowMs: 60 * 60_000`. Pausing six minutes
bought a fresh allowance, indefinitely. `/api/onboarding/extract` has no DB-backed
quota behind it, so that limiter was the only thing standing in front of a paid
GPT-4o vision call.

Nothing failed loudly: the limiter returned `allowed: true` and every route
behaved exactly as designed. Only a clock-advancing test shows it.

The eviction rule is not a tunable constant — once a bucket's NEWEST hit has
aged out of that bucket's own window, every hit in it has aged out, so it is
empty by definition. Anything shorter changes decisions. `tests/unit/rateLimit.test.ts`
pins 59-minutes-still-denied / 61-minutes-allowed.

## PostgrestBuilder has no `.catch()`, and an unhandled rejection exits Node (2026-09-17)

`supabaseServer.from(...).insert(...).then(({ error }) => ...)` handles only a
PostgREST error, which arrives **in band on a resolved promise**. A transport
failure — DNS, TCP reset, TLS, Supabase restarting mid-request — **rejects**.

On a chain nobody awaits, that is an unhandled rejection, and Node has defaulted
to `--unhandled-rejections=throw` since v15 (this app runs Node 22: process exits,
code 1). `.do/app.yaml` pins `instance_count: 1`, so the blast radius is every QR
menu on the platform, not one dropped notification. `notify()` is the one that
matters — verify-payment calls it un-awaited straight after activating a plan.

**The fix is `then`'s second argument, not `.catch()`.** `PostgrestBuilder`
only `implements PromiseLike` — it declares `then(onfulfilled, onrejected)` and
nothing else, so the reflexive `.catch()` fix is itself a TypeError.

An **awaited** chain is fine: its rejection lands in the enclosing try/catch or
becomes a 500. Only un-awaited chains need the handler.
`tests/unit/fireAndForget.test.ts` scans the server paths and enforces this.

## There is one loading system — use it (2026-09-17)

`src/components/loading/` is the only place a loading indicator is defined.
Import from `@/components/loading`, never from the files inside it.

  <Spinner size tone />     inline / inside a button
  <ProgressTrack />         an operation long enough that a spinner reads as stuck
  <SectionLoader message /> a panel or table body with no data yet
  <PageLoader message />    a whole route with nothing to show
  <LoadingOverlay message/> stale content being replaced in place
  <Skeleton/SkeletonRows>   placeholder geometry matching the real layout
  <BrandLoader />           the full-screen splash (components/BrandLoader.tsx)

**Motion is declared once, in globals.css under "LOADING SYSTEM".** Do not add a
`<style>` tag with a keyframe to a page. That is exactly how the previous state
happened: 47 hand-rolled indicators, `@keyframes spin` declared 6 times, and
five separate opacity-pulse keyframes (`skeleton-pulse`, `dash-pulse`,
`pi-pulse`, `tx-pulse`, `tlp-pulse`) that were the same animation written five
times. They had drifted into four different purples — `#5137EF`, `#5452F6`
(the actual tailwind `primary`), `#5E17EB` and a stray `blue-600`. One token,
`--vs-loader-brand`, now decides.

**Why bars and not a ring.** Every one of the 47 was a rotating ring, which says
nothing about vsite and collapses into a grey smudge at 12px on the cheap
Android screens the dashboard runs on. `BrandLoader` already assembles the vsite
mark by raising its four bars in sequence; the spinner is that same gesture at a
smaller scale, on the same easing and the same 0.12s per-bar offset. Everything
in the system travels left to right for the same reason.

Two deliberate exceptions, so nobody "fixes" them:
  • `.vs-icon-spin` on the dashboard refresh button still ROTATES. The icon is
    the affordance — arrows that mean "again" — and bars there would remove the
    button's meaning. Use it only on an icon that already means repeat.
  • `BrandLoader` keeps its own inlined CSS. That is load-bearing: its
    `.bys-mark > rect` selector is rendered via dangerouslySetInnerHTML so React
    does not escape `>` to `&gt;` on the server and break hydration.

**Gotcha when applying `.vs-skeleton`:** the sweep is a `background-image`, so an
inline `background:` shorthand on the same element silently wipes it and you get
a flat grey block. Remove the inline colour when you add the class.

**Tone:** `current` inherits `color`. That is what lets one spinner work inside a
themed button and on the public menu, where the owner's own brand colour is in
force and a hardcoded indigo would be wrong.

## Gotchas — resilient extraction + PDF upload (2026-09-19)

- **Vitest hoists ESM imports above top-level statements.** Env vars a module
  reads at load time (e.g. `OPENAI_RATE_WINDOW_MS`, read when the shared rate
  scheduler is created) must be set inside `vi.hoisted(() => { ... })`, or the
  module sees the defaults. This silently made a load harness 20× too slow.
- **`menuExtractor.ts` used to be stored by git as BINARY** (`git ls-files --eol`
  showed `-text`): its `normalizeName` regex contained a literal NUL byte as the
  start of the range `\x00-/`. It is now the escape `\x00` (same semantics). If
  a diff of a source file shows the whole file changed, check for control bytes.
- **Next 14 cannot bundle the pdf.js worker** — Terser fails on it. The worker
  is copied to `apps/web/public/pdfjs/` by `scripts/copy-pdf-worker.mjs` in the
  `prebuild`/`predev` hooks (gitignored). Do not switch back to
  `new URL('pdfjs-dist/...', import.meta.url)`.
- **pdf.js v6: `destroy()` lives on the loading task**, not the document proxy.
- **OpenAI charges `max_tokens` against the per-minute limit at admission.**
  Size `max_tokens` to one page (2,500), never to a whole menu. The extract path
  assumes the account is **Tier 2+**: at Tier 1 a 10-photo scan does not fit one
  rate window and its late pages are reported as failed.
- **Load/abuse harnesses are opt-in** (`RUN_LOAD=1`): run alongside the full
  suite they starve unrelated tests of CPU (`aiCostAbuse` timed out at 5.2s).
  When measuring server RAM, build every client-side byte BEFORE the RSS
  baseline and stream request bodies lazily, or the simulated browsers' memory
  is counted as the server's.
- **The extraction spend guard is per-process** — a deploy resets it. The
  OpenAI project's monthly hard limit is the only absolute ceiling until the
  durable Postgres quota lands (needs a migration).
