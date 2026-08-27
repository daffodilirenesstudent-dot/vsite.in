-- Tracks public QR-menu views for the qr_menu plan insights panel.
-- Each row is one menu view; visitor_id is a client-generated session ID stored
-- in localStorage, so we can compute distinct-visitor counts cheaply.

CREATE TABLE IF NOT EXISTS public.menu_scans (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id      UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    visitor_id   TEXT NOT NULL,
    scanned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    table_number TEXT
);

CREATE INDEX IF NOT EXISTS menu_scans_site_time_idx
    ON public.menu_scans (site_id, scanned_at DESC);

-- The dashboard polls every 30s and counts distinct visitor_id within the
-- "today" window in the site's timezone. The composite index above covers it.

ALTER TABLE public.menu_scans ENABLE ROW LEVEL SECURITY;

-- Inserts come from the public menu page (no auth) — service role inserts via
-- the /api/track-menu-scan route. Owners read their own site's scans via the
-- /api/manage/menu-summary route (server-side, service role). No RLS policies
-- needed because all access flows through service-role API routes.
