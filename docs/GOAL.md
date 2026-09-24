# Current Goal

Feature: **Mobile nav v2** (`mobile-nav`) — ideas 1, 3 and 5 from the dashboard UX research
(2026-09-25), approved by the owner ("start building the 1, 3, 5"). Modelled on WhatsApp's
Material 3 bottom bar and YouTube's "You" tab.

1. Bottom bar: **Home · Menu · QR · You**, pill behind the active icon, 12 px labels,
   `aria-current`, re-tap scrolls to the top, a count badge on Menu. Banners, settings,
   plan, help, extra stores and sign-out move to a new **You** page.
3. Instant feedback: a tapped tab lights up at once, a progress track and a page skeleton
   show until the new page arrives.
5. Simpler phone header: store name without a switcher for one-store owners, the avatar
   moves to You, "Preview Store" becomes a labelled "View menu".

Flag: `NEXT_PUBLIC_MOBILE_NAV_V2`, default OFF. Menu-only stores only (ordering plans keep
today's bar). Phones only (< 768 px); desktop unchanged. No schema change.

Previous goals: Food posters (`feat/food-posters`), QR print kit, Smart Add Product.

Token per Ralph loop: 3 iterations

## Acceptance criteria (each maps to a test in `apps/web/tests/acceptance/mobile-nav.test.ts`)

- [ ] **AC1**: the flag is OFF unless `NEXT_PUBLIC_MOBILE_NAV_V2` is exactly `"true"`.
- [ ] **AC2**: four tabs in order — Home, Menu, QR, You — and every dashboard page maps to one.
- [ ] **AC3**: the Menu badge shows the count of dishes without photos (9+ above nine); You shows a dot for settings to finish.
- [ ] **AC4**: the bar marks the current tab for screen readers, uses ≥ 12 px labels, and re-tapping scrolls to the top.
- [ ] **AC5**: a tap shows the destination as active at once and a skeleton + progress track until the page changes.
- [ ] **AC6**: the You page has store details, banners, plan, help, add a store (limit-aware) and sign out with confirmation.
- [ ] **AC7**: the phone header hides the avatar, shows the switcher only for 2+ stores; the dashboard says "View menu".
- [ ] **AC8**: store-creation limits come from one function used by the header and the You page.
- [ ] **AC9**: with the flag off, the bar, header and dashboard are exactly as today.
