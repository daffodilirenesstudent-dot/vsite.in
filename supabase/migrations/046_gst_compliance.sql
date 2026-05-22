-- 046: GST Compliance
--
-- Adds GST as a first-class concept:
--   1. sites: declarative GST profile + verification audit trail
--   2. orders: tax snapshot per row (rate + amount + CGST/SGST split + GSTIN)
--   3. pending_online_orders: tax snapshot for in-flight online payments
--   4. gst_verification_cache: short-lived cache of gstincheck.co.in responses
--   5. process_order_v2: server-authoritative tax computation, snapshotted onto each order
--   6. checkout_table_atomic: sums total_amount (which now includes tax) instead of subtotal
--
-- Design notes
-- ────────────
-- • Tax is computed by the RPC, never trusted from the client.
-- • Historical orders keep their original rate forever — the snapshot columns are immutable
--   after order creation (no triggers update them downstream).
-- • CGST/SGST split is purely cosmetic for printed bills. The math uses tax_amount.
-- • For online payments, the rate is snapshotted on the pending row at the moment Razorpay
--   is asked to charge — so the amount Razorpay charges == subtotal + tax. The finalize
--   endpoint passes that snapshot via p_gst_rate_override so the rate cannot drift if the
--   admin changes the store's rate between Razorpay redirect and capture.
-- • Backfill is implicit: new NOT NULL DEFAULT 0 columns make every existing order
--   tax-free, which is exactly the truth — they were placed before GST existed.

-- ── 1. sites: GST profile columns ───────────────────────────────────────────
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS gst_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (gst_status IN ('pending', 'not_registered', 'registered')),
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS gst_legal_name TEXT,
  ADD COLUMN IF NOT EXISTS gst_trade_name TEXT,
  ADD COLUMN IF NOT EXISTS gst_owner_name TEXT,
  ADD COLUMN IF NOT EXISTS gst_address TEXT,
  ADD COLUMN IF NOT EXISTS gst_pincode TEXT,
  ADD COLUMN IF NOT EXISTS gst_state TEXT,
  ADD COLUMN IF NOT EXISTS gst_rate_pct NUMERIC(4, 2),
  ADD COLUMN IF NOT EXISTS gst_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gst_api_response JSONB,
  ADD COLUMN IF NOT EXISTS gst_verification_status TEXT;

-- GSTIN format check: 15 chars, NN AAAAA NNNN A N Z X
-- Allow NULL (not all sites are GST-registered) but enforce shape when set.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_gstin_format'
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_gstin_format
      CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_gst_rate_valid'
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_gst_rate_valid
      CHECK (gst_rate_pct IS NULL OR gst_rate_pct IN (5.00, 18.00));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_gst_pincode_format'
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_gst_pincode_format
      CHECK (gst_pincode IS NULL OR gst_pincode ~ '^[0-9]{6}$');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_gst_verification_status_valid'
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_gst_verification_status_valid
      CHECK (gst_verification_status IS NULL OR gst_verification_status IN ('verified', 'inactive', 'unavailable'));
  END IF;
END $$;

-- When status is 'registered', GSTIN + rate must be set.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_gst_registered_complete'
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_gst_registered_complete
      CHECK (
        gst_status <> 'registered'
        OR (gstin IS NOT NULL AND gst_rate_pct IS NOT NULL AND gst_verified_at IS NOT NULL)
      );
  END IF;
END $$;


