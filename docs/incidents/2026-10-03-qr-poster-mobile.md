# Incident 2026-10-03 — QR poster "could not load" on phones (second time)

| | |
|---|---|
| Severity | High — owners could not preview or download their QR poster on a phone |
| First time | 2026-09-27 — Android has no Arial; `document.fonts.load` rejected (fixed `a7ba74c`) |
| This time | 2026-10-03, owner report, after the 27 Sep fix was live |
| Fix | branch `fix/qr-poster-mobile` |
| Proof | before/after matrix below; `npm run posters:check` (re-runnable) |

## How it was analysed

The real poster code (`src/lib/qr`) was bundled with Vite and run in **Chromium as
a Pixel 7** and **WebKit as an iPhone 13** (Playwright), with the real next/font
CSS and the real art, one injected fault per scenario. The harness was first
validated by reproducing the 27 Sep incident on the pre-fix code: Poppins
designs failed with `NetworkError`, café designs passed — exactly as reported.

**Ruled out with evidence:** the art itself (27 files, all 200 OK on production,
0.9 MB total, largest 532×426 px); the Content-Security-Policy (`img-src` allows
`blob:`/`data:`, `font-src` allows self); the release's other header change
(`images.unoptimized` — posters use plain images).

## Root cause

The poster had **zero fault tolerance and no error reporting**. One poster
needed up to 17 dish photos + web fonts + QR + modern canvas features; any one
failing threw away the whole poster, with no retry, and every failure was
swallowed by a bare `catch {}` — nothing in Sentry, nothing in a log. Proven
triggers on the code that was live:

| Phone condition | Live code | Error |
|---|---|---|
| One dish photo fails to download (mobile data) | **3 of 4 designs** | `error` event from the photo |
| No dish photo can download | **0 of 4** | `error` event |
| Older browser — no canvas `roundRect` (Safari ≤ 15, Chrome ≤ 98, some built-in Android browsers) | **0 of 4** | `TypeError: ctx.roundRect is not a function` |
| Web fonts stall on a slow connection | **0 of 4 — spinner forever** | never settles |

Which of these hit the owner's phone cannot be recovered — the error was
discarded. That is why the fix makes the poster immune to all of them **and**
reports every failure with its stage.

## Fix

1. **One pre-rendered food plate per design** (owner's idea). The dish photos
   and their shadows are drawn once, at build time, into a transparent WebP per
   design (`npm run posters:plates`, same `drawImageElement` the renderer used).
   At runtime: background + accent + store name + QR + one plate. 17 downloads
   → 1; no shadow blurs on the phone. 2× plate (152–485 KB) for preview,
   thumbnails and Status image; 4× (369 KB–1.2 MB) only for A4 print. File names
   carry a content hash, so a regenerated plate always gets a new URL.
2. **Retries**: the plate (3 tries) and the QR (2 tries).
3. **Fonts are cosmetic**: waited for at most 5 s, then the poster draws with
   whatever font is available. They can no longer fail or hang it.
4. **No `ctx.roundRect`**: `roundRectPath` (arcTo) works in every browser.
5. **No silent failures**: every failure reports to Sentry (`area=qr-poster`,
   `stage=preview|thumbnail|pdf|status|qr-download|fonts`), once per stage per
   page load. Sentry's replay-on-error captures the session.
6. **Honest UI**: "The poster could not load. Check your internet connection." +
   **Try again** (it used to claim "Downloads still work" — they used the same
   pipeline and did not).
7. **PDF from bytes**: async `toBlob` instead of a multi-MB `toDataURL` string.

## Proof

Real engines, fresh browser per poster, 20 s limit (hang = failure):

| Scenario | Live code | Fixed |
|---|---|---|
| Android Chrome, healthy | 4/4, ≤ 1.3 s, ≤ 17 art requests | 4/4, ≤ 0.4 s, **1** request |
| Android without Arial (27 Sep) | 4/4 | 4/4 |
| iPhone (WebKit) | 4/4 | 4/4 |
| One dish photo fails | **3/4** | **4/4** |
| No dish photo can download | **0/4** | **4/4** |
| Food plate fails once | n/a | 4/4 (retry) |
| Older browser, no roundRect | **0/4** | **4/4** |
| Web fonts never arrive | **0/4 (hang)** | **4/4** (≈ 6 s) |
| Slow network, 400 ms / 1 Mbps | 4/4, ≤ 5.3 s | 4/4, ≤ 5.0 s |

**Same poster:** live vs fixed at 720 px — visually identical; 0.6–3.7 % of
pixels differ by more than 16/255 (mean 0.9–3.8/255), all at photo edges, where
the plate (drawn at 2× and scaled down) is slightly smoother.

Tests: `tests/acceptance/poster-resilience.test.ts` (18) + the existing
food-poster and print-kit suites (49) pass. `npm run posters:check` → all 28
posters (7 conditions × 4 designs) render.

## Residual risks

- **iOS 13 and older** cannot decode WebP (plates and dish art). iOS 14+ (2020,
  iPhone 6s and newer) is fine.
- Reports need `NEXT_PUBLIC_SENTRY_DSN` in DigitalOcean (client-side Sentry).
- On a very slow connection the first preview still takes as long as one
  150–485 KB download — it can be slow, but it no longer fails.

## Maintaining it

- Changed a design (`posterDesignData.ts`) or any file in `public/poster-art/`?
  Run `npm run posters:plates` — CI fails until you do.
- Changed `drawImageElement`? Bump `PLATE_RENDER_VERSION`, then regenerate.
- Before releasing poster changes: `npm run build && npm run posters:check`.
