-- 050_notification_emails_and_reminders.sql
-- Adds merchant-managed notification emails on `sites` (up to 3) and a
-- bookkeeping column on `site_subscriptions` so the T-3-day expiry reminder
-- job doesn't double-send for the same billing period.

-- ── 1. notification_emails on sites ─────────────────────────────────────────
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS notification_emails text[] NOT NULL DEFAULT '{}'::text[];

-- Hard cap at 3 entries. App-side validation also enforces email format.
ALTER TABLE public.sites
  DROP CONSTRAINT IF EXISTS sites_notification_emails_max3;
ALTER TABLE public.sites
  ADD CONSTRAINT sites_notification_emails_max3
  CHECK (array_length(notification_emails, 1) IS NULL OR array_length(notification_emails, 1) <= 3);

COMMENT ON COLUMN public.sites.notification_emails IS
  'Up to 3 merchant-managed emails that receive billing invoices and expiry reminders.';

-- ── 2. expiry_reminder_sent_at on site_subscriptions ────────────────────────
-- Set whenever the T-3-day reminder fires for the current store_expires_at
-- value. Cleared on every plan renewal so the next cycle gets its own reminder.
ALTER TABLE public.site_subscriptions
  ADD COLUMN IF NOT EXISTS expiry_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.site_subscriptions.expiry_reminder_sent_at IS
  'Timestamp the most recent T-3 expiry reminder was sent. NULL after each renewal.';

-- Helpful index for the daily reminder cron: scan only rows expiring soon.
CREATE INDEX IF NOT EXISTS idx_site_subscriptions_expires_at_active
  ON public.site_subscriptions (store_expires_at)
  WHERE store_expires_at IS NOT NULL;
