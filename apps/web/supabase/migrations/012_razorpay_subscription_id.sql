-- Migration 012: Add Razorpay subscription tracking columns
--
-- razorpay_subscription_id — links site to a Razorpay subscription object
-- razorpay_status          — mirrors Razorpay status (created/active/halted/cancelled)
-- Indexed for fast webhook lookups by subscription ID.

ALTER TABLE public.site_subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_site_subs_razorpay_id
  ON public.site_subscriptions (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;
