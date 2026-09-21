-- Applied to the live database on 2026-09-20 as migration
-- `revoke_public_execute_on_internal_rpcs` (version 20260920170625) but not
-- committed at the time. Recorded here verbatim on 2026-09-21 so the repo
-- matches production — a rebuild from the repo would otherwise reopen this.

-- QA 2026-09-20: close public access to server-only RPCs.
--
-- Postgres grants EXECUTE to PUBLIC by default on every new function, and
-- Supabase exposes public-schema functions over PostgREST at /rest/v1/rpc/<name>.
-- The `anon` key ships inside the browser bundle on every vsite page, so these
-- were reachable by anyone.
--
-- Proven before this migration: POST /rest/v1/rpc/insights_top_items with only
-- the anon key returned real revenue (29500), quantities and order counts for a
-- site, while the app's own /api/manage/insights/top-items correctly returned
-- 401. create_order_atomic was also anon-callable, which bypassed ORDERING_FROZEN
-- entirely -- the app-layer freeze cannot guard a function reachable underneath it.
--
-- Safe: every caller in src/ uses supabaseServer (service_role), which keeps its
-- own explicit grant. No browser code calls these with the anon/authenticated key.
-- Reversible with GRANT EXECUTE ... TO <role>.

REVOKE EXECUTE ON FUNCTION public.insights_top_items(uuid, timestamptz, timestamptz)
    FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.insights_revenue_series(uuid, timestamptz, timestamptz, text)
    FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(
    uuid, text, text, text, text, text, text, jsonb, numeric, numeric, text, text, text, jsonb)
    FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.cleanup_hardening_tables()
    FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, bigint, integer)
    FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_site(uuid)
    FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.match_default_image(public.vector, double precision, integer)
    FROM PUBLIC, anon, authenticated;
