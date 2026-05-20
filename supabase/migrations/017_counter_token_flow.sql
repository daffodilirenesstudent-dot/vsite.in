-- Counter/token flow: adds counter_number + token_number to orders,
-- and a daily_counters table for atomic race-safe allocation.
--
-- NOTE: Replays as deployed in production. The original file referenced
-- `firebase_uid` which doesn't exist on `sites`; the deployed version
-- (which this file now reflects) uses `user_id`.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS counter_number TEXT,
  ADD COLUMN IF NOT EXISTS token_number   TEXT;

-- One row per (site, date). counter_seq and token_seq increment atomically
-- via the allocate_counter / allocate_token RPCs (SECURITY DEFINER).
CREATE TABLE IF NOT EXISTS public.daily_counters (
  site_id     UUID        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  date        DATE        NOT NULL DEFAULT CURRENT_DATE,
  counter_seq SMALLINT    NOT NULL DEFAULT 0,
  token_seq   SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, date)
);

ALTER TABLE public.daily_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_counters_owner" ON public.daily_counters;
CREATE POLICY "daily_counters_owner" ON public.daily_counters
  FOR ALL
  USING (
    site_id IN (
      SELECT id FROM public.sites WHERE user_id = (SELECT auth.jwt() ->> 'sub')
    )
  );

-- Atomic counter allocation: returns a 1-based sequence per (site, date).
CREATE OR REPLACE FUNCTION public.allocate_counter(p_site_id UUID, p_date DATE)
RETURNS SMALLINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_seq SMALLINT;
BEGIN
  INSERT INTO public.daily_counters (site_id, date, counter_seq, token_seq)
    VALUES (p_site_id, p_date, 1, 0)
  ON CONFLICT (site_id, date) DO UPDATE
    SET counter_seq = daily_counters.counter_seq + 1
  RETURNING counter_seq INTO v_seq;
  RETURN v_seq;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_token(p_site_id UUID, p_date DATE)
RETURNS SMALLINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_seq SMALLINT;
BEGIN
  INSERT INTO public.daily_counters (site_id, date, counter_seq, token_seq)
    VALUES (p_site_id, p_date, 0, 1)
  ON CONFLICT (site_id, date) DO UPDATE
    SET token_seq = daily_counters.token_seq + 1
  RETURNING token_seq INTO v_seq;
  RETURN v_seq;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_counter(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.allocate_token(UUID, DATE)   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.allocate_counter(UUID, DATE) TO service_role;
GRANT  EXECUTE ON FUNCTION public.allocate_token(UUID, DATE)   TO service_role;

-- Public status helper view (counter, token, payment_status only — no PII).
CREATE OR REPLACE VIEW public.order_status_public AS
  SELECT id, counter_number, token_number, payment_status
  FROM   public.orders;

GRANT SELECT ON public.order_status_public TO anon;
