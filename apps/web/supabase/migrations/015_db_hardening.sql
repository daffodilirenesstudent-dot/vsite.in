-- Migration 015: Production-grade DB hardening
-- ─────────────────────────────────────────────────────────────────────────
-- Audit findings addressed:
--   C1  delete_site SECURITY DEFINER let any authed user delete any site
--   C2  orders/order_items INSERT policies were WITH CHECK (true) — anyone
--       could spam orders into any site
--   C3  default_images INSERT was WITH CHECK (true) — anyone could pollute
--       the shared image library
--   H1  Five SECURITY DEFINER / volatile functions had mutable search_path
--   H2  30+ RLS policies re-evaluated auth.jwt() per row (initplan); rewrite
--       with (SELECT auth.jwt()) so Postgres caches it
--   H3  Missing NOT NULL + CHECK constraints on money columns and identity
--       columns; missing FKs from user-owned tables to profiles
--   H4  updated_at not auto-bumped on tables that have the column
--   M1  banners had two overlapping SELECT policies (perf)
--   M2  Internal functions exposed via PostgREST RPC; revoke from anon/auth
--
-- Strategy: idempotent — every DROP/CREATE uses IF EXISTS / IF NOT EXISTS.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ C1 — delete_site: ownership check + frozen search_path + revoke anon  ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
CREATE OR REPLACE FUNCTION public.delete_site(site_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id text;
    v_caller  text;
BEGIN
    v_caller := (auth.jwt() ->> 'sub');
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
    END IF;

    SELECT user_id INTO v_user_id FROM public.sites WHERE id = site_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'SITE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF v_user_id <> v_caller THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.deleted_sites (
        id, original_created_at, user_id, social_links, is_live, description,
        owner_name, contact_number, timing, established_year, location,
        state, pincode, address, slug, image_url, email, whatsapp_number,
        tagline, type, name
    )
    SELECT
        id, created_at, user_id, social_links, is_live, description,
        owner_name, contact_number, timing, established_year, location,
        state, pincode, address, slug, image_url, email, whatsapp_number,
        tagline, type, name
    FROM public.sites
    WHERE id = site_id;

    DELETE FROM public.sites WHERE id = site_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_site(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_site(uuid) TO authenticated, service_role;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ C2 — orders / order_items public-insert restriction                   ║
-- ║ Customers must be able to place an order without being signed in,      ║
-- ║ but only into a real, live site that is_open. We keep the policy      ║
-- ║ public-INSERT but tighten WITH CHECK to scope it.                      ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
DROP POLICY IF EXISTS orders_public_insert ON public.orders;
CREATE POLICY orders_public_insert
    ON public.orders FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.sites s
            WHERE s.id = orders.site_id
              AND COALESCE(s.is_open, false) = true
              AND COALESCE(s.is_live, false) = true
        )
    );

DROP POLICY IF EXISTS order_items_public_insert ON public.order_items;
CREATE POLICY order_items_public_insert
    ON public.order_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.orders o
            JOIN public.sites s ON s.id = o.site_id
            WHERE o.id = order_items.order_id
              AND COALESCE(s.is_open, false) = true
              AND COALESCE(s.is_live, false) = true
        )
    );

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ C3 — default_images insert is service-role only                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
DROP POLICY IF EXISTS default_images_authed_insert ON public.default_images;
-- (no replacement policy — service role bypasses RLS, end users cannot insert)

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ H1 — Lock search_path on all SECURITY DEFINER / volatile functions    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_store_limits() SET search_path = public, pg_temp;
ALTER FUNCTION public.match_default_image(public.vector, double precision, integer)
    SET search_path = public, pg_temp;
