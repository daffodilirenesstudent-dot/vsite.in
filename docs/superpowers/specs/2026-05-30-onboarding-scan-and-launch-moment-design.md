# Onboarding UX: Productive Scan Wait + Celebratory "It's Live!" Moment

**Date:** 2026-05-30
**Status:** Approved (pending spec review)
**Area:** `src/app/onboarding/`

## Goal

Make two high-leverage moments in onboarding feel world-class:

1. **The ~70s menu-scan wait** — turn a blank spinner into a confidence-building
   moment that shows progress and community trust, ending in a satisfying "found
   N items" reveal.
2. **The launch moment** — turn the auto-redirect into a celebratory,
   action-oriented "Your menu is live!" screen where the owner can immediately
   view and share their live menu.

No backend changes. Both parts are presentation-layer only.

## Key Constraint

`POST /api/onboarding/extract` ([route.ts:107](../../../src/app/api/onboarding/extract/route.ts))
makes a **single batched GPT-4o call** — all photos in, all items back at once,
at the end. The server never holds a partial "12 items so far" count mid-scan.

**Decision:** Do NOT fabricate a live running count during the wait. Instead show
a perceived-discovery animation during the wait, then a fast, honest **count-up
to the true item count** the instant the real response arrives. (The real
per-photo SSE-streaming alternative was rejected: multiple model calls = higher
cost + slower + more complexity, for marginal gain.)

---

## Part A — Productive Scan Wait

### Component: `ScanningOverlay`

New full-screen overlay (`src/app/onboarding/components/ScanningOverlay.tsx`),
mirroring the existing `LaunchLoadingScreen` pattern for visual consistency.
Shown while `extracting === true` on the Setup step, replacing the inline button
spinner as the primary loading affordance.

**Props**
```ts
interface ScanningOverlayProps {
  show: boolean;          // true while extracting
  itemCount: number | null; // null until the real response arrives
  onCountUpDone: () => void; // called after the count-up finishes → parent slides to Bestsellers
}
```

**States**
1. **Scanning** (`show && itemCount === null`):
   - Scanning animation (sweeping line / animated scan visual).
   - Rotating staged messages: "Reading your menu…", "Finding dishes…",
     "Detecting prices…", "Organizing your menu…".
   - Indeterminate progress feel (no fake percentage).
   - **Community trust band** (animated count-up stat chips):
     `🍽️ 50+ restaurants · ☕ 20+ cafés · 🏪 70+ shops` with subline
     "— and many more growing with vsite". Numbers count up on mount.
2. **Found** (`show && itemCount !== null`):
   - Fast count-up `0 → itemCount` (~0.8s), headline "Found {N} items! ✨".
   - On completion, calls `onCountUpDone()`.

**Reduced motion:** skip the sweep + count-up animations; show static
"Reading your menu…" then the final "Found N items".

### Wiring (`onboarding/page.tsx`)

- `handleExtract` currently: `setExtracting(true)` → fetch → on success
  `setExtractedItems(data.items)` → `transition('right', () => setStep('bestsellers'))`.
- New flow:
  - Keep `setExtracting(true)` to show the overlay.
  - On success: store items in context, set a new `scanItemCount` state to
    `data.items.length` (drives the count-up). Do NOT immediately transition.
  - `ScanningOverlay`'s `onCountUpDone` runs the slide to `bestsellers` and
    resets `extracting`/`scanItemCount`.
  - On error/timeout: `setExtracting(false)`, leave `scanItemCount = null`; the
    existing in-card error message shows (unchanged).
- Remove the inline button spinner's role as primary loader (the button can keep
  a simple disabled state; the overlay is the loader).

### Social-proof numbers (owner-provided, approved)

`50+` restaurants, `20+` cafés, `70+` shops. Defined as a single constant so
they're easy to update later.

---

## Part B — Celebratory "It's Live!" Moment

### Changes to `LaunchLoadingScreen.tsx`

**Remove** the 1.8s auto-redirect (`useEffect` on `success` calling
`onRedirect`). The success state becomes a terminal, action-oriented screen.

**New success UI:**
- Small confetti / flower burst (reuse the celebration motion style from
  `StoreSetupGuide`).
- Headline: **"🎉 Your menu is live!"** + `{itemCount} items published`.
- Live URL chip: `vsite.in/shop/{slug}` (display only).
- Three actions:
  1. **View live menu** (primary) → opens `${window.location.origin}/shop/{slug}`
     in a **new tab** (`window.open(url, '_blank', 'noopener')`).
  2. **Share your menu** (secondary) → `navigator.share({ url })`; on
     unsupported/desktop → `navigator.clipboard.writeText(url)` + a "Link copied!"
     toast (react-hot-toast is already used in the app).
  3. **Go to dashboard →** (tertiary) → calls `onRedirect()`
     (`/manage/dashboard?onboarded=true&items={N}`).

**New prop:** `slug: string` (the live store slug).

### Wiring (`onboarding/page.tsx`)

- `handleLaunch` already receives `data.siteSlug` from
  `/api/onboarding/complete`. Capture it into a new `launchSlug` state alongside
  `launchItemCount`.
- Pass `slug={launchSlug}` to `<LaunchLoadingScreen />`.
- `handleLaunchRedirect` stays as the dashboard navigation (now triggered by the
  explicit "Go to dashboard" button, not a timer).

---

## Components & Boundaries

| Unit | Purpose | Depends on |
|------|---------|------------|
| `ScanningOverlay` | Scan-wait visual + count-up reveal | props only (show, itemCount, onCountUpDone) |
| `LaunchLoadingScreen` (edit) | Launch progress + celebratory action screen | props (show, done, itemCount, slug, onRedirect) |
| `onboarding/page.tsx` (edit) | Orchestrates extract/launch state + slide transitions | the two components above |

Each overlay is self-contained, prop-driven, and independently testable by
toggling props.

## Error Handling

- **Extract error/timeout:** overlay hides, in-card error shows (existing
  behavior preserved). Count-up never fires (guarded by `itemCount !== null`).
- **Share unsupported:** fall back to clipboard copy + toast; if clipboard also
  fails, no-op (never throw).
- **Missing slug** (defensive): "View live menu"/"Share" hidden if `slug` is
  empty; "Go to dashboard" always available so the user is never stuck.

## Verification

UI-only; verify via rendered preview screenshots (the established pattern in this
project):
1. ScanningOverlay scanning state (trust band visible).
2. ScanningOverlay "Found N items" count-up frame.
3. LaunchLoadingScreen celebratory state (3 buttons + live URL + confetti).
- Plus `tsc --noEmit` clean for changed files.

## Out of Scope

- Real per-photo streaming extraction (SSE).
- Changes to the menu-engineering wizard steps.
- Any backend / API changes.
