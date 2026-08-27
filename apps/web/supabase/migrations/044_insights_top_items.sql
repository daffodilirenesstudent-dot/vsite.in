-- 044: Top / Low performing items for the dashboard.
--
-- WHY: The dashboard needs item-level revenue contribution so owners can see
-- what to push (top sellers) and what to drop or re-price (slow movers).
-- Aggregating client-side would force us to ship every order_items row in
-- the range — wasteful and slow once a site has months of orders. One RPC
-- returns just the ranked list.
--
-- HOW: Join order_items → orders, restrict to completed orders inside the
-- caller-resolved [p_start, p_end) window (already tz-aligned via
-- dateRange.ts), group by product (preferring product_id; fall back to
-- product_name for items whose product was deleted), and return aggregates.
-- The API route picks top-N and bottom-N from the same response so we only
-- pay one round-trip.

CREATE OR REPLACE FUNCTION public.insights_top_items(
  p_site_id  UUID,
  p_start    TIMESTAMPTZ,
  p_end      TIMESTAMPTZ
)
RETURNS TABLE(
  product_id   UUID,
  product_name TEXT,
  image_url    TEXT,
  revenue      NUMERIC,
  qty          BIGINT,
  order_count  BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- product_id may be NULL if the product was deleted; group still works
    -- because we fall back to product_name for the grouping key.
    -- MAX() doesn't accept uuid in Postgres, so we use array_agg + index [1]
    -- with a NULL filter to pick the first non-null id for the group.
    (array_agg(oi.product_id) FILTER (WHERE oi.product_id IS NOT NULL))[1] AS product_id,
    oi.product_name                                                        AS product_name,
    -- Pull current product image_url so the card can show a thumbnail;
    -- LEFT JOIN keeps the row even if the product row is gone.
    (array_agg(p.image_url)   FILTER (WHERE p.image_url   IS NOT NULL))[1] AS image_url,
    COALESCE(SUM(oi.subtotal), 0)::NUMERIC      AS revenue,
    COALESCE(SUM(oi.quantity), 0)::BIGINT       AS qty,
    COUNT(DISTINCT oi.order_id)::BIGINT         AS order_count
  FROM public.order_items oi
  JOIN public.orders      o  ON o.id = oi.order_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE o.site_id    = p_site_id
    AND o.status     = 'completed'
    AND o.created_at >= p_start
    AND o.created_at <  p_end
  GROUP BY oi.product_name
  ORDER BY revenue DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insights_top_items(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;

COMMENT ON FUNCTION public.insights_top_items(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Per-product revenue/qty/order_count for completed orders in [p_start, p_end). Caller picks top-N and bottom-N from the ordered result.';
