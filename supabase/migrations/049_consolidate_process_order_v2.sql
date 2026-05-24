-- 049: Consolidate process_order_v2 + fix transactions model
--
-- Two problems this migration fixes:
--
-- 1. Duplicate process_order_v2 functions
--    The DB had two overloads — one with p_customer_phone (created out-of-band,
--    no migration file), and one without (migration 046's GST version). Every
--    route call passes p_customer_phone so PostgREST picked the no-GST version,
--    and tax was never snapshotted onto any order even though the wizard had
--    been completed.
--
--    Fix: drop both, recreate a single unified function that accepts
--    p_customer_phone AND has the GST logic AND the optional override params
--    used by /api/orders/finalize-payment.
--
-- 2. Duplicate transaction rows per checkout
--    process_order_v2 was inserting a Pending/Cash row for every counter and
--    no_payment order. checkout_table_atomic was inserting a separate Success
--    row for the table aggregate. Result: each table session produced one
--    aggregate row PLUS one Pending row per individual order — confusing
--    admins reviewing transactions.
--
--    Fix: process_order_v2 now skips the transaction insert for no_payment
--    orders. checkout_table_atomic UPDATEs each settled order's existing
--    transaction (counter case) to Success with the staff-selected mode, or
--    INSERTs one Success row per no_payment order at checkout time. End
--    state: exactly one transaction row per order, status reflects whether
--    the order has been settled, payment_mode reflects what the staff chose.

DROP FUNCTION IF EXISTS public.process_order_v2(
  uuid, text, text, text, text, jsonb, integer, text, text, text, bigint, integer, integer
);
DROP FUNCTION IF EXISTS public.process_order_v2(
  uuid, text, text, text, jsonb, integer, text, text, text, bigint, integer, integer, numeric, text
);

CREATE OR REPLACE FUNCTION public.process_order_v2(
  p_site_id            UUID,
  p_customer_name      TEXT,
  p_customer_email     TEXT,
  p_payment_method     TEXT,
  p_items_json         JSONB,
  p_table_number       INT,
  p_idempotency_key    TEXT,
  p_site_rate_key      TEXT,
  p_ip_rate_key        TEXT,
  p_rl_window_ms       BIGINT,
  p_rl_site_limit      INT,
  p_rl_ip_limit        INT,
  -- All three trailing args default NULL so legacy callers (no phone, no GST
  -- override) and the online-finalize path (snapshotted overrides) both work.
  p_customer_phone     TEXT    DEFAULT NULL,
  p_gst_rate_override  NUMERIC DEFAULT NULL,
  p_gstin_override     TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rl_site_ok       BOOL;
  v_rl_ip_ok         BOOL;
  v_site_id          UUID;
  v_is_live          BOOL;
  v_is_open          BOOL;
  v_site_slug        TEXT;
  v_site_name        TEXT;
  v_qr_mode          TEXT;
  v_pending_qr_mode  TEXT;
  v_qr_switch_at     TIMESTAMPTZ;
  v_table_count      INT;
  v_store_plan       TEXT;
  v_site_gst_rate    NUMERIC;
  v_site_gstin       TEXT;
  v_site_currency    TEXT;
  v_effective_mode   TEXT;
  v_resolved_table   INT;
  v_is_takeaway      BOOL := FALSE;
  v_item             JSONB;
  v_prod_id          UUID;
  v_prod_name        TEXT;
  v_prod_price       NUMERIC;
  v_prod_is_live     BOOL;
  v_prod_metadata    JSONB;
  v_unit_price       NUMERIC;
  v_variant          JSONB;
  v_variants         JSONB;
  v_qty              INT;
  v_variant_size     TEXT;
  v_server_subtotal  NUMERIC := 0;
  v_gst_rate         NUMERIC := 0;
  v_gstin_snapshot   TEXT;
  v_tax_amount       NUMERIC := 0;
  v_cgst_amount      NUMERIC := 0;
  v_sgst_amount      NUMERIC := 0;
  v_total_amount     NUMERIC := 0;
  v_display_items    JSONB   := '[]'::JSONB;
  v_order_items      JSONB   := '[]'::JSONB;
  v_seq              INT;
  v_counter_number   TEXT;
  v_token_number     TEXT;
  v_order_number     TEXT;
  v_payment_status   TEXT;
  v_order_id         UUID;
  v_txn_id           TEXT;
  v_today            DATE;
  v_prior_order_id   UUID;
  v_prior_order_num  TEXT;
  v_prior_counter    TEXT;
  v_prior_token      TEXT;
  v_retry            INT := 0;
  c_max_counter_day  CONSTANT INT     := 999;
  c_max_token_day    CONSTANT INT     := 5000;
  c_min_subtotal     CONSTANT NUMERIC := 1;
  c_max_subtotal     CONSTANT NUMERIC := 200000;
  c_max_retries      CONSTANT INT     := 5;
BEGIN
  SELECT public.check_rate_limit(p_ip_rate_key, p_rl_window_ms, p_rl_ip_limit) INTO v_rl_ip_ok;
  SELECT public.check_site_rate_limit_only(p_site_rate_key, p_rl_window_ms, p_rl_site_limit) INTO v_rl_site_ok;
  IF NOT COALESCE(v_rl_ip_ok, TRUE) OR NOT COALESCE(v_rl_site_ok, TRUE) THEN
    RETURN jsonb_build_object('status','rate_limited');
  END IF;

  IF p_idempotency_key <> '' THEN
    SELECT ok.order_id, ok.order_number, ok.counter_number, ok.token_number
      INTO v_prior_order_id, v_prior_order_num, v_prior_counter, v_prior_token
    FROM public.order_idempotency_keys ok
    WHERE ok.key = p_idempotency_key AND ok.expires_at > now() LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('status','replayed','order_id',v_prior_order_id,'order_number',v_prior_order_num,'counter_number',v_prior_counter,'token_number',v_prior_token);
    END IF;
  END IF;

  SELECT s.id, s.is_live, s.is_open, s.slug, s.name,
         s.qr_mode, s.pending_qr_mode, s.qr_mode_switch_at, s.table_count,
         COALESCE(ss.store_plan,'qr_menu'),
         s.gst_rate_pct, s.gstin, s.gst_status, s.currency_code
  INTO v_site_id, v_is_live, v_is_open, v_site_slug, v_site_name,
       v_qr_mode, v_pending_qr_mode, v_qr_switch_at, v_table_count,
       v_store_plan, v_site_gst_rate, v_site_gstin, v_gstin_snapshot, v_site_currency
  FROM public.sites s LEFT JOIN public.site_subscriptions ss ON ss.site_id = s.id
  WHERE s.id = p_site_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','store_not_found'); END IF;
  IF NOT COALESCE(v_is_live, FALSE) THEN RETURN jsonb_build_object('status','store_offline'); END IF;
  IF NOT COALESCE(v_is_open, FALSE) THEN RETURN jsonb_build_object('status','store_closed'); END IF;

  IF p_gst_rate_override IS NOT NULL THEN v_gst_rate := COALESCE(p_gst_rate_override,0);
  ELSE v_gst_rate := COALESCE(v_site_gst_rate,0); END IF;
  IF p_gstin_override IS NOT NULL THEN v_gstin_snapshot := p_gstin_override;
  ELSE v_gstin_snapshot := v_site_gstin; END IF;

  IF v_store_plan = 'qr_menu' THEN RETURN jsonb_build_object('status','plan_no_orders'); END IF;
  IF p_payment_method = 'no_payment' AND v_store_plan <> 'qr_order' THEN
    RETURN jsonb_build_object('status','invalid_payment_method');
  END IF;
  IF p_payment_method IN ('online','counter') AND v_store_plan = 'qr_order' THEN
    RETURN jsonb_build_object('status','invalid_payment_method');
  END IF;

  v_effective_mode := COALESCE(v_qr_mode,'common');
  IF v_pending_qr_mode IS NOT NULL AND v_qr_switch_at IS NOT NULL AND v_qr_switch_at <= now() THEN
    v_effective_mode := v_pending_qr_mode;
    UPDATE public.sites SET qr_mode=v_pending_qr_mode, pending_qr_mode=NULL, qr_mode_switch_at=NULL WHERE id=p_site_id;
  END IF;

  v_resolved_table := NULL;
  v_is_takeaway := FALSE;
  IF p_payment_method = 'no_payment' THEN
    IF p_table_number IS NOT NULL THEN
      IF p_table_number < 1 OR p_table_number > COALESCE(v_table_count,50) THEN
        RETURN jsonb_build_object('status','invalid_table_number');
      END IF;
      v_resolved_table := p_table_number;
    ELSE v_is_takeaway := TRUE; END IF;
  ELSIF v_effective_mode = 'table' THEN
    IF p_table_number IS NOT NULL THEN
      IF p_table_number < 1 OR p_table_number > COALESCE(v_table_count,50) THEN
        RETURN jsonb_build_object('status','invalid_table_number');
      END IF;
      v_resolved_table := p_table_number;
    ELSE v_is_takeaway := TRUE; END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items_json) LOOP
    v_prod_id := (v_item->>'id')::UUID;
    v_qty := (v_item->>'qty')::INT;
    v_variant_size := v_item->>'variantSize';
    SELECT p.name, p.selling_price, p.is_live, p.metadata
      INTO v_prod_name, v_prod_price, v_prod_is_live, v_prod_metadata
    FROM public.products p WHERE p.id = v_prod_id AND p.site_id = p_site_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','item_not_found','item_id',v_prod_id); END IF;
    IF NOT COALESCE(v_prod_is_live, TRUE) THEN RETURN jsonb_build_object('status','item_unavailable','item_name',v_prod_name); END IF;
    v_unit_price := v_prod_price::NUMERIC;
    IF v_variant_size IS NOT NULL AND v_variant_size <> '' THEN
      v_variants := v_prod_metadata->'variants';
      v_variant := NULL;
      IF jsonb_typeof(v_variants) = 'array' THEN
        SELECT elem INTO v_variant FROM jsonb_array_elements(v_variants) elem WHERE elem->>'size' = v_variant_size LIMIT 1;
      END IF;
      IF v_variant IS NULL THEN RETURN jsonb_build_object('status','variant_not_found','item_name',v_prod_name,'variant',v_variant_size); END IF;
      v_unit_price := (v_variant->>'price')::NUMERIC;
    END IF;
    IF NOT (v_unit_price >= 0) THEN RETURN jsonb_build_object('status','invalid_price','item_name',v_prod_name); END IF;
    v_server_subtotal := v_server_subtotal + v_unit_price * v_qty;
    v_display_items := v_display_items || jsonb_build_array(jsonb_build_object('qty',v_qty,'name',v_prod_name,'price',v_unit_price,'variantSize',v_variant_size));
    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object('product_id',v_prod_id,'product_name',v_prod_name,'variant_name',COALESCE(v_variant_size,''),'quantity',v_qty,'unit_price',v_unit_price,'subtotal',ROUND(v_unit_price*v_qty*100)/100));
  END LOOP;

  v_server_subtotal := ROUND(v_server_subtotal * 100) / 100;
  IF v_server_subtotal < c_min_subtotal OR v_server_subtotal > c_max_subtotal THEN
    RETURN jsonb_build_object('status','invalid_total','subtotal',v_server_subtotal);
  END IF;

  v_tax_amount  := ROUND(v_server_subtotal * v_gst_rate / 100 * 100) / 100;
  v_cgst_amount := ROUND(v_tax_amount * 100 / 2) / 100;
  v_sgst_amount := v_tax_amount - v_cgst_amount;
  v_total_amount := v_server_subtotal + v_tax_amount;

  v_today := CURRENT_DATE;
  v_counter_number := NULL;
  v_token_number := NULL;
  IF p_payment_method = 'counter' THEN
    v_seq := public.allocate_counter(p_site_id, v_today);
    IF v_seq > c_max_counter_day THEN RETURN jsonb_build_object('status','counter_full'); END IF;
    v_counter_number := 'C' || lpad(v_seq::TEXT, 3, '0');
  ELSIF p_payment_method = 'no_payment' THEN
    IF v_is_takeaway THEN
      v_seq := public.allocate_takeaway_token(p_site_id, v_today);
      IF v_seq <= c_max_token_day THEN v_token_number := 'Takeaway ' || v_seq::TEXT; END IF;
    END IF;
  ELSIF p_payment_method = 'online' THEN
    v_seq := public.allocate_token(p_site_id, v_today);
    IF v_seq <= c_max_token_day THEN v_token_number := v_seq::TEXT; END IF;
  END IF;

  v_payment_status := CASE WHEN p_payment_method IN ('online','no_payment') THEN 'paid' ELSE 'pending' END;
  v_order_id := NULL;
  WHILE v_order_id IS NULL AND v_retry < c_max_retries LOOP
    v_order_number := ((floor(random() * 9000000) + 1000000)::BIGINT)::TEXT;
    SELECT public.create_order_atomic(
      p_site_id := p_site_id, p_order_number := v_order_number, p_customer_name := p_customer_name,
      p_customer_email := p_customer_email, p_payment_method := p_payment_method, p_payment_status := v_payment_status,
      p_status := 'received', p_items_json := v_display_items, p_subtotal := v_server_subtotal,
      p_total_amount := v_total_amount, p_counter_number := v_counter_number, p_token_number := v_token_number,
      p_table_number := CASE WHEN v_resolved_table IS NOT NULL THEN v_resolved_table::TEXT ELSE NULL END,
      p_order_items := v_order_items
    ) INTO v_order_id;
    v_retry := v_retry + 1;
  END LOOP;
  IF v_order_id IS NULL THEN RETURN jsonb_build_object('status','order_creation_failed'); END IF;

  -- Stamp tax snapshot + phone + currency. create_order_atomic predates these columns.
  UPDATE public.orders
  SET gst_rate_pct   = v_gst_rate,
      tax_amount     = v_tax_amount,
      cgst_amount    = v_cgst_amount,
      sgst_amount    = v_sgst_amount,
      gstin_snapshot = CASE WHEN v_gst_rate > 0 THEN v_gstin_snapshot ELSE NULL END,
      currency_code  = COALESCE(v_site_currency, 'INR'),
      customer_phone = CASE WHEN p_customer_phone IS NOT NULL AND p_customer_phone <> '' THEN p_customer_phone ELSE customer_phone END
  WHERE id = v_order_id;

  -- Transaction insert policy (the fix for the duplicate-row bug):
  --   online     -> Pending / UPI / NULL gateway_ref. finalize-payment flips
  --                 to Success and stamps the real razorpay_payment_id only
  --                 AFTER the Razorpay signature + amount + status check pass.
  --                 (C3 hardening — previously inserted Success with a fake
  --                 'mock-<uuid>' gateway_ref, which laundered unpaid orders
  --                 into the ledger if the post-RPC update failed.)
  --   counter    -> Pending / Cash now; confirm_counter_payment flips it to Success
  --   no_payment -> NO row here. checkout_table_atomic inserts one Success row
  --                 per order at table-checkout. This replaces the old aggregate
  --                 row that confused admins.
  IF p_payment_method <> 'no_payment' THEN
    v_txn_id := 'TXN' || extract(epoch from clock_timestamp())::BIGINT::TEXT || upper(lpad(to_hex((floor(random()*65536))::INT),4,'0'));
    INSERT INTO public.transactions (site_id, order_id, txn_id, customer_email, customer_phone, amount, currency, status, payment_mode, gateway_ref)
    VALUES (p_site_id, v_order_id, v_txn_id, NULLIF(p_customer_email, ''), NULLIF(p_customer_phone, ''),
      v_total_amount, COALESCE(v_site_currency, 'INR'),
      'Pending',
      CASE WHEN p_payment_method='online' THEN 'UPI' ELSE 'Cash' END,
      NULL);
  END IF;

  IF p_idempotency_key <> '' THEN
    INSERT INTO public.order_idempotency_keys (key, site_id, order_id, order_number, counter_number, token_number, expires_at)
    VALUES (p_idempotency_key, p_site_id, v_order_id, v_order_number, v_counter_number, v_token_number, now() + INTERVAL '24 hours')
    ON CONFLICT (key) DO NOTHING;
  END IF;

  PERFORM public.bump_site_rate_limit(p_site_rate_key, p_rl_window_ms);

  RETURN jsonb_build_object('status','ok','order_id',v_order_id,'order_number',v_order_number,
    'counter_number',v_counter_number,'token_number',v_token_number,'subtotal',v_server_subtotal,
    'tax_amount',v_tax_amount,'cgst_amount',v_cgst_amount,'sgst_amount',v_sgst_amount,
    'gst_rate_pct',v_gst_rate,'gstin_snapshot',v_gstin_snapshot,'total_amount',v_total_amount,
    'site_name',v_site_name,'site_slug',v_site_slug,'verified_items',v_display_items);
