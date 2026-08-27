-- 029: Split rate limiting — IP limit is strict (pre-check), site limit is
--      on successful order creation only (post-creation).
--
-- Problem: Both site and IP rate limits were incremented BEFORE any validation.
-- A competitor could send 100 bad requests to a site and lock out ALL customers
-- for 60 seconds (site limit = 100/min). The IP limit is fine as a strict
-- pre-check because it only affects one IP. The site-wide limit must NOT be
-- weaponisable by a single attacker.
--
-- Solution:
--   • IP rate limit:   checked + incremented BEFORE order creation (unchanged).
--     Protects against per-IP spam. One attacker can only burn their own quota.
--   • Site rate limit: incremented AFTER successful order creation only.
--     A site can still enforce 100 real orders/min, but failed/abusive requests
--     don't consume the site quota.
--
-- New function: check_and_bump_site_rate_limit(key, window_ms, limit)
-- Returns TRUE if the site is under the limit AND bumps the counter.
-- Only call this after create_order_atomic succeeds.

CREATE OR REPLACE FUNCTION public.check_site_rate_limit_only(
  p_key       TEXT,
  p_window_ms BIGINT,
  p_limit     INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count        INT;
BEGIN
  v_window_start := now() - (p_window_ms || ' milliseconds')::INTERVAL;

  -- Read current count WITHOUT incrementing
  SELECT COALESCE(SUM(request_count), 0)
    INTO v_count
  FROM public.rate_limit_counters
  WHERE key = p_key
    AND window_start >= v_window_start;

  RETURN v_count < p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_site_rate_limit(
  p_key       TEXT,
  p_window_ms BIGINT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.rate_limit_counters (key, window_start, request_count)
  VALUES (p_key, date_trunc('minute', now()), 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET request_count = rate_limit_counters.request_count + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_site_rate_limit_only(TEXT, BIGINT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_site_rate_limit(TEXT, BIGINT) TO service_role;
