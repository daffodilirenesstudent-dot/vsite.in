-- ============================================================
-- Migration: Lock subscription table against client writes
--
-- Problem: subs_update_own allowed any authenticated client
-- to directly UPDATE their user_subscriptions row — including
-- store_expires_at and store_plan — granting a free subscription
-- without payment.
--
-- Fix: Remove all client UPDATE access to user_subscriptions.
--   All subscription writes now go through server-side API
--   routes that use the service-role key (bypasses RLS).
--
-- Also removes billing_insert_own so billing records can only
-- be written by the server — preventing fake audit entries.
-- ============================================================

-- Drop client UPDATE access to subscription table
DROP POLICY IF EXISTS "subs_update_own" ON public.user_subscriptions;

-- Drop client INSERT access to billing history
-- (billing records are written by /api/subscription/* routes via service role)
DROP POLICY IF EXISTS "billing_insert_own" ON public.billing_history;

-- Ensure the SELECT policies are still present (read-only client access is fine)
-- These are idempotent recreations — safe to run multiple times.

DROP POLICY IF EXISTS "subs_select_own" ON public.user_subscriptions;
CREATE POLICY "subs_select_own"
  ON public.user_subscriptions FOR SELECT
  USING ((auth.jwt() ->> 'sub') IS NOT NULL
     AND (auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "billing_select_own" ON public.billing_history;
CREATE POLICY "billing_select_own"
  ON public.billing_history FOR SELECT
  USING ((auth.jwt() ->> 'sub') IS NOT NULL
     AND (auth.jwt() ->> 'sub') = user_id);

-- NOTE: subs_insert_own is kept so AuthContext can create the initial
-- subscription row on first login (upsert with ignoreDuplicates: true
-- → INSERT ON CONFLICT DO NOTHING, does NOT require UPDATE permission).
