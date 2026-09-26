-- 059_store_limit_two_with_consent.sql — the store-limit trigger enforces the
-- one-trial rule (one-trial). Apply AFTER the app release that sends consent.
--
-- Replaces 011's rule (5 stores, 2 on trial at once — which let an owner roll a
-- new free store every week, and which counted 14 days while the app said 7):
--
--   • at most 2 stores per account;
--   • once the account's trial is used (trial_claims, 058), a new store must
--     carry the owner's consent (sites.paid_store_consent_at) — it will have no
--     trial and goes live only after payment;
--   • one store creation at a time per account (transaction advisory lock), so
--     two simultaneous launches cannot both pass the count, or both reach 058's
--     trigger believing the trial is still free.
--
-- The rule lives in the database because owners can INSERT into sites from the
-- browser (sites_insert_own); the API checks the same rule first
-- (lib/store/trialRules.ts) so an owner is asked before any work is done.
--
-- Rollback: re-run the function body from 011_atomic_store_limits.sql.

CREATE OR REPLACE FUNCTION public.enforce_store_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total      int;
    v_trial_used boolean;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('store_limits:' || NEW.user_id));

    SELECT count(*) INTO v_total FROM public.sites WHERE user_id = NEW.user_id;
    IF v_total >= 2 THEN
        RAISE EXCEPTION 'PLAN_LIMIT: An account can have at most 2 stores'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.trial_claims WHERE user_id = NEW.user_id) INTO v_trial_used;
    IF v_trial_used AND NEW.paid_store_consent_at IS NULL THEN
        RAISE EXCEPTION 'CONSENT_REQUIRED: This account used its free trial; a new store needs the owner''s agreement to pay before it goes live'
            USING ERRCODE = 'P0001';
    END IF;

    -- A store that gets the trial carries no consent: there was nothing to agree to.
    IF NOT v_trial_used THEN
        NEW.paid_store_consent_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_store_limits() FROM PUBLIC, anon, authenticated;
