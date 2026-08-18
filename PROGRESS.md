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
