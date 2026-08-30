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

