# Current Goal

Feature: **Smart Add Product** (`smart-add-product`). The inventory drawer asks
for things in the order an owner thinks of them, and a dish photo from our
library appears by itself once the dish is named, so owners who never press
"Use Professional Image" still end up with a photo they have seen.

Approved by the owner in chat, 2026-09-24 (order + suggest-in-form, not silent
attach at save). Flag: `NEXT_PUBLIC_SMART_ADD_PRODUCT`, default OFF.

Previous goal (AI menu page limits) is built; see `docs/PLAN.md` history and git log.

Token per Ralph loop: 3 iterations

## Acceptance criteria (each maps to a test in `apps/web/tests/acceptance/smart-add-product.test.ts`)

- [ ] **AC1**: the flag is OFF unless `NEXT_PUBLIC_SMART_ADD_PRODUCT` is exactly `"true"`.
- [ ] **AC2**: flag ON, the drawer order is name → photo → veg/non-veg → category → pricing → description → show on menu.
- [ ] **AC3**: flag ON, product type (one price / sizes / combo) lives inside pricing, not as its own step.
- [ ] **AC4**: flag ON, a new product has no veg/non-veg preselected, and saving without one is refused with a clear message.
- [ ] **AC5**: a library photo is looked up from the dish name (≥ 3 letters, debounced) and shown in the photo slot before save.
- [ ] **AC6**: never replaces a photo the owner uploaded or a product's saved photo; stops suggesting once the owner removes a suggestion.
- [ ] **AC7**: a late answer for an old name never overwrites the photo for the current name.
- [ ] **AC8**: the photo is revealed only after it has decoded, holds the searching state long enough not to flash, animates within the NN/g range, and respects reduced motion.
- [ ] **AC9**: if save is pressed before the lookup for the current name has run, save runs it and keeps the photo it finds.
- [ ] **AC10**: a failed or empty lookup never blocks saving and never shows an error; the slot stays an upload box.
- [ ] **AC11**: with the flag OFF, the drawer is exactly as today (legacy order, Non-Vegetarian default, manual button).
