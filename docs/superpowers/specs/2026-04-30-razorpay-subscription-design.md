# Razorpay Subscription Integration — Smart QR Menu (₹399/mo)

**Date:** 2026-04-30
**Branch:** feat/menu-engineering
**Scope:** Replace mock payment with real Razorpay Subscriptions for the Smart QR Menu plan only.

---

## Overview

Replace the mock payment modal in `/manage/subscription` with a real Razorpay Subscriptions checkout. First payment is ₹2,398 (₹1,999 setup fee + ₹399 first month). Subsequent months auto-debit ₹399 via Razorpay mandate. All subscription state is driven by server-side webhooks — the client never writes subscription status directly.

---

## Environment Variables

```
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_PLAN_ID=plan_...        # created once in Razorpay dashboard (₹399/mo)
RAZORPAY_WEBHOOK_SECRET=...      # set in Razorpay dashboard webhook settings
NEXT_PUBLIC_RAZORPAY_KEY_ID=...  # same as KEY_ID, exposed to client for checkout
```

---

## Database Migration

Add `razorpay_subscription_id` to `site_subscriptions`:

```sql
ALTER TABLE site_subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_site_subs_razorpay_id
  ON site_subscriptions (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;
```

---

## Architecture

```
User clicks "Activate"
  → POST /api/subscription/create-subscription  (Firebase token + siteId)
  → Server creates Razorpay Subscription (plan + ₹1999 addon)
  → Returns { subscriptionId, keyId }
  → Client loads Razorpay JS, opens popup
  → User pays ₹2,398 + authorizes ₹399/mo mandate
  → Razorpay fires webhook → POST /api/webhooks/razorpay
  → Webhook verifies HMAC-SHA256 signature
  → Dispatches by event type → DB update
```

---

## API: POST /api/subscription/create-subscription

**Auth:** Firebase Bearer token (same as mock-activate)

**Request:**
```json
{ "siteId": "uuid" }
```

**Server logic:**
1. Verify Firebase token → `userId`
2. Rate limit: 5 requests/hour per user
3. Verify `siteId` belongs to `userId` in `sites` table
4. Check no active subscription exists (`store_expires_at > now`)
5. Call Razorpay API: create subscription
   - `plan_id`: `RAZORPAY_PLAN_ID`
   - `total_count`: 120 (effectively unlimited, ~10 years)
   - `quantity`: 1
   - `addons`: `[{ item: { name: "Smart QR Menu — Setup Fee", amount: 199900, currency: "INR" } }]`
6. Upsert `site_subscriptions` with `razorpay_subscription_id`, `razorpay_status: 'created'`
7. Return `{ subscriptionId, keyId: NEXT_PUBLIC_RAZORPAY_KEY_ID }`

**Error responses:**
- `401` — invalid/missing Firebase token
- `403` — siteId not owned by user
- `404` — site not found
- `409` — already has active subscription
- `429` — rate limited
- `500` — Razorpay API failure

---

## API: POST /api/webhooks/razorpay

**Webhook endpoint (give this to Razorpay dashboard):**
```
https://vsite.in/api/webhooks/razorpay
```

**Signature verification:**
```
HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET) === X-Razorpay-Signature header
```

Always return `200 OK` — Razorpay retries on non-2xx.

**Event handlers:**

| Event | DB Action |
|---|---|
| `subscription.activated` | `store_plan='qr_menu'`, `store_expires_at=now+30d`, `razorpay_status='active'`, insert billing_history (₹2,398) |
| `subscription.charged` | `store_expires_at=now+30d`, `razorpay_status='active'`, insert billing_history (₹399) |
| `subscription.halted` | `razorpay_status='halted'`, clear `store_expires_at` (menu goes offline) |
| `subscription.cancelled` | `razorpay_status='cancelled'`, clear `store_expires_at` |

Match events to store via `razorpay_subscription_id` in `site_subscriptions`.

---

## Frontend: /manage/subscription

**What changes in the payment modal:**
- Remove mock card form, simulate buttons, testing banner
- Add single "Pay ₹2,398 & Activate" CTA button
- On click: call `create-subscription` → open Razorpay JS popup
- After popup `handler` fires: show "Activating your plan..." spinner
- Poll `refreshPlan()` every 2s for up to 30s
- On plan active: show success screen (existing green check design)
- On 30s timeout: show "Payment received — activating soon" (webhook delay)
- On Razorpay `modal.ondismiss`: return to idle state

**Razorpay checkout config:**
```js
{
  key: keyId,
  subscription_id: subscriptionId,
  name: "vsite",
  description: "Smart QR Menu — ₹399/month",
  prefill: { name: user.displayName, contact: user.phoneNumber },
  theme: { color: "#5452F6" },
}
```

**What stays the same:**
- Order summary card (₹1,999 + ₹399 = ₹2,398 due today)
- Success screen (green check, "Plan Activated!")
- Failed state design
- Coming Soon modal for QR Ordering plan

---

## Files Changed

| File | Action |
|---|---|
| `supabase/migrations/012_razorpay_subscription_id.sql` | New — adds columns to site_subscriptions |
| `src/app/api/subscription/create-subscription/route.ts` | New — creates Razorpay subscription |
| `src/app/api/webhooks/razorpay/route.ts` | New — webhook handler |
| `src/app/manage/subscription/page.tsx` | Modified — real checkout replaces mock |
| `src/app/api/subscription/mock-activate/route.ts` | Untouched — kept for dev |

---

## Security

- Webhook signature verified server-side before any DB write
- `create-subscription` rate-limited + ownership-gated
- `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` never exposed to client
- Subscription state only written by webhook, not by client callback
- `razorpay_subscription_id` indexed for fast webhook lookups
