-- 036: Device sessions for KOT Station presence tracking
-- Each row = one browser/APK currently viewing /manage/orders.
-- Pruned when last_seen_at > 2 minutes ago by the heartbeat API.

CREATE TABLE IF NOT EXISTS public.device_sessions (
  device_id    TEXT        NOT NULL,
  site_id      UUID        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  device_name  TEXT,
  is_apk       BOOLEAN     NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, site_id)
);

CREATE INDEX IF NOT EXISTS device_sessions_site_last_seen
  ON public.device_sessions (site_id, last_seen_at DESC);

-- Designates which device_id is the KOT printer for this site.
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS kot_station_device_id TEXT;

GRANT ALL ON public.device_sessions TO service_role;
