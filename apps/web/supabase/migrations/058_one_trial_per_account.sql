-- 058_one_trial_per_account.sql — one free trial per account (one-trial).
--
-- Owner decision 2026-09-25: an account (one phone number) has at most 2
-- stores; the first gets the 7-day trial, once per account for good; a later
-- store goes live only after it is paid for.
--
-- ─── WHY THE TRIAL MOVES ────────────────────────────────────────────────────
-- A store's trial was `sites.created_at + 7 days`, computed in five places.
-- Owners can UPDATE their own `sites` row from the browser (sites_update_own,
-- table-wide UPDATE grant), created_at included — so a trial could be made to
-- never end. And nothing recorded that an account had used its trial, so a new
-- store (or a deleted-and-recreated one) always brought a fresh week.
--
-- The trial window now lives on site_subscriptions.trial_ends_at. Browsers can
-- only SELECT that table (010: no client INSERT/UPDATE/DELETE policies), so it
-- cannot be rewritten. trial_claims records, per account, that its trial was
-- used; it has no foreign key to sites so the record outlives a deleted store.
-- It is keyed by account (Firebase uid), which Firebase phone auth ties to one
-- phone number — the profile's phone_number is kept for support only, because
-- owners can edit it (profiles_update_own) and it is empty on most rows.
--
-- ─── EXPAND-ONLY ────────────────────────────────────────────────────────────
-- Two new columns, one new table, backfill, one new AFTER INSERT trigger.
-- Nothing existing is altered: the store-limit trigger keeps its old rule
-- until 059. The previous release runs unchanged on this schema — it still
-- reads created_at, and the new trigger's subscription row makes its own
-- site_subscriptions insert a 23505 it already ignores.
--
-- ─── BACKFILL ───────────────────────────────────────────────────────────────
-- Every existing store keeps exactly the trial state it has today
-- (created_at + 7 days), including the 25 stores that had no subscription row.
-- Every existing owner has used their trial.
--
-- Rollback (nothing reads these until the app release that uses them):
--   DROP TRIGGER IF EXISTS trg_open_store_subscription ON public.sites;
--   DROP FUNCTION IF EXISTS public.open_store_subscription();
--   DROP TABLE IF EXISTS public.trial_claims;
--   ALTER TABLE public.sites DROP COLUMN IF EXISTS paid_store_consent_at;
--   ALTER TABLE public.site_subscriptions DROP COLUMN IF EXISTS trial_ends_at;

-- ── 1. Columns ──────────────────────────────────────────────────────────────

-- When the store's free trial ends; NULL when it never had one.
ALTER TABLE public.site_subscriptions
    ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- When the owner agreed that this store has no trial and goes live only after
-- payment. Written once, at creation; required by 059 for a no-trial store.
ALTER TABLE public.sites
    ADD COLUMN IF NOT EXISTS paid_store_consent_at timestamptz;

-- ── 2. The trial record ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trial_claims (
    user_id      text        PRIMARY KEY,
    phone_number text,
    site_id      uuid,
    claimed_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trial_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_claims FROM PUBLIC, anon, authenticated;

-- ── 3. Backfill ─────────────────────────────────────────────────────────────

-- Stores with no subscription row get one, with the trial they have today.
INSERT INTO public.site_subscriptions (site_id, user_id, store_plan, trial_ends_at)
SELECT s.id, s.user_id, 'qr_menu', s.created_at + interval '7 days'
FROM public.sites s
WHERE NOT EXISTS (SELECT 1 FROM public.site_subscriptions ss WHERE ss.site_id = s.id);

-- Existing rows get the trial window the app computes today.
UPDATE public.site_subscriptions ss
SET trial_ends_at = s.created_at + interval '7 days'
FROM public.sites s
WHERE s.id = ss.site_id
  AND ss.trial_ends_at IS NULL;

-- Every existing owner has used their trial: one claim each, on their first store.
INSERT INTO public.trial_claims (user_id, phone_number, site_id, claimed_at)
SELECT DISTINCT ON (s.user_id)
       s.user_id, NULLIF(btrim(p.phone_number), ''), s.id, s.created_at
FROM public.sites s
LEFT JOIN public.profiles p ON p.id = s.user_id
ORDER BY s.user_id, s.created_at
ON CONFLICT (user_id) DO NOTHING;

-- ── 4. Every new store opens its subscription with its trial decided ────────
--
-- AFTER INSERT, so the store row exists for the foreign key and the claim can
-- name it. SECURITY DEFINER because the inserting role may be a browser
-- (sites_insert_own), which may not write trial_claims or site_subscriptions.
-- The claim is ON CONFLICT DO NOTHING on the account: the first store wins the
-- trial; FOUND says whether this insert was that store. Inside the statement's
-- transaction, so a failed store insert takes its claim with it.

CREATE OR REPLACE FUNCTION public.open_store_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_phone text;
    v_trial boolean;
BEGIN
    SELECT NULLIF(btrim(phone_number), '') INTO v_phone
    FROM public.profiles WHERE id = NEW.user_id;

    INSERT INTO public.trial_claims (user_id, phone_number, site_id)
    VALUES (NEW.user_id, v_phone, NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    v_trial := FOUND;

    INSERT INTO public.site_subscriptions (site_id, user_id, store_plan, trial_ends_at)
    VALUES (NEW.id, NEW.user_id, 'qr_menu', CASE WHEN v_trial THEN now() + interval '7 days' END)
    ON CONFLICT (site_id) DO UPDATE SET trial_ends_at = EXCLUDED.trial_ends_at;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.open_store_subscription() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_open_store_subscription ON public.sites;
CREATE TRIGGER trg_open_store_subscription
    AFTER INSERT ON public.sites
    FOR EACH ROW
    EXECUTE FUNCTION public.open_store_subscription();
