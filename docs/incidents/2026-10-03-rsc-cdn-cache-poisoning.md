# Incident 2026-10-03 — owners saw raw `2:I[…"ClientPageRoot"]` text instead of the dashboard

| | |
|---|---|
| Severity | High — owners locked out of the dashboard; every public page exposed |
| Detected | Owner report with screenshot, 2026-10-03 ~12:40 UTC |
| Same class as | 2026-08-18 (`/manage/dashboard`, AGENTS.md "CDN cache poisoning of RSC payloads") |
| Fix | `fa3cc35` (/auth/refresh) + systemic middleware fix (this commit) |
| Proof | before/after numbers below; hourly guard `.github/workflows/edge-cache-guard.yml` |

## What owners saw

An owner whose session had expired (Firebase ID tokens last 1 hour) was sent to
`https://vsite.in/auth/refresh?to=%2Fmanage%2Fdashboard` and got a page of plain
text — the React Server Components "flight" payload — instead of the dashboard.
Live response at 12:42 UTC:

```
Content-Type: text/x-component
Cache-Control: s-maxage=31536000, stale-while-revalidate
cf-cache-status: HIT        Age: 11554        x-nextjs-cache: HIT
body: 2:I[19107,[],"ClientPageRoot"] …
```

`Age: 11554` → the CDN stored it at ~09:30 UTC and replayed it to every owner for
~3 hours, and would have kept doing so for a year.

## Root cause — a chain of five facts, each proven

1. **One URL, two bodies.** Next.js serves HTML for a document load and the
   `text/x-component` flight payload when the request carries `RSC: 1`
   (a client-side navigation). It signals this with `Vary: RSC, …`.
2. **Static pages are stored for a year.** Next.js stamps prerendered pages
   `s-maxage=31536000`. `/auth/refresh` was a static `'use client'` page and was
   outside the middleware matcher, so nothing overrode that.
3. **The CDN ignores `Vary`.** DigitalOcean App Platform fronts the app with
   Cloudflare (`Server: cloudflare`, `x-do-app-origin`). Cloudflare: *"By default,
   Cloudflare does not consider vary values in caching decisions"* — the cache
   key is the URL alone, so the first body stored wins for everyone.
4. **The redirect strips the cache-buster.** The Next.js client adds a unique
   `?_rsc=` to every RSC request (`next/dist/client/components/router-reducer/fetch-server-response.js:70`,
   Next 14.2.35) precisely so they never share a cache key with the page. But
   middleware redirects build a brand-new URL —
   `new URL('/auth/refresh', request.url)` then `searchParams.set('to', …)`
   (`src/middleware.ts`, the three expired-token branches) — which drops `_rsc`.
   `fetch` follows the 307 with the `RSC` headers still attached
   (`res.redirected`, same file :77), so the CDN saw an RSC request for the plain
   URL `/auth/refresh?to=%2Fmanage%2Fdashboard` and stored the flight payload
   under the key every browser uses. No code links to that URL; only the
   middleware redirect produces it.
5. **Trigger.** An owner with a dashboard tab open past token expiry clicks a link
   to `/` or `/manage/dashboard` → client navigation (RSC) → middleware sees an
   expired token → 307 to `/auth/refresh?to=%2Fmanage%2Fdashboard` → poisoned.
   It needs to happen once after each deploy.

**Reproduced on production (13:01 UTC)** with a throwaway URL: one request with
`RSC: 1` to `/auth/refresh?to=%2F<probe-id>`, then a browser-style load of the same
URL → `text/x-component`, `cf-cache-status: HIT`.

## Why the August fix did not prevent it

The 2026-08-18 fix stamped `private, no-store` on every response *the middleware
handles*, but the matcher only covered `/`, `/login`, `/signup`, `/onboarding`,
`/manage/*`. Its note called the remaining public pages "cosmetic". They are not:

## Blast radius found during this analysis

Probe at 13:10 UTC, every prerendered page from `.next/prerender-manifest.json`,
each on a unique throwaway URL: **82 of 87 pages poisonable by a single request
from anyone** — pricing, features, all 20 city pages, every blog post and guide,
privacy, terms, `/auth/refresh`. Only `/shop/[slug]` (dynamic, already no-store),
`/login` and the middleware routes were safe. This is a cache-poisoning
denial-of-service: one `curl -H 'RSC: 1'` would have shown raw text to every
visitor and to Googlebot for a year — lost signups and damaged SEO.

