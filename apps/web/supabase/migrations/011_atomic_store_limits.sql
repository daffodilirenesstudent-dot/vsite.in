-- ============================================================
-- Migration 011: Atomic store-creation limits
--
-- Prevents TOCTOU race on store creation by enforcing limits
-- inside a BEFORE INSERT trigger that runs under the same
-- transaction lock as the INSERT itself.
--
-- Rules (mirror application logic in /api/onboarding/complete):
--   - Max 5 stores total per user (PAID_STORE_LIMIT)
--   - Max 2 active-trial stores per user (TRIAL_STORE_LIMIT)
--     A store is on trial when it has no paid site_subscription
--     AND was created within the last 14 days.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_store_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total       INT;
  v_trial       INT;
  v_trial_ms    CONSTANT BIGINT := 14 * 24 * 60 * 60 * 1000; -- 14 days in ms
BEGIN
  -- Count all existing stores for this user (the new row isn't inserted yet)
  SELECT COUNT(*) INTO v_total
  FROM public.sites
  WHERE user_id = NEW.user_id;

  IF v_total >= 5 THEN
    RAISE EXCEPTION 'PLAN_LIMIT: Maximum of 5 stores reached for this account'
      USING ERRCODE = 'P0001';
  END IF;

  -- Count active-trial stores (no paid subscription, within 14-day window)
  SELECT COUNT(*) INTO v_trial
  FROM public.sites s
  LEFT JOIN public.site_subscriptions ss ON ss.site_id = s.id
  WHERE s.user_id = NEW.user_id
    AND (
      ss.store_expires_at IS NULL
      OR ss.store_expires_at <= now()
    )
    AND EXTRACT(EPOCH FROM (now() - s.created_at)) * 1000 < v_trial_ms;

  IF v_trial >= 2 THEN
    RAISE EXCEPTION 'TRIAL_LIMIT: Free trial allows up to 2 stores at once. Activate a plan to create more'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_store_limits ON public.sites;

CREATE TRIGGER trg_enforce_store_limits
  BEFORE INSERT ON public.sites
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_store_limits();
