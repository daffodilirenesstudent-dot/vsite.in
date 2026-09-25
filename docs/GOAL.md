# Current Goal

Feature: **One free trial per account** (`one-trial`) — the owner's hybrid plan, decided
2026-09-25 after the trial-abuse research. Before launch; existing users are beta and need no
special handling (owner).

The rule:
- An account (one phone number — Firebase phone auth, no account deletion exists) can have at
  most **2 stores**.
- The **first** store gets the 7-day free trial. The trial is used **once per account, for good**:
  deleting a store and creating another does not bring it back.
- A store created after the trial is used has **no trial**. The owner can build it, but it stays
  offline until paid (₹299, today's per-store payment flow, unchanged). Before creating it the
  owner sees their phone number, is told the trial is used and the store goes live only after
  paying, and must tick an agreement — "with full intention only".
- The database enforces it (owners can insert/update `sites` from the browser, so the rule cannot
  live only in the API). The trial window moves from `sites.created_at + 7 days` — which owners can
  rewrite from the browser today — to `site_subscriptions.trial_ends_at`, which they cannot.

Migrations: `058` expand-only (trial date, trial claims, consent column, backfill, a trigger that
opens each new store's subscription row with its trial decided); `059` tightens the store-limit
trigger (2 stores, consent required). Apply 058 → deploy → 059. Not applied until the owner says go.

Previous goals: You tab redesign (`you-tab`), Mobile nav v2 (`mobile-nav`), Food posters.

Token per Ralph loop: 3 iterations

## Acceptance criteria (each maps to a test in `apps/web/tests/acceptance/one-trial.test.ts`)

- [ ] **AC1**: one pure rule decides store creation — 2-store limit, trial only if unused, consent
      required otherwise.
- [ ] **AC2**: migration 058 is expand-only and backfills so every existing store keeps its current
      trial state; new stores get their trial decided by the database, once per account.
- [ ] **AC3**: migration 059 enforces the 2-store limit and the consent in the database, race-safe.
- [ ] **AC4**: every trial gate (public menu, go-live toggle, plan context, plan status, AI
      allowance, eligibility) reads `trial_ends_at`; none derives the trial from `created_at`.
- [ ] **AC5**: the server asks before spending: extract and launch refuse a no-trial store without
      the owner's consent; launch reports whether the store is live; an eligibility route tells
      the app where the account stands.
- [ ] **AC6**: the consent screen shows the phone number, says the trial is used and the store
      goes live only after paying ₹299, and cannot continue until the owner agrees.
- [ ] **AC7**: onboarding and the You tab show that screen before a no-trial store is built; the
      launch screen says "pay to go live", never "is live", for such a store.
- [ ] **AC8**: a no-trial store is never told its trial ended — it is "not live yet, pay to go live".

## Previous: You tab redesign

Feature: **You tab redesign** (`you-tab`) — the phone "You" tab and every screen behind it,
rebuilt phone-first. Owner-approved 2026-09-25 on the design canvas
(https://claude.ai/artifact/JH435VTbKGwj3dDP9M1xSy): approach A (own pages under
`/manage/you/…`), store card with plan status on top, sign-out as a quiet link at the very
bottom, add-store pre-screen before the existing wizard, and the payment flow unchanged —
"only change the UI design".

Screens: You · Store details · Menu design · Banners (+ add/edit) · Plan & bills (+ pay sheet) ·
Add a store (+ at-limit) · Help & support (placeholder) · Sign-out sheet.

Constraints: behind `NEXT_PUBLIC_MOBILE_NAV_V2` (the You tab only exists with it). Phones get the
new pages; desktop keeps today's settings / banners / subscription pages. Same backend as today —
no schema change, no new route, no new dependency. The ₹299 checkout (create-subscription →
Razorpay → verify-payment → poll) moves verbatim into one hook shared by the old and new plan
screens; its rules stay (no payment while a trial or plan is running). Only ₹299 is ever shown.

Previous goals: Mobile nav v2 (`mobile-nav`, same branch — its AC6 is superseded by AC6 below),
Food posters, QR print kit.


## Acceptance criteria (each maps to a test in `apps/web/tests/acceptance/you-tab.test.ts`)

- [ ] **AC1**: plan status is one pure rule — trial / active / ending soon / trial ended / expired,
      days left, progress; payment offered only when no trial and no plan is running; ₹ from
      `PLAN_PRICES_INR`.
- [ ] **AC2**: store details — the first missing detail becomes the You-page nudge; name required,
      PIN validated; the save writes the same `sites` columns as settings; hours only overwritten
      when picked.
- [ ] **AC3**: banners — move up/down reorders and renumbers, no-op at the ends; the preview crop is
      the customer menu's 351:134; the summary line says how many are showing.
- [ ] **AC4**: add a store — limit-aware pre-screen into the existing wizard; at the trial limit it
      says when a spot opens; at 5 it offers WhatsApp.
- [ ] **AC5**: help — WhatsApp link pre-filled with the store; email; owner FAQs only; a "coming
      soon" request card.
- [ ] **AC6**: the You page — store card with plan status, rows with live subtitles linking to the
      six new screens, sign-out last, behind "Sign out of vsite?" / "Stay signed in".
- [ ] **AC7**: sub-pages are full-screen on phones (no header, notices or bottom bar) and still
      light the You tab.
- [ ] **AC8**: one copy of the checkout, used by the old and the new plan screen; the new screen
      never quotes another plan and uses the canonical "coming soon" copy.
- [ ] **AC9**: motion is subtle and switches off under reduced motion.
- [ ] **AC10**: one delete-store implementation, behind typing the store name.
- [ ] **AC11**: flag off, nothing changes: the shell and nav behave as today.
