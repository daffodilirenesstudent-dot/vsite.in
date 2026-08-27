-- 026: Atomic fixes for race conditions and data integrity
--
-- 1. Unique partial index on bill_requests: only one PENDING request per table
--    at any time. INSERT ... ON CONFLICT DO NOTHING makes concurrent taps safe.
--
-- 2. Unique index on orders.order_number: prevents the birthday-problem collision
--    from the random 7-digit generator in process_order_v2. The function already
--    uses random(); this constraint makes duplicates impossible rather than just
--    unlikely.
--
-- 3. confirm_counter_payment_atomic(): replaces the 2-step app-layer logic
--    (allocate_token THEN update WHERE payment_status='pending') with a single
--    atomic function. Prevents the phantom-token bug where concurrent admin
--    clicks allocate two token numbers but only one order gets updated.

-- ── 1. Bill requests: one pending per table ──────────────────────────────────
-- DROP the old index if it exists under a different name, then recreate.
DROP INDEX IF EXISTS bill_requests_one_pending_per_table;

CREATE UNIQUE INDEX bill_requests_one_pending_per_table
  ON public.bill_requests (site_id, table_number)
  WHERE (status = 'pending');

-- ── 2. Order number uniqueness ───────────────────────────────────────────────
-- If duplicates already exist in prod, this will fail — run dedup first:
--   DELETE FROM orders a USING orders b
--   WHERE a.id > b.id AND a.order_number = b.order_number;
DROP INDEX IF EXISTS orders_order_number_unique;

CREATE UNIQUE INDEX orders_order_number_unique
  ON public.orders (order_number);

-- ── 3. Atomic counter-payment confirmation ───────────────────────────────────
-- Wraps: check payment_status = 'pending' → allocate_token → update order
-- All in one transaction. Returns NULL if already confirmed (idempotent).

CREATE OR REPLACE FUNCTION public.confirm_counter_payment_atomic(
  p_order_id UUID
)
RETURNS TABLE(token_number TEXT, replayed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_id       UUID;
  v_pay_status    TEXT;
  v_existing_tok  TEXT;
  v_today         DATE := CURRENT_DATE;
  v_seq           INT;
  v_token         TEXT;
BEGIN
  -- Lock the order row for the duration of this transaction to serialise
  -- concurrent confirm attempts on the same order.
  SELECT site_id, payment_status, token_number
    INTO v_site_id, v_pay_status, v_existing_tok
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  -- Idempotency: already confirmed by a concurrent request
  IF v_pay_status = 'paid' THEN
    RETURN QUERY SELECT v_existing_tok, TRUE;
    RETURN;
  END IF;

  IF v_pay_status <> 'pending' THEN
    RAISE EXCEPTION 'not_a_counter_order';
  END IF;

  -- Allocate token inside the same transaction — no phantom tokens possible
  v_seq := public.allocate_token(v_site_id, v_today);
  v_token := v_seq::TEXT;

  -- Update order atomically — the FOR UPDATE lock guarantees no concurrent
  -- confirm can slip in between the check and this update.
  UPDATE public.orders
  SET payment_status = 'paid',
      token_number   = v_token,
      updated_at     = now()
  WHERE id = p_order_id;

  RETURN QUERY SELECT v_token, FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_counter_payment_atomic(UUID)
  TO service_role;