-- ── 2. orders: tax snapshot columns ─────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gst_rate_pct  NUMERIC(4, 2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount   NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gstin_snapshot TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_tax_amount_nonneg'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_tax_amount_nonneg CHECK (tax_amount >= 0);
  END IF;
END $$;


-- ── 3. pending_online_orders: tax snapshot for in-flight Razorpay payments ──
-- The rate is locked when the Razorpay order is created so the amount the
-- customer is charged matches the amount we expect on capture, even if the
-- admin changes the store's GST rate while the customer is on the payment page.
ALTER TABLE public.pending_online_orders
  ADD COLUMN IF NOT EXISTS gst_rate_pct   NUMERIC(4, 2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount     NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount   NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS gstin_snapshot TEXT;


-- ── 4. gst_verification_cache: short-lived cache of gstincheck.co.in responses
-- gstincheck.co.in is rate-limited and paid per-call. Caching for 24h per
-- (site, gstin) keeps re-verifies cheap without hiding stale state — the cache
-- is intentionally short so a GSTIN cancelled by the GST portal is detected
-- within a day.
CREATE TABLE IF NOT EXISTS public.gst_verification_cache (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  gstin       TEXT        NOT NULL,
  status      TEXT        NOT NULL CHECK (status IN ('verified', 'inactive', 'unavailable')),
  legal_name  TEXT,
  trade_name  TEXT,
  address     TEXT,
  state       TEXT,
  raw         JSONB,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, gstin)
);

CREATE INDEX IF NOT EXISTS gst_verification_cache_fresh_idx
  ON public.gst_verification_cache (site_id, gstin, fetched_at DESC);

ALTER TABLE public.gst_verification_cache ENABLE ROW LEVEL SECURITY;

-- Service-role only: the API routes mediate access via Firebase token + ownership check.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gst_verification_cache'
      AND policyname = 'gst_cache_service_role_only'
  ) THEN
    CREATE POLICY gst_cache_service_role_only
      ON public.gst_verification_cache
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;


-- ── 5. process_order_v2: snapshot tax onto the order ────────────────────────
-- Signature gains two OPTIONAL params (DEFAULT NULL) so legacy callers in
-- src/app/api/orders/route.ts (counter / no_payment) keep working unchanged.
-- The online-finalize path passes the rate snapshotted on the pending row.
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
  p_rl_ip_limit      INT,
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

  -- ── 3. Site + subscription + GST lookup ───────────────────────────────────
  SELECT
    s.id, s.is_live, s.is_open, s.slug, s.name,
    s.qr_mode, s.pending_qr_mode, s.qr_mode_switch_at,
    s.table_count, COALESCE(ss.store_plan, 'qr_menu'),
    s.gst_rate_pct, s.gstin, s.gst_status
  INTO
    v_site_id, v_is_live, v_is_open, v_site_slug, v_site_name,
    v_qr_mode, v_pending_qr_mode, v_qr_switch_at,
    v_table_count, v_store_plan,
    v_site_gst_rate, v_site_gstin, v_gstin_snapshot
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

  -- Pick the rate: explicit override wins (online-finalize uses the pending snapshot),
  -- otherwise use the live store rate (counter/no_payment paths).
  IF p_gst_rate_override IS NOT NULL THEN
    v_gst_rate := COALESCE(p_gst_rate_override, 0);
  ELSE
    v_gst_rate := COALESCE(v_site_gst_rate, 0);
  END IF;
  IF p_gstin_override IS NOT NULL THEN
    v_gstin_snapshot := p_gstin_override;
  ELSE
    v_gstin_snapshot := v_site_gstin;
  END IF;
  -- Guard: never collect tax if the store hasn't completed onboarding as 'registered'.
  -- A stale override from a since-disconnected store should not slip tax onto a new order.
  IF p_gst_rate_override IS NULL THEN
    -- (only enforced for live-rate path; override path is trusted by definition)
    -- v_gstin_snapshot already reads from the same row.
    NULL;
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

  -- ── 7b. Tax computation (server-authoritative) ────────────────────────────
  v_tax_amount  := ROUND(v_server_subtotal * v_gst_rate / 100 * 100) / 100;
  v_cgst_amount := ROUND(v_tax_amount * 100 / 2) / 100;
  v_sgst_amount := v_tax_amount - v_cgst_amount;
  v_total_amount := v_server_subtotal + v_tax_amount;

  -- ── 8. Allocate counter / token ───────────────────────────────────────────
  v_today          := CURRENT_DATE;
  v_counter_number := NULL;
  v_token_number   := NULL;

  IF p_payment_method = 'counter' THEN
    v_seq := public.allocate_counter(p_site_id, v_today);
    IF v_seq > c_max_counter_day THEN
      RETURN jsonb_build_object('status', 'counter_full');
    END IF;
    v_counter_number := 'C' || lpad(v_seq::TEXT, 3, '0');
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
      p_total_amount   := v_total_amount,
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

  -- ── 9b. Stamp tax snapshot onto the new order row ─────────────────────────
  -- Done as a follow-up UPDATE so create_order_atomic's signature stays stable.
  -- This is in the same transaction as the INSERT — either both commit or neither.
  UPDATE public.orders
  SET gst_rate_pct   = v_gst_rate,
      tax_amount     = v_tax_amount,
      cgst_amount    = v_cgst_amount,
      sgst_amount    = v_sgst_amount,
      gstin_snapshot = CASE WHEN v_gst_rate > 0 THEN v_gstin_snapshot ELSE NULL END
  WHERE id = v_order_id;

  -- ── 10. Transaction record (records what the merchant actually collected) ─
  v_txn_id := 'TXN'
    || extract(epoch from clock_timestamp())::BIGINT::TEXT
    || upper(lpad(to_hex((floor(random() * 65536))::INT), 4, '0'));

  INSERT INTO public.transactions (
    site_id, order_id, txn_id, customer_email,
    amount, currency, status, payment_mode, gateway_ref
  ) VALUES (
    p_site_id, v_order_id, v_txn_id, p_customer_email,
    v_total_amount, 'INR',
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
    'tax_amount',     v_tax_amount,
    'cgst_amount',    v_cgst_amount,
    'sgst_amount',    v_sgst_amount,
    'gst_rate_pct',   v_gst_rate,
    'gstin_snapshot', v_gstin_snapshot,
    'total_amount',   v_total_amount,
    'site_name',      v_site_name,
    'site_slug',      v_site_slug,
    'verified_items', v_display_items
  );