## Fix — defence in depth

| Layer | What | Where |
|---|---|---|
| 1. The page | `/auth/refresh` forced dynamic via a server layout (segment config is ignored in `'use client'` files) → `private, no-cache, no-store` | `src/app/auth/refresh/layout.tsx` (`fa3cc35`) |
| 2. The class | Middleware now also runs for **every page request carrying the `RSC` header** (`has: [{ type: 'header', key: 'rsc' }]`) and stamps `private, no-store`. Document loads do not invoke middleware, so the `/shop` QR-menu hot path and CDN-cached marketing HTML are unchanged. Public pages skip token verification. | `src/middleware.ts` |
| 3. Tests | Matcher compiled with Next's own `getMiddlewareMatchers` + `matchHas`: every public page's RSC request runs middleware; document loads, assets and API never do; auth matcher unchanged; responses are `private, no-store`. | `tests/unit/rscNoSharedCache.test.ts`, `tests/unit/authRefreshNoSharedCache.test.ts` |
| 4. Detection | Hourly GitHub Action: no real page served as flight payload; no page poisonable on a throwaway probe. Fails → GitHub email. Run `--full` after every deploy. | `.github/workflows/edge-cache-guard.yml`, `.github/scripts/edge-cache-guard.mjs` |
| 5. Break-glass | Redeploy; if poisoning persists, set `disable_edge_cache: true` in the App Platform spec (allowed — the app has no static-site component). | below |

Why `no-store`: Cloudflare documents `no-store` as *"Will not cache"* regardless of
Origin Cache Control settings, and production already proved it — `/login`, which
middleware stamps `private, no-store`, returned `cf-cache-status: BYPASS` to the
same RSC probe that poisoned `/pricing`.

## Proof

| Measurement | Before | After |
|---|---|---|
| Production probe, 87 pages, throwaway URLs (13:10 UTC) | **82 poisonable** | _filled after deploy_ |
| Guard, 32 page types (13:2x UTC) | 30 poisonable, 1 real URL served poisoned | _filled after deploy_ |
| Local `next build` + `next start`, every prerendered page + key routes, RSC request | (not measured) | **88/88 `private, no-store`, 0 storable** |
| Same, document loads | — | 81 keep `s-maxage` (CDN speed unchanged), 7 no-store (auth, /shop, /auth/refresh) |
| `next build` route type of `/auth/refresh` | ○ static | ƒ dynamic |

## Why it should not recur — and what would break it

- **New pages are covered automatically**: the RSC matcher is a catch-all
  (`/((?!api/|_next/|.*\..*).*)`), not a list.
- **Someone narrows the matcher or edits middleware** → `rscNoSharedCache.test.ts`
  fails in CI.
- **A Next.js upgrade renames the `RSC` header or changes caching** → the hourly
  guard fails within an hour of the deploy (it tests the real CDN, not the code).
- **A CDN/platform change** (DigitalOcean edge, Cloudflare) → same guard.
- **Residual**: the hourly guard's "served" check sees the CDN location GitHub's
  runner hits (US); the poisonability probe is location-independent because it
  tests what the origin lets any location store. Run `--full` from India after
  each deploy.

## Runbook — if it ever happens again

1. Confirm: `node .github/scripts/edge-cache-guard.mjs https://vsite.in --full`.
2. Owners stuck now: tell them to open `vsite.in/login` and log in again.
3. Clear the CDN: DigitalOcean → vsite app → Actions → **Force rebuild and deploy**.
4. If poisoned URLs survive the deploy: App spec → `disable_edge_cache: true` →
   save (turns the edge cache off entirely; the origin can serve the traffic).
5. Find which response lost `private, no-store` (the guard prints the URL), fix,
   add the case to `rscNoSharedCache.test.ts`.

## References

- Cloudflare, Origin Cache Control: Vary is ignored except `Accept-Encoding`;
  `no-store` → "Will not cache" — https://developers.cloudflare.com/cache/concepts/cache-control/
- DigitalOcean, App Platform edge settings: `disable_edge_cache`; redeploy
  invalidates cache (documented for static sites) — https://docs.digitalocean.com/products/app-platform/how-to/configure-edge-settings/
- Next.js 14.2.35 source: `_rsc` cache-busting param and redirect following,
  `next/dist/client/components/router-reducer/fetch-server-response.js`
