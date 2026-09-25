# Current Goal

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

Token per Ralph loop: 3 iterations

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
