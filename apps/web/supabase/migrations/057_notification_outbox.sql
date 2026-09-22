-- 057 — WhatsApp notification outbox (2026-09-22)
--
-- Durable, idempotent queue for WhatsApp template messages to store owners.
-- Spec: docs/superpowers/specs/2026-09-22-whatsapp-notifications-design.md
--
-- Written only by the server (service_role) from src/lib/notifications/whatsapp/.
-- RLS is on with no policies and the public roles are revoked: the browser holds
-- the anon key, and this table holds owners' phone numbers.
--
-- idempotency_key is the whole de-duplication story: one real-world occurrence
-- (welcome:<site>, receipt:<order>, plan_expiring:<site>:<expires_at>, …) gets
-- one row, and the app inserts with ON CONFLICT DO NOTHING.
--
-- Status machine (see src/lib/notifications/whatsapp/state.ts):
--   queued → sending → sent → delivered → read
--   side exits: failed (retryable, next_attempt_at), dead (permanent), skipped

CREATE TABLE IF NOT EXISTS public.notification_outbox (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key  text        NOT NULL UNIQUE,
    event            text        NOT NULL,
    user_id          text        NOT NULL,
    site_id          uuid        REFERENCES public.sites(id) ON DELETE SET NULL,
    to_phone         text,
    template         text        NOT NULL,
    language         text        NOT NULL DEFAULT 'en',
    params           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status           text        NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','sending','sent','delivered','read','failed','dead','skipped')),
    attempts         integer     NOT NULL DEFAULT 0,
    next_attempt_at  timestamptz          DEFAULT now(),
    last_error       text,
    error_code       integer,
    wamid            text,
    sent_at          timestamptz,
    delivered_at     timestamptz,
    read_at          timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Webhook status updates look rows up by Meta's message id.
CREATE INDEX IF NOT EXISTS notification_outbox_wamid_idx
    ON public.notification_outbox (wamid) WHERE wamid IS NOT NULL;

-- The dispatcher: queued rows, and failed rows whose backoff has elapsed.
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
    ON public.notification_outbox (status, next_attempt_at)
    WHERE status IN ('queued', 'failed', 'sending');

-- Support lookups ("did this owner get their welcome?").
CREATE INDEX IF NOT EXISTS notification_outbox_site_idx
    ON public.notification_outbox (site_id, created_at DESC);

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_outbox TO service_role;
