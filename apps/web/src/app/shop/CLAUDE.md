# Shop (`/shop/[slug]`) — feature instructions

**This is the product.** A customer scans a QR code and lands here to read the
menu. It is the only surface an end customer ever sees, it is the thing the
owner pays ₹299/month for, and it renders on cheap Android phones over slow
networks. Performance and legibility beat everything else here.

## Test this feature

```
npx vitest run tests/unit/menuCard.test.ts tests/acceptance/menu-card-system.test.ts tests/acceptance/category-quick-return.test.ts
```

E2E (needs `npm run dev` running):

```
npx playwright test tests/e2e/menu-card.spec.ts
```

## Layout

- `[slug]/page.tsx` — server component: resolves the shop, metadata, SEO.
- `[slug]/ShopPageClient.tsx` — client shell: picks a template from
  `TEMPLATE_MAP` and feeds it products and banners.
- `preview/page.tsx` — the owner's preview of their own menu.
- `[slug]/order/[orderId]/` — **frozen** order surface.
- Rendering lives in `@/components/templates/`, not here. `QRMenuTemplate.tsx`
  is the real menu UI; `MenuItemCard.tsx` is the card; `menuTokens.ts` holds
  the design tokens.

## Conventions

- Add a template by registering it in `components/templates/index.ts`
  (`TEMPLATE_MAP`). Never branch on template name inside a component.
- Visual values come from `menuTokens.ts`. No ad-hoc hex or spacing in the
  card components — the token file is what keeps templates coherent.
- Tamil + English. Long Tamil dish names wrap to two lines; check that any
  layout change survives them.
- This page is unauthenticated and public. It reads through
  `@/lib/platform/db/supabase` with the anon client — never reach for
  `supabase-server` here.

## Gotchas

- `CartSheet`, `CheckoutScreen`, `CounterWaitingScreen` and
  `OrderConfirmedScreen` live in `components/templates/` but are **frozen**
  ordering UI. They are kept so unfreezing is a flag flip, not an archaeology
  project. Do not wire them into a new path.
- The category bar's sticky/quick-return behaviour is asserted by
  `category-quick-return.test.ts` and has regressed twice. Re-run it after any
  scroll, header, or layout change.
- Scan tracking goes through `app/api/track-menu-scan/`. A change that drops
  the tracking call silently breaks the owner's analytics dashboard, and no
  test on this feature will catch it.
