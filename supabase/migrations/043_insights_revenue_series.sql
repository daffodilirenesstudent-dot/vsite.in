-- 043: Revenue time-series for the dashboard bar chart
--
-- WHY: Server-side bucketing keeps the chart cheap (one query per dashboard view,
-- ~7-31 rows of {bucket_start, revenue} instead of streaming hundreds of raw
-- transactions and summing on the client).
--
-- HOW: generate_series creates the bucket grid in the requested step, then we
-- LEFT JOIN transactions so empty buckets stay in the output as revenue=0.
-- The bucket boundaries are aligned by the caller (resolveRange in dateRange.ts)
-- to the site's timezone — this RPC does not re-do tz math.
--
-- Step values are the only thing dependent on the bucket name. Anything else is
-- vanilla SQL.

CREATE OR REPLACE FUNCTION public.insights_revenue_series(
  p_site_id  UUID,
  p_start    TIMESTAMPTZ,
  p_end      TIMESTAMPTZ,
  p_bucket   TEXT        -- 'hour' | 'day' | 'week' | 'month'
)
RETURNS TABLE(
  bucket_start TIMESTAMPTZ,
  revenue      NUMERIC,
  txn_count    INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  step INTERVAL;
BEGIN
  -- Resolve step from bucket name. Fall back to '1 day' for unknown inputs so
  -- callers can't trigger a NULL step (which would make generate_series error).
  step := CASE p_bucket
            WHEN 'hour'  THEN INTERVAL '1 hour'
            WHEN 'day'   THEN INTERVAL '1 day'
            WHEN 'week'  THEN INTERVAL '1 week'
            WHEN 'month' THEN INTERVAL '1 month'
            ELSE INTERVAL '1 day'
          END;

  -- Cap the number of buckets to prevent a runaway query if a custom range is
  -- a year of hour-buckets (8,760 rows). 400 covers our worst legitimate case
  -- (last 4 weeks of hourly = 672, but we never request hour for >2-day ranges).
  IF EXTRACT(EPOCH FROM (p_end - p_start)) / EXTRACT(EPOCH FROM step) > 400 THEN
    RAISE EXCEPTION 'too_many_buckets';
  END IF;

  RETURN QUERY
  WITH bucket_grid AS (
    SELECT bs AS b_start
    FROM generate_series(p_start, p_end - INTERVAL '1 microsecond', step) bs
  )
  SELECT
    bg.b_start                         AS bucket_start,
    COALESCE(SUM(t.amount), 0)::NUMERIC AS revenue,
    COALESCE(COUNT(t.id), 0)::INT       AS txn_count
  FROM bucket_grid bg
  LEFT JOIN public.transactions t
         ON t.site_id      = p_site_id
        AND t.status       = 'Success'
        AND t.transacted_at >= bg.b_start
        AND t.transacted_at <  bg.b_start + step
  GROUP BY bg.b_start
  ORDER BY bg.b_start;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insights_revenue_series(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.insights_revenue_series(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) IS
  'Bucketed revenue series for the dashboard bar chart. Caller must pre-align p_start/p_end to local-day boundaries via dateRange.ts. Hard cap of 400 buckets per call.';
