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
