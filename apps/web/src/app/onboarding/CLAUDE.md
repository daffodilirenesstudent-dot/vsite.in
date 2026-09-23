# Onboarding — feature instructions

The signup-to-first-menu flow. A new owner lands here after OTP and leaves
with a live menu. This is the highest-abandonment surface in the product:
treat every added step or blocking spinner as a regression.

## Test this feature

```
npx vitest run tests/acceptance/onboarding-gate.test.ts tests/acceptance/post-auth-destination.test.ts tests/acceptance/post-otp-handoff.test.ts tests/fuzz/onboardingCrash.test.ts
```

Run that before committing anything under `app/onboarding/` or
`app/api/onboarding/`. The full suite is only needed if you touched shared code.

## Layout

- `page.tsx` — the phase machine. Phases render in order, state lives here.
- `components/` — one file per phase (`BestsellersPhase`, `ProfitablePhase`,
  `SummaryPhase`) plus `ScanningOverlay`, `LaunchLoadingScreen`, `StepIndicator`.
- `@/components/OnboardingContext` — shared onboarding state provider.
- Server side: `app/api/onboarding/`.

## Conventions

- Phase components are presentational. They receive data and callbacks; they
  do not fetch. Fetching belongs in `page.tsx` or the API route.
- Never add a phase without adding it to `StepIndicator` — a step count that
  disagrees with the rendered phases is the bug this flow keeps having.
- Owners here have low digital literacy and are often on slow mobile networks.
  Every phase needs a loading state and a recoverable error state; a dead-end
  error screen means a lost signup.
- English only for all user-facing copy (owner decision 2026-09-23; `tests/acceptance/onboarding-english-only.test.ts` enforces it). Tamil stays on the customer QR menu, not here.

## Gotchas

- `onboardingCrash.test.ts` is a fuzz suite: it feeds malformed extraction
  results through the phases. If it fails after your change, the phase is
  trusting a shape the AI extractor does not guarantee. Fix the guard, not
  the test.
- Post-OTP routing is asserted by `post-otp-handoff` and
  `post-auth-destination`. Changing where onboarding sends the user on
  completion breaks both — that is intentional, update the implementation to
  match the intended destination rather than loosening the tests.