END;
$$;


CREATE OR REPLACE FUNCTION public.checkout_table_atomic(
  p_site_id        UUID,
  p_table_number   TEXT,
  p_order_id       UUID,
  p_token_label    TEXT,
  p_payment_method TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order_ids    UUID[]  := '{}';
  v_total        NUMERIC := 0;
  v_ord_id       UUID;
  v_ord_total    NUMERIC;
  v_mode_map     TEXT;
  v_checkout_lbl TEXT;
  v_txn_id_new   TEXT;
  v_ord          RECORD;
BEGIN
  IF p_order_id IS NOT NULL THEN
    SELECT id, total_amount INTO v_ord_id, v_ord_total
    FROM public.orders WHERE id = p_order_id AND site_id = p_site_id AND status <> 'completed' FOR UPDATE;
    IF FOUND THEN v_order_ids := ARRAY[v_ord_id]; v_total := v_ord_total; END IF;
  ELSE
    WITH locked AS (
      SELECT id, total_amount FROM public.orders
      WHERE site_id = p_site_id AND table_number = p_table_number AND status <> 'completed' FOR UPDATE
    )
    SELECT array_agg(id), COALESCE(SUM(total_amount), 0) INTO v_order_ids, v_total FROM locked;
  END IF;

  IF array_length(v_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('order_count',0,'total_amount',0,'already_settled',TRUE);
  END IF;

  v_total := ROUND(v_total * 100) / 100;
  v_checkout_lbl := COALESCE(p_table_number, p_token_label, 'takeaway');

  INSERT INTO public.table_checkouts (site_id, table_number, payment_method, total_amount, order_ids)
  VALUES (p_site_id, v_checkout_lbl, p_payment_method, v_total, v_order_ids);

  UPDATE public.orders SET status='completed', updated_at=now() WHERE id = ANY(v_order_ids);

  IF p_table_number IS NOT NULL THEN
    UPDATE public.bill_requests SET status='acknowledged', acknowledged_at=now()
    WHERE site_id=p_site_id AND table_number=p_table_number AND status='pending';
  END IF;

  v_mode_map := CASE p_payment_method WHEN 'cash' THEN 'Cash' WHEN 'card' THEN 'Card' WHEN 'upi' THEN 'UPI' ELSE 'Cash' END;

  -- Settle one transaction per order:
  --   - counter orders already have a Pending row from process_order_v2 -> flip it
  --   - no_payment orders have none -> insert one Success row each
  FOR v_ord IN
    SELECT o.id, o.payment_method, o.total_amount, o.customer_email, o.customer_phone, o.currency_code
    FROM public.orders o WHERE o.id = ANY(v_order_ids)
  LOOP
    IF EXISTS (SELECT 1 FROM public.transactions t WHERE t.order_id = v_ord.id) THEN
      UPDATE public.transactions
      SET status = 'Success',
          payment_mode = v_mode_map,
          customer_email = COALESCE(NULLIF(customer_email, ''), NULLIF(v_ord.customer_email, '')),
          customer_phone = COALESCE(customer_phone, v_ord.customer_phone)
      WHERE order_id = v_ord.id;
    ELSE
      v_txn_id_new := 'TXN' || extract(epoch from clock_timestamp())::BIGINT::TEXT || upper(lpad(to_hex((floor(random()*65536))::INT),4,'0'));
      INSERT INTO public.transactions (site_id, order_id, txn_id, customer_email, customer_phone, amount, currency, status, payment_mode, gateway_ref)
      VALUES (p_site_id, v_ord.id, v_txn_id_new, NULLIF(v_ord.customer_email, ''), v_ord.customer_phone,
              v_ord.total_amount, COALESCE(v_ord.currency_code, 'INR'), 'Success', v_mode_map, NULL);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('order_count', array_length(v_order_ids, 1), 'total_amount', v_total, 'already_settled', FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.checkout_table_atomic(UUID, TEXT, UUID, TEXT, TEXT) TO service_role;

-- C1 hardening: the DROP+CREATE above wipes grants from migration 025.
-- Without these REVOKEs, the new function inherits the PUBLIC EXECUTE default,
-- so any holder of the anon key (shipped in the browser) could call it via
-- supabase-js and mint paid orders directly, bypassing every JS-layer guard
-- in /api/orders. Lock execution to service_role only.
REVOKE ALL ON FUNCTION public.process_order_v2(
  UUID, TEXT, TEXT, TEXT, JSONB, INT, TEXT, TEXT, TEXT, BIGINT, INT, INT, TEXT, NUMERIC, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_order_v2(
  UUID, TEXT, TEXT, TEXT, JSONB, INT, TEXT, TEXT, TEXT, BIGINT, INT, INT, TEXT, NUMERIC, TEXT
) TO service_role;

-- Same hardening for checkout_table_atomic (recreated above, grants reset).
REVOKE ALL ON FUNCTION public.checkout_table_atomic(UUID, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
