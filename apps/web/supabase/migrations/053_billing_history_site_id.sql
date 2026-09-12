-- Migration 053: attribute each payment to the store it paid for.
--
-- `billing_history` was keyed by `user_id` alone. An owner with five stores
-- therefore saw one merged list on every store's subscription page — every
-- store showing every other store's payments. There was nothing to filter on:
-- the store a payment belonged to was simply never recorded.
--
-- Nullable on purpose. Existing rows predate this column and most of them
-- cannot be attributed after the fact (see the backfill below), so NULL means
-- "recorded before per-store billing" rather than "missing data".
--
-- ON DELETE SET NULL, not CASCADE: deleting a store must never destroy the
-- record that money changed hands. The payment happened regardless.

ALTER TABLE public.billing_history
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;

-- Backfill only what is unambiguous.
--
-- A payment can be attributed with confidence only when the payer owns exactly
-- one store, in which case there is nothing to choose between. Owners with
-- several stores are left NULL: plan_name does not identify a store, and two
-- stores on the same plan are indistinguishable by amount or date. Guessing
-- would put a real payment under the wrong store, which is worse than leaving
-- it unattributed and saying so in the UI.
UPDATE public.billing_history AS b
SET site_id = s.id
FROM (
  -- HAVING COUNT(*) = 1 means there is exactly one row per group, so taking
  -- the first element of the aggregate is picking the only store there is.
  -- (MIN() has no uuid overload in Postgres, and would read as "the smallest
  -- store id" rather than "the only one", which is not what is meant.)
  SELECT user_id, (array_agg(id))[1] AS id
  FROM public.sites
  GROUP BY user_id
  HAVING COUNT(*) = 1
) AS s
WHERE b.site_id IS NULL
  AND b.user_id = s.user_id;

-- The subscription page reads "this user, this store, newest first".
CREATE INDEX IF NOT EXISTS billing_history_user_site_created_idx
  ON public.billing_history (user_id, site_id, created_at DESC);
