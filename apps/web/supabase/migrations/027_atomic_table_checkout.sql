-- 027: Atomic table checkout function
--
-- Replaces the two-step app-layer pattern:
--   1. INSERT into table_checkouts
--   2. UPDATE orders SET status='completed'
--   3. UPDATE bill_requests SET status='acknowledged'
--   4. INSERT into transactions
--
-- If Vercel timed out between steps 1 and 2 the checkout record existed but
-- orders stayed active — causing double-checkout and incorrect revenue counts.
--
-- This function wraps all four writes in a single SERIALIZABLE transaction,
-- so either all succeed or none do.
--
-- Returns JSON with { order_count, total_amount, already_settled }
-- already_settled=true means all orders were already completed (idempotent replay).

CREATE OR REPLACE FUNCTION public.checkout_table_atomic(
  p_site_id        UUID,
  p_table_number   TEXT,       -- NULL for takeaway (single-order mode)
  p_order_id       UUID,       -- NULL for table mode (multi-order)
  p_token_label    TEXT,       -- display label for transaction record
  p_payment_method TEXT        -- 'cash' | 'card' | 'upi'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_ids   UUID[]  := '{}';
  v_total       NUMERIC := 0;
  v_ord_id      UUID;
  v_subtotal    NUMERIC;
  v_txn_id      TEXT;
  v_mode_map    TEXT;
  v_checkout_lbl TEXT;
BEGIN
  -- ── Fetch orders to settle (lock rows immediately) ────────────────────────
  IF p_order_id IS NOT NULL THEN
    -- Takeaway / single-order mode
    SELECT id, subtotal
      INTO v_ord_id, v_subtotal
    FROM public.orders
    WHERE id       = p_order_id
      AND site_id  = p_site_id
      AND status  <> 'completed'
    FOR UPDATE;

    IF FOUND THEN
      v_order_ids := ARRAY[v_ord_id];
      v_total     := v_subtotal;
    END IF;
  ELSE
    -- Table mode: lock rows first in a CTE, then aggregate
    -- (FOR UPDATE cannot be combined with aggregate functions in Postgres)
    WITH locked AS (
      SELECT id, subtotal
      FROM public.orders
      WHERE site_id      = p_site_id
        AND table_number = p_table_number
        AND status      <> 'completed'
      FOR UPDATE
    )
    SELECT array_agg(id), COALESCE(SUM(subtotal), 0)
      INTO v_order_ids, v_total
    FROM locked;
  END IF;

  -- Nothing to settle
  IF array_length(v_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'order_count',     0,
      'total_amount',    0,
      'already_settled', TRUE
    );
  END IF;

  v_total       := ROUND(v_total * 100) / 100;
  v_checkout_lbl := COALESCE(p_table_number, p_token_label, 'takeaway');

  -- ── 1. Record checkout ────────────────────────────────────────────────────
  INSERT INTO public.table_checkouts
    (site_id, table_number, payment_method, total_amount, order_ids)
  VALUES
    (p_site_id, v_checkout_lbl, p_payment_method, v_total, v_order_ids);

  -- ── 2. Mark orders completed ──────────────────────────────────────────────
  UPDATE public.orders
  SET status     = 'completed',
      updated_at = now()
  WHERE id = ANY(v_order_ids);

  -- ── 3. Acknowledge pending bill request (table mode only) ─────────────────
  IF p_table_number IS NOT NULL THEN
    UPDATE public.bill_requests
    SET status           = 'acknowledged',
        acknowledged_at  = now()
    WHERE site_id      = p_site_id
      AND table_number = p_table_number
      AND status       = 'pending';
  END IF;

  -- ── 4. Insert transaction record ──────────────────────────────────────────
  v_mode_map := CASE p_payment_method
    WHEN 'cash' THEN 'Cash'
    WHEN 'card' THEN 'Card'
    WHEN 'upi'  THEN 'UPI'
    ELSE 'Cash'
  END;

  v_txn_id := 'TXN'
    || extract(epoch from clock_timestamp())::BIGINT::TEXT
    || upper(lpad(to_hex((floor(random() * 65536))::INT), 4, '0'));

  INSERT INTO public.transactions
    (site_id, order_id, txn_id, customer_email, amount, currency,
     status, payment_mode, gateway_ref)
  VALUES
    (p_site_id, v_order_ids[1], v_txn_id, NULL, v_total, 'INR',
     'Success', v_mode_map, NULL);

  RETURN jsonb_build_object(
    'order_count',     array_length(v_order_ids, 1),
    'total_amount',    v_total,
    'already_settled', FALSE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkout_table_atomic(UUID, TEXT, UUID, TEXT, TEXT)
  TO service_role;
