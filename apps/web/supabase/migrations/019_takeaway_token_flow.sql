-- Takeaway token flow: adds a separate daily sequence for takeaway orders
-- placed via the base shop URL when the site is in table QR mode.
-- Token format: "Takeaway 1", "Takeaway 2", ...

ALTER TABLE public.daily_counters
  ADD COLUMN IF NOT EXISTS takeaway_seq SMALLINT NOT NULL DEFAULT 0;

-- Atomic takeaway token allocation (same pattern as allocate_counter/allocate_token).
CREATE OR REPLACE FUNCTION public.allocate_takeaway_token(p_site_id UUID, p_date DATE)
RETURNS SMALLINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_seq SMALLINT;
BEGIN
  INSERT INTO public.daily_counters (site_id, date, counter_seq, token_seq, takeaway_seq)
    VALUES (p_site_id, p_date, 0, 0, 1)
  ON CONFLICT (site_id, date) DO UPDATE
    SET takeaway_seq = daily_counters.takeaway_seq + 1
  RETURNING takeaway_seq INTO v_seq;
  RETURN v_seq;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_takeaway_token(UUID, DATE) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.allocate_takeaway_token(UUID, DATE) TO service_role;
