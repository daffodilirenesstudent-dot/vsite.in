-- 034: KOT printing system
-- 1. Add kot_mode column to sites ('manual' | 'automatic')
-- 2. Update process_order_v2 to create orders as 'received' instead of 'preparing'
--    'received' = KOT not yet sent to kitchen
--    'preparing' = KOT printed, kitchen working on it

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS kot_mode TEXT NOT NULL DEFAULT 'manual'
  CHECK (kot_mode IN ('manual', 'automatic'));

-- Full function rewrite — only change is p_status := 'preparing' → p_status := 'received'
CREATE OR REPLACE FUNCTION public.process_order_v2(
  p_site_id          UUID,
  p_customer_name    TEXT,
  p_customer_email   TEXT,
  p_payment_method   TEXT,
  p_items_json       JSONB,
  p_table_number     INT,
  p_idempotency_key  TEXT,
  p_site_rate_key    TEXT,
  p_ip_rate_key      TEXT,
  p_rl_window_ms     BIGINT,
  p_rl_site_limit    INT,
  p_rl_ip_limit      INT
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
  -- Constants
  c_max_counter_day  CONSTANT INT     := 99;
  c_max_token_day    CONSTANT INT     := 5000;
  c_min_subtotal     CONSTANT NUMERIC := 1;
  c_max_subtotal     CONSTANT NUMERIC := 200000;
  c_max_retries      CONSTANT INT     := 5;
BEGIN

  -- ── 1. Rate limiting ──────────────────────────────────────────────────────
  SELECT public.check_rate_limit(p_ip_rate_key, p_rl_window_ms, p_rl_ip_limit)
    INTO v_rl_ip_ok;

  SELECT public.check_site_rate_limit_only(p_site_rate_key, p_rl_window_ms, p_rl_site_limit)
    INTO v_rl_site_ok;

  IF NOT COALESCE(v_rl_ip_ok, TRUE) OR NOT COALESCE(v_rl_site_ok, TRUE) THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;

  -- ── 2. Idempotency replay check ───────────────────────────────────────────
  IF p_idempotency_key <> '' THEN
    SELECT ok.order_id, ok.order_number, ok.counter_number, ok.token_number
      INTO v_prior_order_id, v_prior_order_num, v_prior_counter, v_prior_token
    FROM public.order_idempotency_keys ok
    WHERE ok.key = p_idempotency_key
      AND ok.expires_at > now()
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'status',         'replayed',
        'order_id',       v_prior_order_id,
        'order_number',   v_prior_order_num,
        'counter_number', v_prior_counter,
        'token_number',   v_prior_token
      );
    END IF;
  END IF;

  -- ── 3. Site + subscription lookup ─────────────────────────────────────────
  SELECT
    s.id, s.is_live, s.is_open, s.slug, s.name,
    s.qr_mode, s.pending_qr_mode, s.qr_mode_switch_at,
    s.table_count, COALESCE(ss.store_plan, 'qr_menu')
  INTO
    v_site_id, v_is_live, v_is_open, v_site_slug, v_site_name,
    v_qr_mode, v_pending_qr_mode, v_qr_switch_at,
    v_table_count, v_store_plan
  FROM public.sites s
  LEFT JOIN public.site_subscriptions ss ON ss.site_id = s.id
  WHERE s.id = p_site_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'store_not_found');
  END IF;
  IF NOT COALESCE(v_is_live, FALSE) THEN
    RETURN jsonb_build_object('status', 'store_offline');
  END IF;
  IF NOT COALESCE(v_is_open, FALSE) THEN
    RETURN jsonb_build_object('status', 'store_closed');
  END IF;

  -- ── 4. Plan enforcement ───────────────────────────────────────────────────
  IF v_store_plan = 'qr_menu' THEN
    RETURN jsonb_build_object('status', 'plan_no_orders');
  END IF;
  IF p_payment_method = 'no_payment' AND v_store_plan <> 'qr_order' THEN
    RETURN jsonb_build_object('status', 'invalid_payment_method');
  END IF;
  IF p_payment_method IN ('online', 'counter') AND v_store_plan = 'qr_order' THEN
    RETURN jsonb_build_object('status', 'invalid_payment_method');
  END IF;

  -- ── 5. Effective QR mode + pending switch ─────────────────────────────────
  v_effective_mode := COALESCE(v_qr_mode, 'common');
  IF v_pending_qr_mode IS NOT NULL AND v_qr_switch_at IS NOT NULL
     AND v_qr_switch_at <= now() THEN
    v_effective_mode := v_pending_qr_mode;
    UPDATE public.sites SET
      qr_mode           = v_pending_qr_mode,
      pending_qr_mode   = NULL,
      qr_mode_switch_at = NULL
    WHERE id = p_site_id;
  END IF;

  -- ── 6. Table number validation ────────────────────────────────────────────
  v_resolved_table := NULL;
  v_is_takeaway    := FALSE;

  IF p_payment_method = 'no_payment' THEN
    IF p_table_number IS NOT NULL THEN
      IF p_table_number < 1 OR p_table_number > COALESCE(v_table_count, 50) THEN
        RETURN jsonb_build_object('status', 'invalid_table_number');
      END IF;
      v_resolved_table := p_table_number;
    ELSE
      v_is_takeaway := TRUE;
    END IF;
  ELSIF v_effective_mode = 'table' THEN
    IF p_table_number IS NOT NULL THEN
      IF p_table_number < 1 OR p_table_number > COALESCE(v_table_count, 50) THEN
        RETURN jsonb_build_object('status', 'invalid_table_number');
      END IF;
      v_resolved_table := p_table_number;
    ELSE
      v_is_takeaway := TRUE;
    END IF;
  END IF;

  -- ── 7. Server-side price verification ────────────────────────────────────
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items_json)
  LOOP
    v_prod_id      := (v_item->>'id')::UUID;
    v_qty          := (v_item->>'qty')::INT;
    v_variant_size := v_item->>'variantSize';

    SELECT p.name, p.selling_price, p.is_live, p.metadata
      INTO v_prod_name, v_prod_price, v_prod_is_live, v_prod_metadata
    FROM public.products p
    WHERE p.id = v_prod_id AND p.site_id = p_site_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'item_not_found', 'item_id', v_prod_id);
    END IF;
    IF NOT COALESCE(v_prod_is_live, TRUE) THEN
      RETURN jsonb_build_object('status', 'item_unavailable', 'item_name', v_prod_name);
    END IF;

    v_unit_price := v_prod_price::NUMERIC;

    IF v_variant_size IS NOT NULL AND v_variant_size <> '' THEN
      v_variants := v_prod_metadata->'variants';
      v_variant  := NULL;
      IF jsonb_typeof(v_variants) = 'array' THEN
        SELECT elem INTO v_variant
        FROM jsonb_array_elements(v_variants) elem
        WHERE elem->>'size' = v_variant_size
        LIMIT 1;
      END IF;
      IF v_variant IS NULL THEN
        RETURN jsonb_build_object(
          'status', 'variant_not_found', 'item_name', v_prod_name, 'variant', v_variant_size
        );
      END IF;
      v_unit_price := (v_variant->>'price')::NUMERIC;
    END IF;

    IF NOT (v_unit_price >= 0) THEN
      RETURN jsonb_build_object('status', 'invalid_price', 'item_name', v_prod_name);
    END IF;

    v_server_subtotal := v_server_subtotal + v_unit_price * v_qty;

    v_display_items := v_display_items || jsonb_build_array(jsonb_build_object(
      'qty', v_qty, 'name', v_prod_name, 'price', v_unit_price, 'variantSize', v_variant_size
    ));

    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_prod_id, 'product_name', v_prod_name,
      'variant_name', COALESCE(v_variant_size, ''),
      'quantity', v_qty, 'unit_price', v_unit_price,
      'subtotal', ROUND(v_unit_price * v_qty * 100) / 100
    ));
  END LOOP;

  v_server_subtotal := ROUND(v_server_subtotal * 100) / 100;

  IF v_server_subtotal < c_min_subtotal OR v_server_subtotal > c_max_subtotal THEN
    RETURN jsonb_build_object('status', 'invalid_total', 'subtotal', v_server_subtotal);
  END IF;

  -- ── 8. Allocate counter / token ───────────────────────────────────────────
  v_today          := CURRENT_DATE;
  v_counter_number := NULL;
  v_token_number   := NULL;

  IF p_payment_method = 'counter' THEN
    v_seq := public.allocate_counter(p_site_id, v_today);
    IF v_seq > c_max_counter_day THEN
      RETURN jsonb_build_object('status', 'counter_full');
    END IF;
    v_counter_number := 'C' || lpad(v_seq::TEXT, 2, '0');

  ELSIF p_payment_method = 'no_payment' THEN
    IF v_is_takeaway THEN
      v_seq := public.allocate_takeaway_token(p_site_id, v_today);
      IF v_seq <= c_max_token_day THEN
        v_token_number := 'Takeaway ' || v_seq::TEXT;
      END IF;
    END IF;

  ELSIF p_payment_method = 'online' THEN
    v_seq := public.allocate_token(p_site_id, v_today);
    IF v_seq <= c_max_token_day THEN
      v_token_number := v_seq::TEXT;
    END IF;
  END IF;

  -- ── 9. Atomic order creation — retry on order_number collision ─────────────
  v_payment_status := CASE
    WHEN p_payment_method IN ('online', 'no_payment') THEN 'paid'
    ELSE 'pending'
  END;

  v_order_id := NULL;
  WHILE v_order_id IS NULL AND v_retry < c_max_retries LOOP
    v_order_number := ((floor(random() * 9000000) + 1000000)::BIGINT)::TEXT;

    SELECT public.create_order_atomic(
      p_site_id        := p_site_id,
      p_order_number   := v_order_number,
      p_customer_name  := p_customer_name,
      p_customer_email := p_customer_email,
      p_payment_method := p_payment_method,
      p_payment_status := v_payment_status,
      p_status         := 'received',
      p_items_json     := v_display_items,
      p_subtotal       := v_server_subtotal,
      p_total_amount   := v_server_subtotal,
      p_counter_number := v_counter_number,
      p_token_number   := v_token_number,
      p_table_number   := CASE WHEN v_resolved_table IS NOT NULL
                                THEN v_resolved_table::TEXT
                                ELSE NULL END,
      p_order_items    := v_order_items
    ) INTO v_order_id;

    v_retry := v_retry + 1;
  END LOOP;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('status', 'order_creation_failed');
  END IF;

  -- ── 10. Transaction record ────────────────────────────────────────────────
  v_txn_id := 'TXN'
    || extract(epoch from clock_timestamp())::BIGINT::TEXT
    || upper(lpad(to_hex((floor(random() * 65536))::INT), 4, '0'));

  INSERT INTO public.transactions (
    site_id, order_id, txn_id, customer_email,
    amount, currency, status, payment_mode, gateway_ref
  ) VALUES (
    p_site_id, v_order_id, v_txn_id, p_customer_email,
    v_server_subtotal, 'INR',
    CASE WHEN p_payment_method = 'online' THEN 'Success' ELSE 'Pending' END,
    CASE WHEN p_payment_method = 'online' THEN 'UPI' ELSE 'Cash' END,
    CASE WHEN p_payment_method = 'online' THEN 'mock-' || v_order_id::TEXT ELSE NULL END
  );

  -- ── 11. Idempotency key registration ──────────────────────────────────────
  IF p_idempotency_key <> '' THEN
    INSERT INTO public.order_idempotency_keys
      (key, site_id, order_id, order_number, counter_number, token_number, expires_at)
    VALUES
      (p_idempotency_key, p_site_id, v_order_id, v_order_number,
       v_counter_number, v_token_number, now() + INTERVAL '24 hours')
    ON CONFLICT (key) DO NOTHING;
  END IF;

  -- ── 12. Bump site rate limit (success path only) ─────────────────────────
  PERFORM public.bump_site_rate_limit(p_site_rate_key, p_rl_window_ms);

  -- ── 13. Return success payload ────────────────────────────────────────────
  RETURN jsonb_build_object(
    'status',         'ok',
    'order_id',       v_order_id,
    'order_number',   v_order_number,
    'counter_number', v_counter_number,
    'token_number',   v_token_number,
    'subtotal',       v_server_subtotal,
    'site_name',      v_site_name,
    'site_slug',      v_site_slug,
    'verified_items', v_display_items
  );

END;
$$;
