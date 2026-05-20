-- 042: Fix ambiguous column reference in confirm_counter_payment_atomic
--
-- Symptom:
--   [PATCH /api/orders/[id]] confirm_counter_payment_atomic: {
--     code: '42702',
--     details: 'It could refer to either a PL/pgSQL variable or a table column.',
--     message: 'column reference "token_number" is ambiguous'
--   }
--
-- Why:
--   The function declares `RETURNS TABLE(token_number TEXT, replayed BOOLEAN)`.
--   That makes `token_number` an OUT parameter visible inside the function body.
--   The SELECT inside the body references the bare column name `token_number`,
--   which the planner cannot disambiguate against the OUT param.
--
-- Fix:
--   Qualify the SELECT with a table alias: `o.token_number` (and qualify
--   site_id/payment_status the same way for consistency).
--   Everything else is identical to migration 026.
--
-- This is a one-line behaviour change — purely a column qualifier — so it's
-- safe to deploy hot.

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
  -- Qualify column references with the table alias `o` so they cannot be
  -- mistaken for the RETURNS TABLE OUT parameters of the same name.
  SELECT o.site_id, o.payment_status, o.token_number
    INTO v_site_id, v_pay_status, v_existing_tok
  FROM public.orders o
  WHERE o.id = p_order_id
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

  -- UPDATE column names are unambiguous (they're always the target table's
  -- columns), but kept qualified for readability.
  UPDATE public.orders
  SET payment_status = 'paid',
      token_number   = v_token,
      updated_at     = now()
  WHERE id = p_order_id;

  RETURN QUERY SELECT v_token, FALSE;
END;
$$;
