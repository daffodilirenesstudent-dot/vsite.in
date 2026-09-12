# Payment Security Threat Report

**Scope:** both payment gateways
1. **Admin → vsite** subscription payments (₹300/mo plans, Razorpay Orders API with the platform keys)
2. **Customer → restaurant** payments (Razorpay OAuth — per-merchant bearer tokens, funds settle direct to restaurant)

**Methodology:** sat in the attacker's chair, enumerated every primitive an attacker can reach (HTTP, Razorpay webhooks, the Razorpay Checkout JS handler) and tested whether a malicious value at each can grant unpaid access, money movement, or cross-tenant access.

**Test suite:** `tests/security/paymentAttacks.test.ts` — 19 passing, 2 documented-only. Run `npx vitest run tests/security/paymentAttacks.test.ts`.

---

## Attack matrix

Legend — ✅ blocked · ⚠ partial · ❌ open

| # | Attack class | Specific attack | Both / Admin / Customer | Status | How we stop it |
|---|---|---|---|---|---|
| A1 | Signature forgery | Empty `razorpay_signature` | Admin | ✅ | 400 — missing field check |
| A2 | Signature forgery | HMAC signed with wrong secret | Admin | ✅ | Timing-safe HMAC compare against platform secret |
| A3 | Signature forgery | Valid signature but wrong order id | Admin | ✅ | HMAC binds `order_id\|payment_id` |
| A4 | Signature forgery | Forged customer signature | Customer | ✅ | OAuth signature uses partner client secret; timing-safe compare |
| A5 | Signature forgery | Signature where `order/payment` are swapped | Customer | ✅ | HMAC binding rejects swap |
| B1 | Replay | Re-POST a captured `payment_id` | Customer | ✅ | Idempotent — returns `alreadyPaid` without double-spending |
| B2 | Replay | Webhook fires same payment twice | Both | ✅ | Unique constraint on `billing_history.razorpay_payment_id`; webhook is `razorpay_status='created'` guard |
| B3 | Replay | Verify-payment runs after webhook | Admin | ✅ | Replay check removed; relies on unique constraint + idempotent update (fix from previous round) |
| C1 | Amount tampering | Razorpay reports `amount=1 paise`, local order is ₹100 | Customer | ✅ | verify-payment fetches Razorpay payment, asserts `amount === subtotal * 100` |
| C2 | Amount tampering | Razorpay reports correct amount but admin paid wrong plan price | Admin | ⚠ | We trust `pending_plan` over Razorpay amount → if frontend tampered the plan choice, we'd activate the chosen plan after taking ₹300. Mitigation: all plans are ₹300, so no incentive. **If pricing ever differs by plan, verify-payment must assert `amount === expected_price_for(pending_plan)`.** |
| C3 | Currency tampering | Submit `currency=USD` | Both | ⚠ | We don't strictly assert `currency==='INR'` on verify; Razorpay rejects mismatched currency at capture, but explicit assertion would be safer |
| D1 | IDOR | Admin replays another admin's `razorpay_order_id` | Admin | ✅ | Order id is bound to `site_id` in `site_subscriptions.razorpay_subscription_id`; mismatch → 400 |
| D2 | IDOR | Customer replays a payment for site A on an order in site B | Customer | ✅ | Local order row's `razorpay_order_id` must match; signature also binds to it |
| D3 | Connect another admin's Razorpay account to your site | OAuth | ✅ | `oauth_states` row carries the `site_id` and `user_id`; callback re-asserts ownership |
| D4 | Read another admin's tokens via `/status` | OAuth | ✅ | Firebase auth + ownership check; response strips `access_token` / `refresh_token` / `public_token` |
| E1 | Webhook forgery | POST `payment.captured` with no signature | Both | ✅ | 400 |
| E2 | Webhook forgery | POST with HMAC signed by wrong secret | Both | ✅ | 400 |
| E3 | Webhook forgery | Forge `account.app.authorization_revoked` to disable a competitor | OAuth | ✅ | Same signature check |
| E4 | Webhook to grant free plan | Forge `payment.captured` referencing a real order id we know | Admin | ✅ | Signature blocks it |
| F1 | Input fuzz | Negative amount in order body | Customer | ✅ | Subtotal verified server-side via `process_order_v2`; amount derived from verified items |
| F2 | Input fuzz | Order id in path is not a UUID | Customer | ✅ | 400 from regex guard |
| F3 | Input fuzz | Oversized `customerName`/`customerEmail` | Customer | ✅ | Length-capped, control chars stripped |
| G1 | Token exposure | Force token leak through API responses | OAuth | ✅ | Tokens encrypted at rest (AES-256-GCM); status route doesn't return them |
| G2 | Token exposure | Steal `PAYMENTS_ENC_KEY` from a leaked DB dump | OAuth | ⚠ | Key lives in env, not DB. Standard concern: rotate `PAYMENTS_ENC_KEY` requires re-encrypting all rows (not implemented) |
| H1 | Race | Webhook + verify-payment concurrent | Admin | ✅ | Both writers are idempotent. Webhook only activates from `razorpay_status='created'`. verify-payment is the canonical writer |
| H2 | Race | Concurrent token refresh corrupts refresh_token | OAuth | ⚠ | Documented: lazy refresh under load can race. Mitigation: implement Postgres advisory lock or `SELECT FOR UPDATE` on refresh path |
| I1 | Authz | Verify-payment without Firebase Bearer | Admin | ✅ | 401 |
| I2 | Authz | Customer verify-payment is public (no Firebase) — by design | Customer | ✅ | Signature is the auth |
| J1 | CSRF | Trigger admin disconnect from a third-party site | OAuth | ✅ | Bearer-token-gated (no cookie auth); third-party can't set Authorization header |
| J2 | CSRF | OAuth `state` mismatch | OAuth | ✅ | State stored in both DB (5-min TTL) and HttpOnly cookie; both must match |
| K1 | Plan substitution | Tamper `plan` query parameter mid-OAuth callback | OAuth | ✅ | We don't read `plan` from query at all; use `pending_plan` from DB |
| K2 | Plan substitution | Race: change `pending_plan` between order create and webhook arrival | Admin | ⚠ | Possible if attacker can call `create-subscription` between their own payment and the webhook. Window: ~5 s. Mitigation: bind `pending_plan` to the specific `razorpay_subscription_id` |
| L1 | DoS | Webhook flood | Both | ⚠ | No rate-limit on webhook endpoints. Mitigation: add Vercel WAF rule or Cloudflare rate-limit on `/api/webhooks/*` |
| L2 | DoS | `/connect` floods `oauth_states` with junk | OAuth | ⚠ | Bearer-gated but no per-user rate-limit; impact small (TEXT rows, 5-min cleanup) |
| M1 | Replay across mode | Pay in test mode, replay against live | Both | ✅ | Mode is set per-token (`mode='test'/'live'`); test public_token can't authorize a live payment |

