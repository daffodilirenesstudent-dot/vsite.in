# PLAN — Homepage redesign ("Grounded Bento")

Design canvas: https://claude.ai/code/artifact/d2354fa4-92ff-4b8b-af28-810ecf342da8
Working artboards: `design/homepage/{Main,Mobile,System}.dc.html`

## Test placement decision (required by CLAUDE.md)

Vitest `include` is `tests/**/*.test.ts` and `exclude` covers `**/*.spec.ts`, so
the acceptance suite is split deliberately:

- `tests/acceptance/homepage-redesign.test.ts` — **vitest**, static source
  assertions (frozen-product claims, fabricated proof, contrast tokens,
  reduced-motion). Runs under `npx vitest run`. Matches the convention already
  set by `tests/acceptance/freeze-ordering.test.ts`.
- `tests/e2e/homepage-redesign.spec.ts` — **playwright**, rendered assertions
  (no horizontal overflow at 360/390/1440, page height budget, contrast of
  rendered text, reduced-motion honoured). `testDir` is already `./tests/e2e`,
  so no config change is needed.

## Dependencies

No new dependencies. Confirmed already in `package.json` and unused/near-unused:

- `motion@^12.34.0` — **installed, zero imports.** Deliberately left unused:
  entrance animation is CSS-only (see Task 2).
- `lucide-react@^0.563.0` — installed, used only by `ShopTemplate.tsx`.
  Replaces Material Symbols on the homepage.

## Tasks

### 1. Tokens — `tailwind.config.ts`
Add the warm neutral ramp + semantic surfaces from `design/homepage/System.dc.html`:
`ink #12100E`, `ink-70 #4A443E`, `ink-45 #6B635A`, `paper #FDFCFA`,
`paper-2 #F5F2ED`, `line #E6E1D8`, `night #0E0E2C`, `accent-text #4340D4`.
Keep `primary #5452F6` (brand) but demote it to actions only.
Add the type scale (`display`, `h2`, `h3`, `body`, `caption`) and the section
padding scale. Do **not** remove existing colours — dashboard code uses them.

### 2. Motion foundation — `src/app/globals.css`, `src/hooks/useInView.ts`
- CSS-only entrance animations (`transform`/`opacity` only, GPU compositor).
  Rationale: the audience is on low-end Android; Framer/Motion orchestrates on
  the main thread and costs ~34KB (~4.6KB with `LazyMotion`) for effects CSS
  does for free.
- `@media (prefers-reduced-motion: reduce)` kills every transition/animation
  and pins reveals to their final state — no-motion-first.
- `useInView`: return `visible: true` immediately when reduced motion is set
  (currently a reduced-motion user sees permanently invisible content if JS is
  slow), add `once`, `rootMargin`, and a `delay` passthrough.
- New `src/components/home/Reveal.tsx` — one primitive for every entrance.
- Progressive enhancement: `@supports (animation-timeline: view())` for the
  scroll-linked bits only. Baseline stays IntersectionObserver.

### 3. Icons — replace Material Symbols on the homepage
Swap ~60 ligatures for `lucide-react` imports. Remove the lazy
`material-symbols` `<Script>` from `layout.tsx` **only if** no other route
still uses the class (check `manage/` first — it does, so keep the loader and
just stop using it on the homepage).

### 4. Images — `public/menu-photos/` (done)
16 real AI-generated dish photos curated from the user's `food image 5/` and
`Food images 6/` folders, 1024×559, ~150KB each. These are the product's own
output and prove the "a photo for every dish" claim by showing it.
`next/image` resizes on serve — no build step.

### 5. Sections — `src/app/page.tsx` order
Hero (night) → TrustBar → CostOfPaper (paper-2) → SetupSteps (paper) →
MenuBento (paper-2) → DinerFlow (paper) → Pricing (night) → EarlyAccess (paper)
→ FAQ (paper-2) → FinalCTA + Footer (night).

**Delete:** `ProductCards.tsx`, `PainSection.tsx` (duplicated structure, same
three images in the same order, ~4,000px between them), `SocialProof.tsx`
(fabricated quotes). **Already unused, delete too:** `AIFeatures.tsx`,
`HowItWorks.tsx`, `Featurette.tsx`, `FinalCTA.tsx`, `SolutionsGrid.tsx`.

### 6. Structured data — `src/app/page.tsx`
Remove `aggregateRating` (4.8 / 124 with no real reviews). Trim `featureList`
to Smart QR Menu capabilities only.

## Out of scope
- `/features`, `/pricing`, `/demo` and the SEO landing pages (they share
  `SeoLanding.tsx` — a separate pass).
- Dashboard (`src/app/manage/**`) styling.
- Any change to billing, auth, or `productFlags.ts`.
