-- ============================================================
-- Migration: Firebase Third-Party Auth — Role Hook + RLS
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. Custom Access Token Hook
--    Firebase JWTs don't carry a Supabase 'role' claim.
--    This hook fires when Supabase issues a session token
--    and stamps 'authenticated' onto every Firebase login.
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
BEGIN
  claims := event -> 'claims';

  -- Ensure the 'authenticated' role is always set
  IF (claims ->> 'role') IS NULL OR (claims ->> 'role') = 'anon' THEN
    claims := claims || '{"role": "authenticated"}';
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Only supabase_auth_admin may call this hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;


-- ──────────────────────────────────────────────────────────
-- 2. profiles table RLS
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);


-- ──────────────────────────────────────────────────────────
-- 3. user_subscriptions table RLS
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subs_select_own" ON public.user_subscriptions;
DROP POLICY IF EXISTS "subs_insert_own" ON public.user_subscriptions;
DROP POLICY IF EXISTS "subs_update_own" ON public.user_subscriptions;

CREATE POLICY "subs_select_own"
  ON public.user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "subs_insert_own"
  ON public.user_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "subs_update_own"
  ON public.user_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 4. sites table RLS
--    Public read (shop pages visible to anyone)
--    Writes restricted to owner
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sites_public_read"  ON public.sites;
DROP POLICY IF EXISTS "sites_insert_own"   ON public.sites;
DROP POLICY IF EXISTS "sites_update_own"   ON public.sites;
DROP POLICY IF EXISTS "sites_delete_own"   ON public.sites;

CREATE POLICY "sites_public_read"
  ON public.sites FOR SELECT
  USING (true);

CREATE POLICY "sites_insert_own"
  ON public.sites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sites_update_own"
  ON public.sites FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "sites_delete_own"
  ON public.sites FOR DELETE
  USING (auth.uid() = user_id);


-- ──────────────────────────────────────────────────────────
-- 5. products table RLS
--    Public read. Writes only via the owning site.
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_public_read"   ON public.products;
DROP POLICY IF EXISTS "products_insert_owner"  ON public.products;
DROP POLICY IF EXISTS "products_update_owner"  ON public.products;
DROP POLICY IF EXISTS "products_delete_owner"  ON public.products;

CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (true);

CREATE POLICY "products_insert_owner"
  ON public.products FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites
      WHERE sites.id = products.site_id
        AND sites.user_id = auth.uid()
    )
  );

CREATE POLICY "products_update_owner"
  ON public.products FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.sites
      WHERE sites.id = products.site_id
        AND sites.user_id = auth.uid()
    )
  );

CREATE POLICY "products_delete_owner"
  ON public.products FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.sites
      WHERE sites.id = products.site_id
        AND sites.user_id = auth.uid()
    )
  );


-- ──────────────────────────────────────────────────────────
-- AFTER RUNNING THIS SQL:
--
-- Go to Supabase Dashboard →
--   Authentication → Hooks → Add hook
--   Event:    "Customize Access Token (JWT) Claims"
--   Function: public.custom_access_token_hook
--   → Save
--
-- Without enabling the hook in the dashboard, the
-- function above will not be called on login.
-- ──────────────────────────────────────────────────────────
