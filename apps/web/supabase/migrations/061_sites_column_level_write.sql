-- 061_sites_column_level_write.sql — security audit 2026-09-27 (M4).
--
-- Owners could write EVERY sites column from the browser (sites_update_own plus
-- a table-wide UPDATE grant): gst_status/gstin/gst_verified_at (fake a GST
-- registration past the CHECK constraints, which validate only format), slug
-- (claim a deleted store's QR traffic), paid_store_consent_at, qr_secret,
-- created_at. This does for UPDATE what migration 056 did for SELECT: revoke the
-- table-wide grant, then grant back only the display columns the dashboard
-- actually saves. Everything sensitive is written by service-role API routes
-- (currency, gst, kot, menu-theme, printer, qr-mode, whatsapp, toggle-live),
-- which bypass grants and RLS and are unaffected.
--
-- Verified browser writers of sites (the only two live paths):
--   src/app/manage/settings/page.tsx      → name, contact_number, location, pincode, business_type, timing
--   src/app/manage/you/store/page.tsx     → detailsUpdate(): the same six
-- (ShopCard.tsx also writes sites but is dead code — imported nowhere, and
-- writes a `description` column that does not exist.)
-- INSERT is revoked too: onboarding creates sites via the service role
-- (onboarding/complete), never the browser. DELETE is left intact — deleteStore
-- deletes from the browser under sites_delete_own.
-- Guarded by tests/security/dbWritePaths.test.ts.
--
-- Verify afterwards — the first must return zero rows, the second exactly the six:
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_name='sites' AND grantee IN ('anon','authenticated')
--       AND privilege_type IN ('INSERT','UPDATE') AND column_name IS NULL;   -- table-wide → none
--   SELECT column_name FROM information_schema.column_privileges
--     WHERE table_name='sites' AND grantee='authenticated' AND privilege_type='UPDATE' ORDER BY 1;
--
-- Rollback:
--   GRANT INSERT, UPDATE ON public.sites TO authenticated;
--   GRANT INSERT, UPDATE ON public.sites TO anon;

BEGIN;

REVOKE INSERT, UPDATE ON public.sites FROM anon, authenticated;

-- The display fields both save forms write. A new editable field must be added
-- here, or saving it from the browser fails (the test enforces this).
GRANT UPDATE (name, contact_number, location, pincode, business_type, timing)
    ON public.sites TO authenticated;

COMMIT;
