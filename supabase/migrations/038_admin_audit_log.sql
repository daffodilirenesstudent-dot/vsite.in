-- 038: Admin Audit Log
--
-- WHY:
-- Closes the I11 finding from the C-series audit. Without this table, if a
-- cashier disputes a transaction or the owner suspects skimming, there's no
-- forensic record linking the admin's user_id to specific status changes,
-- payment confirmations, or table checkouts.
--
-- DESIGN:
--   * Append-only (no UPDATEs, no DELETEs from app).
--   * Indexed for the common owner query: "show me what user X did at site Y
--     on date Z."
--   * Inserts are fire-and-forget from the app layer — if logging fails, the
--     business operation must NOT fail. Auditability is best-effort, not blocking.
--   * service_role only — never readable/writable from the client SDK.
--
-- RETENTION:
--   Keep 90 days for legal compliance + dispute window. cleanup_hardening_tables
--   cron in 015 already prunes old hardening rows; add this table to that sweep
--   (see follow-up migration).

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id          BIGSERIAL PRIMARY KEY,
    -- Firebase UID of the admin who performed the action.
    user_id     UUID        NOT NULL,
    -- Site the action was scoped to (so the owner of site X can audit X without
    -- seeing actions on site Y).
    site_id     UUID        NOT NULL,
    -- Machine-friendly action name. Free text — pick stable strings.
    -- Current vocabulary:
    --   'confirm_counter_payment' | 'order_status_change'
    --   'table_checkout' | 'order_kot_sent'
    --   'bill_request_ack' | 'kot_mode_change' | 'qr_mode_change'
    --   'printer_settings_change' | 'kot_device_assign'
    action      TEXT        NOT NULL,
    -- The thing being acted upon — order_id, table_number, bill_request_id, etc.
    target_id   TEXT,
    -- Free-form JSON for context: amount, before/after status, payment_method, etc.
    -- Keep small; this is a log, not storage. Cap at ~2KB.
    details     JSONB,
    -- IP hash (first 16 hex of sha256) so we can detect "same admin from
    -- suspicious geo" without storing raw IP (GDPR/DPDP friendly).
    ip_hash     TEXT,
    -- Timestamp from the DB clock — not trusted client time.
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Owner query: "all actions at my site on this date, newest first"
CREATE INDEX IF NOT EXISTS admin_audit_log_site_at_idx
    ON public.admin_audit_log (site_id, at DESC);

-- Cashier query: "all actions by this user across all their sites"
CREATE INDEX IF NOT EXISTS admin_audit_log_user_at_idx
    ON public.admin_audit_log (user_id, at DESC);

-- Forensics: "all rows for a specific order/target"
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
    ON public.admin_audit_log (target_id)
    WHERE target_id IS NOT NULL;

-- ── Locked-down RLS — only the service role writes/reads ────────────────────
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Default-deny: no anon, no authenticated. App writes via service-role client.
-- Owner reads will go through a future server route that joins to sites.user_id.

REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT  SELECT, INSERT ON TABLE public.admin_audit_log TO service_role;
GRANT  USAGE, SELECT ON SEQUENCE public.admin_audit_log_id_seq TO service_role;

-- ── Comments for owner-facing reports ────────────────────────────────────────
COMMENT ON TABLE  public.admin_audit_log IS
    'Append-only audit trail of admin actions. Inserted by service-role from API routes. Closes insider-threat finding I11 from C-series audit (2026-05-16).';
COMMENT ON COLUMN public.admin_audit_log.action IS
    'Stable machine name. See orders/[id]/route.ts, manage/table-checkout/route.ts, etc. for emit sites.';
COMMENT ON COLUMN public.admin_audit_log.details IS
    'JSON context: { before, after, amount, payment_method, ... }. Keep < 2KB.';