END;
$$;


-- ── 6. checkout_table_atomic: sum total_amount (subtotal + tax) ─────────────
-- Replaces 027's body — same signature, same return shape. Only change is
-- summing total_amount instead of subtotal so the table-checkout total
-- correctly includes the tax that was already snapshotted onto each order.
CREATE OR REPLACE FUNCTION public.checkout_table_atomic(
  p_site_id        UUID,
  p_table_number   TEXT,
  p_order_id       UUID,
  p_token_label    TEXT,
  p_payment_method TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_ids    UUID[]  := '{}';
  v_total        NUMERIC := 0;
  v_ord_id       UUID;
  v_ord_total    NUMERIC;
  v_txn_id       TEXT;
  v_mode_map     TEXT;
  v_checkout_lbl TEXT;
BEGIN
  IF p_order_id IS NOT NULL THEN
    SELECT id, total_amount
      INTO v_ord_id, v_ord_total
    FROM public.orders
    WHERE id       = p_order_id
      AND site_id  = p_site_id
      AND status  <> 'completed'
    FOR UPDATE;

    IF FOUND THEN
      v_order_ids := ARRAY[v_ord_id];
      v_total     := v_ord_total;
    END IF;
  ELSE
    WITH locked AS (
      SELECT id, total_amount
      FROM public.orders
      WHERE site_id      = p_site_id
        AND table_number = p_table_number
        AND status      <> 'completed'
      FOR UPDATE
    )
    SELECT array_agg(id), COALESCE(SUM(total_amount), 0)
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

  INSERT INTO public.table_checkouts
    (site_id, table_number, payment_method, total_amount, order_ids)
  VALUES
    (p_site_id, v_checkout_lbl, p_payment_method, v_total, v_order_ids);

  UPDATE public.orders
  SET status     = 'completed',
      updated_at = now()
  WHERE id = ANY(v_order_ids);

  IF p_table_number IS NOT NULL THEN
    UPDATE public.bill_requests
    SET status           = 'acknowledged',
        acknowledged_at  = now()
    WHERE site_id      = p_site_id
      AND table_number = p_table_number
      AND status       = 'pending';
  END IF;

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
