# Payments — feature instructions

**Sensitive. Do not change anything here without an explicit instruction
naming this directory.**

This is the revenue path: the owner's own ₹299/month subscription, charged
through Razorpay. `/api/subscription/verify-payment` is never frozen and never
gated — if it breaks, vsite stops earning.

## Test this feature

```
npx vitest run tests/security/paymentAttacks.test.ts tests/acceptance/ordering-frozen.test.ts tests/acceptance/freeze-ordering.test.ts
```

All three must be green before any commit that touches this directory,
`app/api/subscription/`, or `app/api/webhooks/`.

⚠️ `tests/api/razorpayOAuth.test.ts` exists but is in the `exclude` list in
`vitest.config.ts` (frozen-product suite). **`server/razorpayOAuth.ts` has no
running test coverage.** Treat every edit to it as unverified and read it in
full before changing anything.

## Files

- `server/paymentsCrypto.ts` — signature verification. The security boundary.
- `server/razorpayOAuth.ts` — per-restaurant Razorpay Partner Connect.
- `gstincheck.ts` — GSTIN validation for GST-compliant billing.

## Rules

- Never trust a client-supplied amount, order id, or payment status. Verify
  the Razorpay signature server-side, then read the amount from Razorpay's
  response — not from the request body.
- Secrets come from `process.env`. Never log a key, a signature, or a full
  payment payload; use `@/lib/platform/logger` and log ids only.
- Webhooks are idempotent or they are broken. Razorpay retries.
- Never edit a test here to make it pass. `paymentAttacks.test.ts` deliberately
  forces `ORDERING_FROZEN: false` so the defences behind the freeze stay
  covered for the day ordering ships — a failure there is a real hole, even
  though the route it protects is currently 403.

## Pricing

One sellable plan: `qr_menu`, ₹299/mo. `PLAN_PRICES_INR` also carries
`qr_order` (₹499) and `pay_eat` (₹699) so unfreezing needs no price
archaeology. Never quote those two to a customer or surface them in UI.
