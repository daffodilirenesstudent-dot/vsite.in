-- ============================================================
-- Migration 004: Add onboarding_completed to profiles
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Default TRUE so all existing users are unaffected.
-- New users are explicitly inserted with onboarding_completed = false
-- in provisionNewUser (see AuthContext).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT true;

-- The existing profiles_update_own RLS policy already covers this column.
-- No extra policies needed.
