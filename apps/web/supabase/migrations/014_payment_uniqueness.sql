-- Migration 014: Lock down payment-flow uniqueness
--
-- Two production-critical constraints:
--   1. UNIQUE(billing_history.razorpay_payment_id) — final guard against
--      replay attacks on /api/subscription/verify-payment and against
--      duplicate billing rows from Razorpay webhook redeliveries.
--   2. UNIQUE(site_subscriptions.razorpay_subscription_id) — guarantees the
--      webhook lookup `WHERE razorpay_subscription_id = ?` returns at most
--      one row. Without this, a race in create-subscription could leave two
--      rows pointing at the same Razorpay sub.
--
-- Both use partial UNIQUE indexes (WHERE NOT NULL) so historical rows with
-- NULL ids do not conflict.

-- 1. Replay protection on payments ----------------------------------------
DROP INDEX IF EXISTS public.idx_billing_history_razorpay_payment_id;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_billing_history_razorpay_payment_id
  ON public.billing_history (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- 2. Subscription-id uniqueness -------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_site_subscriptions_razorpay_sub_id
  ON public.site_subscriptions (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;
