-- 064 — WhatsApp notification health: circuit breakers, heartbeats, alert de-dup (2026-10-02)
--
-- Spec: docs/superpowers/specs/2026-10-02-whatsapp-hardening-design.md
-- Expand-only. Written only by the server (service_role) from
-- src/lib/notifications/whatsapp/healthStore.ts. No personal data.
--
-- key:  'system' | 'template:<name>'   circuit breakers (open_until null = closed)
--       'heartbeat:daily'              last daily run (updated_at)
--       'alert:<kind>'                 last time that alert fired (updated_at)
--
-- Rollback: DROP TABLE IF EXISTS public.notification_health;

CREATE TABLE IF NOT EXISTS public.notification_health (
    key         text        PRIMARY KEY,
    open_until  timestamptz,
    reason      text,
    code        integer,
    opened_at   timestamptz,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_health ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_health FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_health TO service_role;
