-- 024: Two performance/correctness fixes:
--
-- 1. Widen daily_counters sequences from SMALLINT to INTEGER.
--    SMALLINT caps at 32,767. High-volume days (events, food courts) would
--    cause an overflow error and stop token/counter allocation.
--    INTEGER supports ~2 billion — effectively unlimited for any restaurant.
--
-- 2. Add index on orders(site_id, updated_at DESC) for the 4-second delta poll.
--    Without it, every poll does a full table scan on orders.

-- ── 1. Widen SMALLINT → INTEGER ──────────────────────────────────────────────
ALTER TABLE public.daily_counters
  ALTER COLUMN counter_seq  TYPE INTEGER,
  ALTER COLUMN token_seq    TYPE INTEGER,
  ALTER COLUMN takeaway_seq TYPE INTEGER;

-- Drop existing SMALLINT-returning functions before recreating with INTEGER return type
DROP FUNCTION IF EXISTS public.allocate_counter(UUID, DATE);
DROP FUNCTION IF EXISTS public.allocate_token(UUID, DATE);
DROP FUNCTION IF EXISTS public.allocate_takeaway_token(UUID, DATE);

CREATE FUNCTION public.allocate_counter(p_site_id UUID, p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_seq INTEGER;
BEGIN
  INSERT INTO public.daily_counters (site_id, date, counter_seq, token_seq, takeaway_seq)
    VALUES (p_site_id, p_date, 1, 0, 0)
  ON CONFLICT (site_id, date) DO UPDATE
    SET counter_seq = daily_counters.counter_seq + 1
  RETURNING counter_seq INTO v_seq;
  RETURN v_seq;
END;
$$;

CREATE FUNCTION public.allocate_token(p_site_id UUID, p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_seq INTEGER;
BEGIN
  INSERT INTO public.daily_counters (site_id, date, counter_seq, token_seq, takeaway_seq)
    VALUES (p_site_id, p_date, 0, 1, 0)
  ON CONFLICT (site_id, date) DO UPDATE
    SET token_seq = daily_counters.token_seq + 1
  RETURNING token_seq INTO v_seq;
  RETURN v_seq;
END;
$$;

CREATE FUNCTION public.allocate_takeaway_token(p_site_id UUID, p_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_seq INTEGER;
BEGIN
  INSERT INTO public.daily_counters (site_id, date, counter_seq, token_seq, takeaway_seq)
    VALUES (p_site_id, p_date, 0, 0, 1)
  ON CONFLICT (site_id, date) DO UPDATE
    SET takeaway_seq = daily_counters.takeaway_seq + 1
  RETURNING takeaway_seq INTO v_seq;
  RETURN v_seq;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_counter(UUID, DATE)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_token(UUID, DATE)          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_takeaway_token(UUID, DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.allocate_counter(UUID, DATE)        TO service_role;
GRANT  EXECUTE ON FUNCTION public.allocate_token(UUID, DATE)          TO service_role;
GRANT  EXECUTE ON FUNCTION public.allocate_takeaway_token(UUID, DATE) TO service_role;

-- ── 2. Delta-poll index ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_site_updated
  ON public.orders (site_id, updated_at DESC);