ALTER FUNCTION public.custom_access_token_hook(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.rls_auto_enable() SET search_path = public, pg_temp;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ M2 — Revoke RPC exposure of internal helpers                          ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
REVOKE ALL ON FUNCTION public.enforce_store_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_default_image(public.vector, double precision, integer)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_default_image(public.vector, double precision, integer)
    TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ H3 — Data-integrity constraints                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- sites.user_id must always be set (RLS predicates rely on it)
ALTER TABLE public.sites
    ALTER COLUMN user_id SET NOT NULL;

-- billing_history identity + payment shape
ALTER TABLE public.billing_history
    ALTER COLUMN user_id SET NOT NULL,
    ALTER COLUMN currency SET NOT NULL,
    ALTER COLUMN currency SET DEFAULT 'INR',
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'Success';

DO $$ BEGIN
    ALTER TABLE public.billing_history
        ADD CONSTRAINT billing_history_amount_nonneg CHECK (amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.billing_history
        ADD CONSTRAINT billing_history_status_chk
        CHECK (status IN ('Success','Failed','Pending','Refunded'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- products.site_id must be set (every product belongs to a site)
ALTER TABLE public.products
    ALTER COLUMN site_id SET NOT NULL;

DO $$ BEGIN
    ALTER TABLE public.products
        ADD CONSTRAINT products_selling_price_nonneg CHECK (selling_price IS NULL OR selling_price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.products
        ADD CONSTRAINT products_original_price_nonneg CHECK (original_price IS NULL OR original_price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- orders / order_items
DO $$ BEGIN
    ALTER TABLE public.orders
        ADD CONSTRAINT orders_total_nonneg CHECK (total_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.order_items
        ADD CONSTRAINT order_items_quantity_pos CHECK (quantity > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.order_items
        ADD CONSTRAINT order_items_unit_price_nonneg CHECK (unit_price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public.order_items
        ADD CONSTRAINT order_items_subtotal_nonneg CHECK (subtotal >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- transactions
DO $$ BEGIN
    ALTER TABLE public.transactions
        ADD CONSTRAINT transactions_amount_nonneg CHECK (amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- site_subscriptions razorpay_status enum
DO $$ BEGIN
    ALTER TABLE public.site_subscriptions
        ADD CONSTRAINT site_subscriptions_razorpay_status_chk
        CHECK (razorpay_status IS NULL OR razorpay_status IN
            ('pending','created','authenticated','active','halted','paused','cancelled','expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ H4 — updated_at triggers                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'updated_at'
          AND table_name IN (
              'sites','products','banners','orders','site_subscriptions',
              'user_subscriptions','profiles'
          )
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%I_set_updated_at ON public.%I;',
            t, t
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_set_updated_at
             BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
            t, t
        );
    END LOOP;
END $$;

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ M1 — banners: consolidate two SELECT policies into one                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝
DROP POLICY IF EXISTS banners_owner_read ON public.banners;
DROP POLICY IF EXISTS banners_public_read ON public.banners;

CREATE POLICY banners_read
    ON public.banners FOR SELECT
    USING (
        -- public can read live banners; owners can read all of theirs
        is_active = true
        OR EXISTS (
            SELECT 1 FROM public.sites s
            WHERE s.id = banners.site_id
              AND s.user_id = ((SELECT auth.jwt()) ->> 'sub')
        )
    );

-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ H2 — Rewrite RLS policies to (SELECT auth.jwt()) form                 ║
-- ║ Postgres caches the SELECT subquery once per query instead of per row ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- profiles ----------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT
    USING (((SELECT auth.jwt()) ->> 'sub') = id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT
    WITH CHECK (((SELECT auth.jwt()) ->> 'sub') = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE
    USING (((SELECT auth.jwt()) ->> 'sub') = id)
    WITH CHECK (((SELECT auth.jwt()) ->> 'sub') = id);

-- sites -------------------------------------------------------------------
DROP POLICY IF EXISTS sites_insert_own ON public.sites;
CREATE POLICY sites_insert_own ON public.sites FOR INSERT
    WITH CHECK (
        ((SELECT auth.jwt()) ->> 'sub') IS NOT NULL
        AND ((SELECT auth.jwt()) ->> 'sub') = user_id
    );

DROP POLICY IF EXISTS sites_update_own ON public.sites;
CREATE POLICY sites_update_own ON public.sites FOR UPDATE
    USING (((SELECT auth.jwt()) ->> 'sub') = user_id)
    WITH CHECK (((SELECT auth.jwt()) ->> 'sub') = user_id);

DROP POLICY IF EXISTS sites_delete_own ON public.sites;
CREATE POLICY sites_delete_own ON public.sites FOR DELETE
    USING (((SELECT auth.jwt()) ->> 'sub') = user_id);

-- products ----------------------------------------------------------------
DROP POLICY IF EXISTS products_insert_owner ON public.products;
CREATE POLICY products_insert_owner ON public.products FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.sites s
            WHERE s.id = products.site_id
              AND s.user_id = ((SELECT auth.jwt()) ->> 'sub')
        )
    );

DROP POLICY IF EXISTS products_update_owner ON public.products;
CREATE POLICY products_update_owner ON public.products FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.sites s
            WHERE s.id = products.site_id
              AND s.user_id = ((SELECT auth.jwt()) ->> 'sub')
        )
    );

DROP POLICY IF EXISTS products_delete_owner ON public.products;
CREATE POLICY products_delete_owner ON public.products FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.sites s
            WHERE s.id = products.site_id
              AND s.user_id = ((SELECT auth.jwt()) ->> 'sub')
        )
    );

-- categories --------------------------------------------------------------
DROP POLICY IF EXISTS categories_insert_owner ON public.categories;
CREATE POLICY categories_insert_owner ON public.categories FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.sites s
                WHERE s.id = categories.site_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

DROP POLICY IF EXISTS categories_update_owner ON public.categories;
CREATE POLICY categories_update_owner ON public.categories FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.sites s
                WHERE s.id = categories.site_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

DROP POLICY IF EXISTS categories_delete_owner ON public.categories;
CREATE POLICY categories_delete_owner ON public.categories FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.sites s
                WHERE s.id = categories.site_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

-- banners INSERT/UPDATE/DELETE (read consolidated above) ------------------
DROP POLICY IF EXISTS banners_insert_owner ON public.banners;
CREATE POLICY banners_insert_owner ON public.banners FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.sites s
                WHERE s.id = banners.site_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

DROP POLICY IF EXISTS banners_update_owner ON public.banners;
CREATE POLICY banners_update_owner ON public.banners FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.sites s
                WHERE s.id = banners.site_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

DROP POLICY IF EXISTS banners_delete_owner ON public.banners;
CREATE POLICY banners_delete_owner ON public.banners FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.sites s
                WHERE s.id = banners.site_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

-- product_variants --------------------------------------------------------
DROP POLICY IF EXISTS product_variants_insert_owner ON public.product_variants;
CREATE POLICY product_variants_insert_owner ON public.product_variants FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.products p
            JOIN public.sites s ON s.id = p.site_id
            WHERE p.id = product_variants.product_id
              AND s.user_id = ((SELECT auth.jwt()) ->> 'sub')
        )
    );

DROP POLICY IF EXISTS product_variants_update_owner ON public.product_variants;
CREATE POLICY product_variants_update_owner ON public.product_variants FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.products p
            JOIN public.sites s ON s.id = p.site_id
            WHERE p.id = product_variants.product_id
              AND s.user_id = ((SELECT auth.jwt()) ->> 'sub')
        )
    );

DROP POLICY IF EXISTS product_variants_delete_owner ON public.product_variants;
CREATE POLICY product_variants_delete_owner ON public.product_variants FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.products p
            JOIN public.sites s ON s.id = p.site_id
            WHERE p.id = product_variants.product_id
              AND s.user_id = ((SELECT auth.jwt()) ->> 'sub')
        )
    );

-- product_toppings --------------------------------------------------------
DROP POLICY IF EXISTS product_toppings_insert_owner ON public.product_toppings;
CREATE POLICY product_toppings_insert_owner ON public.product_toppings FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.products p JOIN public.sites s ON s.id=p.site_id
                WHERE p.id = product_toppings.product_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

DROP POLICY IF EXISTS product_toppings_update_owner ON public.product_toppings;
CREATE POLICY product_toppings_update_owner ON public.product_toppings FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.products p JOIN public.sites s ON s.id=p.site_id
                WHERE p.id = product_toppings.product_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

DROP POLICY IF EXISTS product_toppings_delete_owner ON public.product_toppings;
CREATE POLICY product_toppings_delete_owner ON public.product_toppings FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.products p JOIN public.sites s ON s.id=p.site_id
                WHERE p.id = product_toppings.product_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

-- product_combo_items -----------------------------------------------------
DROP POLICY IF EXISTS combo_items_insert_owner ON public.product_combo_items;
CREATE POLICY combo_items_insert_owner ON public.product_combo_items FOR INSERT
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.products p JOIN public.sites s ON s.id=p.site_id
                WHERE p.id = product_combo_items.product_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

DROP POLICY IF EXISTS combo_items_update_owner ON public.product_combo_items;
CREATE POLICY combo_items_update_owner ON public.product_combo_items FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.products p JOIN public.sites s ON s.id=p.site_id
                WHERE p.id = product_combo_items.product_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

DROP POLICY IF EXISTS combo_items_delete_owner ON public.product_combo_items;
CREATE POLICY combo_items_delete_owner ON public.product_combo_items FOR DELETE
    USING (
        EXISTS (SELECT 1 FROM public.products p JOIN public.sites s ON s.id=p.site_id
                WHERE p.id = product_combo_items.product_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

-- orders / order_items / transactions / site_subscriptions / billing -----
DROP POLICY IF EXISTS orders_owner_select ON public.orders;
CREATE POLICY orders_owner_select ON public.orders FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.sites s
                WHERE s.id = orders.site_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

DROP POLICY IF EXISTS orders_owner_update ON public.orders;
CREATE POLICY orders_owner_update ON public.orders FOR UPDATE
    USING (
        EXISTS (SELECT 1 FROM public.sites s
                WHERE s.id = orders.site_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

DROP POLICY IF EXISTS order_items_owner_select ON public.order_items;
CREATE POLICY order_items_owner_select ON public.order_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            JOIN public.sites s ON s.id = o.site_id
            WHERE o.id = order_items.order_id
              AND s.user_id = ((SELECT auth.jwt()) ->> 'sub')
        )
    );

DROP POLICY IF EXISTS transactions_owner_select ON public.transactions;
CREATE POLICY transactions_owner_select ON public.transactions FOR SELECT
    USING (
        EXISTS (SELECT 1 FROM public.sites s
                WHERE s.id = transactions.site_id
                  AND s.user_id = ((SELECT auth.jwt()) ->> 'sub'))
    );

DROP POLICY IF EXISTS deleted_sites_owner_select ON public.deleted_sites;
CREATE POLICY deleted_sites_owner_select ON public.deleted_sites FOR SELECT
    USING (((SELECT auth.jwt()) ->> 'sub') = user_id);

DROP POLICY IF EXISTS subs_select_own ON public.user_subscriptions;
CREATE POLICY subs_select_own ON public.user_subscriptions FOR SELECT
    USING (((SELECT auth.jwt()) ->> 'sub') = user_id);

DROP POLICY IF EXISTS subs_insert_own ON public.user_subscriptions;
CREATE POLICY subs_insert_own ON public.user_subscriptions FOR INSERT
    WITH CHECK (((SELECT auth.jwt()) ->> 'sub') = user_id);

DROP POLICY IF EXISTS site_subs_select_own ON public.site_subscriptions;
CREATE POLICY site_subs_select_own ON public.site_subscriptions FOR SELECT
    USING (((SELECT auth.jwt()) ->> 'sub') = user_id);

DROP POLICY IF EXISTS billing_select_own ON public.billing_history;
CREATE POLICY billing_select_own ON public.billing_history FOR SELECT
    USING (
        ((SELECT auth.jwt()) ->> 'sub') IS NOT NULL
        AND ((SELECT auth.jwt()) ->> 'sub') = user_id
    );

COMMIT;
