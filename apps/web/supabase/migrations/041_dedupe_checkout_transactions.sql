-- 041: Stop creating duplicate transaction rows at checkout (closes I10).
--
-- BEFORE (bug seen in prod, screenshot 2026-05-19):
--   * Order placed (counter or no_payment) → 1 row inserted: status=Pending, amount=order.subtotal
--   * Table checkout fires → 1 NEW row inserted: status=Success, amount=table_total, linked to first order only
--   → Transactions page shows BOTH. Owner summing the Amount column double-counts revenue.
--
-- AFTER:
--   * Order placed → still 1 row: status=Pending
--   * Table checkout fires → UPDATEs every order's existing Pending row to Success
--     with the cashier's chosen payment_mode (cash/card/upi). transacted_at is bumped
--     to settlement time so the row sorts as "most recently settled" in the UI.
--   → One transaction per order, ever. No double-counting.
--
-- SAFE FOR EXISTING PAYMENT FLOWS:
--   - Online orders are inserted as status='Success'/payment_mode='UPI' at order placement.
--     The Pending filter skips them → no change.
--   - Counter orders that ran confirm_counter_payment_atomic are already 'Success'/'Cash'.
--     The Pending filter skips them → no change.
--   - The C4 hardening in the route layer already blocks checkout if any counter order
--     is unpaid, so the only Pending rows surviving to checkout are no_payment orders
--     (the qr_order plan) — exactly the flow that needs this fix.
--
-- TABLE-LEVEL DATA STILL PRESERVED:
--   public.table_checkouts (inserted in step 1 of the RPC, untouched) keeps the per-checkout
--   aggregate with order_ids[] — that's where you go for "what happened at this checkout".

CREATE OR REPLACE FUNCTION public.checkout_table_atomic(
  p_site_id        UUID,
  p_table_number   TEXT,
  p_order_id       UUID,
  p_token_label    TEXT,
  p_payment_method TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_ids   UUID[]  := '{}';
  v_total       NUMERIC := 0;
  v_ord_id      UUID;
  v_subtotal    NUMERIC;
  v_mode_map    TEXT;
  v_checkout_lbl TEXT;
BEGIN
  -- ── Fetch orders to settle (lock rows immediately) ────────────────────────
  IF p_order_id IS NOT NULL THEN
    -- Takeaway / single-order mode
    SELECT id, subtotal
      INTO v_ord_id, v_subtotal
    FROM public.orders
    WHERE id      = p_order_id
      AND site_id = p_site_id
      AND status <> 'completed'
    FOR UPDATE;

    IF FOUND THEN
      v_order_ids := ARRAY[v_ord_id];
      v_total     := v_subtotal;
    END IF;
  ELSE
    -- Table mode: lock rows first in a CTE, then aggregate
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

  IF array_length(v_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'order_count',     0,
      'total_amount',    0,
      'already_settled', TRUE
    );
  END IF;

  v_total        := ROUND(v_total * 100) / 100;
  v_checkout_lbl := COALESCE(p_table_number, p_token_label, 'takeaway');

  -- Normalize payment_method for the transactions.payment_mode display column.
  v_mode_map := CASE p_payment_method
    WHEN 'cash' THEN 'Cash'
    WHEN 'card' THEN 'Card'
    WHEN 'upi'  THEN 'UPI'
    ELSE 'Cash'
  END;

  -- ── 1. Record checkout (aggregate, audit-friendly) ────────────────────────
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
    SET status          = 'acknowledged',
        acknowledged_at = now()
    WHERE site_id      = p_site_id
      AND table_number = p_table_number
      AND status       = 'pending';
  END IF;

  -- ── 4. Settle transactions — UPDATE Pending rows in-place (NO new INSERT) ─
  -- Only Pending rows are touched. Already-Success rows (online orders, or
  -- counter orders pre-settled via confirm_counter_payment) are left as-is.
  -- transacted_at bumped to settlement time so the UI shows the actual cash-
  -- collection moment, not the order-placed moment.
  UPDATE public.transactions
     SET status        = 'Success',
         payment_mode  = v_mode_map,
         transacted_at = now()
   WHERE order_id     = ANY(v_order_ids)
     AND status       = 'Pending';

  RETURN jsonb_build_object(
    'order_count',     array_length(v_order_ids, 1),
    'total_amount',    v_total,
    'already_settled', FALSE
  );
END;
$function$;

COMMENT ON FUNCTION public.checkout_table_atomic(UUID, TEXT, UUID, TEXT, TEXT) IS
  'Settles a table or single takeaway order atomically. UPDATEs existing Pending transaction rows in-place rather than inserting duplicates. See 041_dedupe_checkout_transactions.sql for the rationale.';
