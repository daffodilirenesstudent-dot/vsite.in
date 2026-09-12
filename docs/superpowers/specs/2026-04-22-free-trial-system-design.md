# 14-Day Free Trial System — Design Spec

**Goal:** Every new signup instantly gets a 14-day free trial. When it expires, their digital menu goes offline and the live toggle is locked until they activate a paid plan. All data stays safe.

**No payment gateway in this spec** — subscription activation is a stub (existing mock flow). Payment integration is a separate future spec.

---

## Database

### Change to `user_subscriptions`

Add one column:

```sql
ALTER TABLE user_subscriptions
  ADD COLUMN trial_ends_at TIMESTAMPTZ;
```

Set on every new user insert: `trial_ends_at = NOW() + INTERVAL '14 days'`.

Existing columns unchanged:
- `store_plan` — current plan key (`qr_menu`, `pay_eat`, etc.)
- `store_expires_at` — paid subscription expiry
- `trial_ends_at` — new, trial window end

---

## Signup Flow

**File:** `src/components/AuthContext.tsx` → `provisionNewUser()`

Change the `user_subscriptions` insert to include:
```ts
trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
```

Every new user gets trial activated immediately on OTP verification.

---

## Trial Status — PlanContext

**File:** `src/components/PlanContext.tsx`

Extend to fetch `trial_ends_at` and `store_expires_at` alongside `store_plan`.

New values exposed:
| Field | Type | Meaning |
|---|---|---|
| `trialDaysLeft` | number | Days remaining in trial (0 if expired) |
| `isTrialActive` | boolean | `trial_ends_at > now` |
| `isTrialExpired` | boolean | trial ended AND not subscribed |
| `isSubscribed` | boolean | paid plan with `store_expires_at > now` |
| `canGoLive` | boolean | `isTrialActive OR isSubscribed` |

`isSubscribed` = `store_plan !== 'qr_menu'` AND `store_expires_at > now`.

---

## Enforcement Points

### A — Public Menu (`/shop/[slug]/page.tsx`)

Server-side, no DB writes. When serving the shop:

1. Fetch site owner's `user_subscriptions` via `user_id` on the `sites` row.
2. Compute `canGoLive = isTrialActive OR isSubscribed`.
3. If `!canGoLive` → return the existing offline page (same as `is_live === false`).

This means even if `is_live = true` in the DB, the menu won't show if the trial/subscription is expired.

### B — Dashboard Live Toggle (`src/components/manage/ShopCard.tsx`)

- If `canGoLive` → toggle works normally (existing behaviour).
- If `!canGoLive` → toggle is visually disabled (greyed out, `cursor-not-allowed`), replaced by an "Activate Plan" CTA button that links to `/manage/subscription`.

### C — Trial Banner (new component)

**File:** `src/components/manage/TrialBanner.tsx`

Rendered in the dashboard layout above all page content. Conditions:

| State | Banner |
|---|---|
| `trialDaysLeft > 5` | No banner |
| `trialDaysLeft 1–5` | Amber warning: "X days left in your free trial — activate a plan to keep your menu live." |
| `trialDaysLeft === 0, isTrialActive` | Amber: "Your trial ends today." |
| `isTrialExpired` | Red: "Your free trial has ended. Your menu is offline. Activate a plan to go live again." |

Banner has a single CTA: "Activate Plan →" linking to `/manage/subscription`.

---

## Data Safety

- No menu items, products, banners, or orders are deleted when trial expires.
- `sites.is_live` is NOT written to by this system — the enforcement is logic-only at read time.
- When user activates a paid plan, `canGoLive` becomes true immediately and the menu is accessible again.

---

## Files Changed / Created

| File | Change |
|---|---|
| `src/components/AuthContext.tsx` | Add `trial_ends_at` to new user insert |
| `src/components/PlanContext.tsx` | Fetch trial fields, expose trial state |
| `src/components/manage/TrialBanner.tsx` | New — trial countdown/expired banner |
| `src/components/manage/ShopCard.tsx` | Gate `is_live` toggle on `canGoLive` |
| `src/app/shop/[slug]/page.tsx` | Server-side trial check before serving menu |
| `src/app/manage/layout.tsx` (or ManageLayoutClient) | Render `<TrialBanner />` |

---

## Out of Scope

- Payment gateway (future spec)
- Email/SMS notifications (future spec)
- Automatic DB writes to set `is_live = false` (enforcement is logic-only)
- Admin override / grace period
