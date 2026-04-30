-- Migration 013: Add razorpay_payment_id to billing_history
-- Used for audit trail and deduplication of webhook events.

ALTER TABLE public.billing_history
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_billing_history_razorpay_payment_id
  ON public.billing_history (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