---

## Highest-priority follow-ups (ranked)

1. **C2 — Plan-price binding.** Today every plan is ₹300, but the moment pricing diverges, `verify-payment` must check `amount === expected_price_for(pending_plan) * 100`. Otherwise a tampered client could pay for the cheap plan but get a ₹300 plan activated. **One-line fix when pricing changes.**

2. **K2 — pending_plan ↔ razorpay_subscription_id binding.** Add a uniqueness invariant: if two `create-subscription` calls overlap, the second one shouldn't be able to override `pending_plan` while the first one's order is still in flight. Either:
   - Reject overlapping `create-subscription` calls (`razorpay_status='created'` lock), or
   - Move `pending_plan` to a side table keyed by `razorpay_order_id` instead of just `site_id`.

3. **H2 — Token refresh race.** Wrap `getActiveIntegration`'s refresh path in a Postgres advisory lock or `SELECT … FOR UPDATE`. Right now two concurrent customer payments arriving when the token is near-expiry could both call `/token` and one would invalidate the other.

4. **L1 — Webhook rate-limit.** Razorpay can hit you faster than you can respond. Add a per-IP rate-limit (Cloudflare/WAF, or in code) on `/api/webhooks/*` to prevent compute exhaustion.

5. **G2 — Encryption key rotation.** Implement a rotation script for `PAYMENTS_ENC_KEY` — decrypt with old, re-encrypt with new — and a `key_version` column. Today rotating the env var bricks every connected integration.

6. **C3 — Explicit currency assertion.** In both `verify-payment` endpoints, add `if (payment.currency !== 'INR') return 400`. Belt-and-suspenders defence.

---

## What is genuinely solid

- **Signature primitives**: HMAC binds `order|payment`, timing-safe compare, length checks, partner secret never leaves the server.
- **Replay**: payment_id has a unique constraint at the DB level — no application logic can be bypassed.
- **Cross-tenant**: ownership re-verified at every mutating endpoint via `eq('user_id', firebase_sub)` plus the bound `razorpay_order_id` on the row.
- **Token storage**: AES-256-GCM with random IV; ciphertext is opaque to a DB-only attacker; no secret tokens leave any HTTP response.
- **OAuth CSRF**: double-binding (DB + HttpOnly cookie) on `state` with a 5-min TTL.
- **Webhook**: forged events are rejected on signature; revoke event correctly disables the integration; partner-secret separation from per-merchant tokens.
- **Plan activation**: split into `create-subscription` (writes `pending_plan`) and `verify-payment`/`webhook` (activates from `pending_plan`). Race-safe — the webhook only activates from `razorpay_status='created'`, so it can't overwrite an already-activated different plan.

---

## Test suite quick reference

```
npx vitest run tests/security/paymentAttacks.test.ts   # 19 attacks blocked
npx vitest run tests/api/razorpayOAuth.test.ts         # 41 OAuth invariants
```

Run both before each release. If anything turns red, do not deploy.
