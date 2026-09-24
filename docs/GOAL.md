# Current Goal

Feature: **Food posters** (`food-posters`) — pass 2 of the QR page work. The QR
poster shows food, so a diner knows at a glance it opens the menu, not a UPI
payment. Two designs for restaurants (Feast ring, Table edge) and two for cafés
(Floating, Counter), approved by the owner on 2026-09-25 from the design canvas
https://claude.ai/artifact/DXtymTvPcXZHveidT7aspQ ("I love it").

Headline: "Scan and see menu". English only — no Tamil on posters (owner, 2026-09-25).
Flag: `NEXT_PUBLIC_FOOD_POSTERS`, default OFF; lives inside the print kit
(`NEXT_PUBLIC_QR_PRINT_KIT`). No schema change: the design choice is remembered per
device; the family is preselected from the existing `sites.business_type`.

Previous goals: QR print kit (`feat/qr-print-kit`), Smart Add Product (`feat/smart-add-product`).

Token per Ralph loop: 3 iterations

## Acceptance criteria (each maps to a test in `apps/web/tests/acceptance/food-posters.test.ts`)

- [ ] **AC1**: the flag is OFF unless `NEXT_PUBLIC_FOOD_POSTERS` is exactly `"true"`.
- [ ] **AC2**: four designs — restaurant: Feast ring, Table edge; café: Floating, Counter — plus the store's current poster.
- [ ] **AC3**: business type picks the family: restaurant and mess → restaurant; café, takeaway, tea/juice → café; unset → restaurant.
- [ ] **AC4**: every design says "Scan and see menu", shows the store's name and "Menu by vsite", and contains no Tamil.
- [ ] **AC5**: food never touches the QR card, and the card keeps a clear border (≥ 8 % padding) on every design.
- [ ] **AC6**: every food image a design names exists in `public/poster-art/`.
- [ ] **AC7**: a design fills any print card (cover-fit), so bleed and home sheets both work; a long store name shrinks to fit.
- [ ] **AC8**: the chosen design drives the preview, the PDF and the Status image; the choice is remembered per store on the device.
- [ ] **AC9**: with the flag off, the print kit shows today's poster only.
