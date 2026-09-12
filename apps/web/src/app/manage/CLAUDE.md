# Dashboard (`/manage`) — feature instructions

The owner-facing admin. Everything behind login lives here.

## Test this feature

```
npx vitest run tests/api/routes.test.ts tests/unit/menuEngineering.test.ts tests/acceptance/freeze-routes.test.ts
```

Add `tests/acceptance/ordering-frozen.test.ts` if you touched anything under
`orders/` or `transactions/` — those pages sit on frozen routes.

⚠️ `tests/api/manageOrders.test.ts` exists but is in the `exclude` list in
`vitest.config.ts` (frozen-product suite, kept intact for unfreezing). It will
never run — do not add it to a command and assume it covers you.

## Pages

| Route | What |
|---|---|
| `dashboard/` | Analytics: revenue, scans, top/low performers |
| `product-inventory/` | The menu itself — the core asset |
| `settings/` | Store profile, GST wizard (`_components/GstWizard.tsx`) |
| `subscription/` | The owner's own ₹299 plan — see `src/lib/payments/CLAUDE.md` |
| `qr/` | QR generation + poster download |
| `banner-management/` | Storefront banners |
| `orders/`, `transactions/` | **Frozen.** Read-only shells over 403 routes |

`layout.tsx` + `@/components/ManageLayoutClient` own the sidebar and auth gate.

## Conventions

- Pages are client components with server API routes under `app/api/manage/`.
  Never import `@/lib/supabase-server` into a page here — `server-only` will
  fail the build, by design.
- Analytics math lives in `@/lib/menu/menuEngineering`, not in the page.
  `menuEngineering.test.ts` is the contract; extend it when you add a metric.
- Money is INR, formatted through `@/lib/platform/currency`. Never hand-format.
- Date filtering goes through `@/lib/platform/dateRange` so every panel on the
  dashboard agrees on what "last 7 days" means.

## Gotchas

- **Menu data is the core asset.** `product-inventory` is the only surface that
  can destroy an owner's menu. Never add a bulk delete or bulk overwrite path
  without an explicit confirmation step, and never do it without being asked.
- `orders/` and `transactions/` must keep rendering their frozen state. Do not
  "fix" them by re-enabling the routes — `ordering-frozen.test.ts` will fail,
  and that failure is the feature working.
