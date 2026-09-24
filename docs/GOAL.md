# Current Goal

Feature: **QR print kit** (`qr-print-kit`) — first pass of the QR page UX work.
For a menu-only store the QR page becomes: see the poster, pick where it goes,
download a real print-ready PDF, share the menu link. The poster and its main
action are above the fold on a laptop and never hidden behind the phone nav.

Approved by the owner in chat, 2026-09-24 ("first pass and fixes": ideas 6, 1,
3 + the PDF fix). Flag: `NEXT_PUBLIC_QR_PRINT_KIT`, default OFF. Ordering plans
keep the current page.

Previous goal (Smart Add Product) is built on `feat/smart-add-product`.

Token per Ralph loop: 3 iterations

## Acceptance criteria (each maps to a test in `apps/web/tests/acceptance/qr-print-kit.test.ts`)

- [ ] **AC1**: the flag is OFF unless `NEXT_PUBLIC_QR_PRINT_KIT` is exactly `"true"`.
- [ ] **AC2**: three placements in plain words — table stand (A6), counter (A5), wall or door (A4).
- [ ] **AC3**: "print shop" PDF is the exact paper size plus 3 mm bleed on every side, one poster.
- [ ] **AC4**: "home printer" PDF is A4: 4 table stands, 2 counter cards or 1 wall poster per sheet, inside a 6 mm printer margin, with cut lines.
- [ ] **AC5**: "Download PDF" produces a real PDF whose page size matches the layout, one poster image per card.
- [ ] **AC6**: each placement says how far away it scans from (10:1 rule with a 20 % margin).
- [ ] **AC7**: the menu link can be copied, sent on WhatsApp and opened; there is a Google Maps how-to and a WhatsApp Status image.
- [ ] **AC8**: flag ON + menu-only store renders the print kit; otherwise the current page renders.
- [ ] **AC9**: no button says PDF unless it makes one (fixes today's "Download PDF" that saves a PNG, flag or not).
- [ ] **AC10**: a failed download says so and never leaves every button stuck disabled (flag or not).
- [ ] **AC11**: on a phone the download action stays visible above the bottom navigation.
