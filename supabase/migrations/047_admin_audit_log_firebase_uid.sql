-- 047: Fix admin_audit_log.user_id type
--
-- Migration 038 declared admin_audit_log.user_id as UUID, but every caller of
-- audit() passes a Firebase UID — a 28-char base62 string returned from the
-- `sub` claim of a Firebase ID token, not a UUID. Result: every audit log
-- insert has been failing silently with "invalid input syntax for type uuid"
-- since 038 shipped. audit() is fire-and-forget, so the failure only ever
-- surfaced as a console.error.
--
-- Convert to TEXT to match the Firebase UID format. The user_id index in 038
-- is preserved across the type change.

ALTER TABLE public.admin_audit_log
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

COMMENT ON COLUMN public.admin_audit_log.user_id IS
  'Firebase UID of the admin who performed the action (sub claim of the ID token, not a UUID).';
