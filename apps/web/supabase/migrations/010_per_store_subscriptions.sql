-- ============================================================
-- Migration: Per-store subscriptions
--
-- Each site now has its own plan and expiry instead of a single
-- account-level subscription. The user_subscriptions table is
-- kept intact (trial_ends_at still useful as fallback) but
-- store_plan / store_expires_at are now authoritative on the
-- site_subscriptions table.
--
-- Security model mirrors migration 009:
--   - Clients can SELECT their own rows (read plan status)
--   - No client INSERT / UPDATE — all writes are server-side
--     via supabaseServer (service role bypasses RLS)
-- ============================================================

-- ── 1. Create site_subscriptions table ──────────────────────
CREATE TABLE IF NOT EXISTS public.site_subscriptions (
  site_id       UUID        PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  user_id       TEXT        NOT NULL,
  store_plan    TEXT        NOT NULL DEFAULT 'qr_menu',
  store_expires_at TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS site_subscriptions_user_id_idx
  ON public.site_subscriptions (user_id);

-- ── 2. RLS — read-only for the owning user ───────────────────
ALTER TABLE public.site_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_subs_select_own"
  ON public.site_subscriptions FOR SELECT
  USING (
    (auth.jwt() ->> 'sub') IS NOT NULL
    AND (auth.jwt() ->> 'sub') = user_id
  );

-- No INSERT / UPDATE / DELETE policies for client.
-- All writes go through /api/subscription/* and /api/onboarding/*
-- which use the service-role key (bypasses RLS entirely).
