-- ============================================================
-- Migration: Firebase UID — Change user ID columns to TEXT
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- 1. Drop ALL RLS policies on affected tables first
--    (Postgres blocks ALTER COLUMN TYPE while policies exist)
-- ──────────────────────────────────────────────────────────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'user_subscriptions', 'sites', 'products', 'billing_history', 'deleted_sites')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END;
$$;


-- ──────────────────────────────────────────────────────────
-- 2. Drop ALL foreign keys that reference auth.users(id)
--    Firebase UIDs are TEXT and won't exist in auth.users
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_user_id_fkey;

ALTER TABLE public.sites
  DROP CONSTRAINT IF EXISTS sites_user_id_fkey;

ALTER TABLE public.billing_history
  DROP CONSTRAINT IF EXISTS billing_history_user_id_fkey;


-- ──────────────────────────────────────────────────────────
-- 3. Change UUID → TEXT for all user identity columns
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ALTER COLUMN id TYPE text USING id::text;

ALTER TABLE public.user_subscriptions
  ALTER COLUMN user_id TYPE text USING user_id::text;

ALTER TABLE public.sites
  ALTER COLUMN user_id TYPE text USING user_id::text;

ALTER TABLE public.billing_history
  ALTER COLUMN user_id TYPE text USING user_id::text;

-- deleted_sites has no FK but also stores user_id
ALTER TABLE public.deleted_sites
  ALTER COLUMN user_id TYPE text USING user_id::text;


-- ──────────────────────────────────────────────────────────
-- 4. Re-create RLS using auth.jwt()->>'sub'
--    auth.uid() would fail — it casts 'sub' to UUID,
--    but Firebase UIDs are plain strings like "vBd8XyZ123..."
-- ──────────────────────────────────────────────────────────

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING ((auth.jwt() ->> 'sub') IS NOT NULL
     AND (auth.jwt() ->> 'sub') = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'sub') IS NOT NULL
          AND (auth.jwt() ->> 'sub') = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING ((auth.jwt() ->> 'sub') IS NOT NULL
     AND (auth.jwt() ->> 'sub') = id);


-- user_subscriptions
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subs_select_own"
  ON public.user_subscriptions FOR SELECT
  USING ((auth.jwt() ->> 'sub') IS NOT NULL
     AND (auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "subs_insert_own"
  ON public.user_subscriptions FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'sub') IS NOT NULL
          AND (auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "subs_update_own"
  ON public.user_subscriptions FOR UPDATE
  USING ((auth.jwt() ->> 'sub') IS NOT NULL
     AND (auth.jwt() ->> 'sub') = user_id);


-- sites (public read, owner writes)
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sites_public_read"
  ON public.sites FOR SELECT
  USING (true);

CREATE POLICY "sites_insert_own"
  ON public.sites FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'sub') IS NOT NULL
          AND (auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "sites_update_own"
  ON public.sites FOR UPDATE
  USING ((auth.jwt() ->> 'sub') IS NOT NULL
     AND (auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "sites_delete_own"
  ON public.sites FOR DELETE
  USING ((auth.jwt() ->> 'sub') IS NOT NULL
     AND (auth.jwt() ->> 'sub') = user_id);


-- products (public read, owner writes via sites)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (true);

CREATE POLICY "products_insert_owner"
  ON public.products FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'sub') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.sites
      WHERE sites.id = products.site_id
        AND sites.user_id = (auth.jwt() ->> 'sub')
    )
  );

CREATE POLICY "products_update_owner"
  ON public.products FOR UPDATE
  USING (
    (auth.jwt() ->> 'sub') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.sites
      WHERE sites.id = products.site_id
        AND sites.user_id = (auth.jwt() ->> 'sub')
    )
  );

CREATE POLICY "products_delete_owner"
  ON public.products FOR DELETE
  USING (
    (auth.jwt() ->> 'sub') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.sites
      WHERE sites.id = products.site_id
        AND sites.user_id = (auth.jwt() ->> 'sub')
    )
  );


-- billing_history (owner only)
ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_select_own"
  ON public.billing_history FOR SELECT
  USING ((auth.jwt() ->> 'sub') IS NOT NULL
     AND (auth.jwt() ->> 'sub') = user_id);

CREATE POLICY "billing_insert_own"
  ON public.billing_history FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'sub') IS NOT NULL
          AND (auth.jwt() ->> 'sub') = user_id);
