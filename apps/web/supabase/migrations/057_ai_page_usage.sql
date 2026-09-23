-- 057_ai_page_usage.sql — durable AI page allowance per store (ai-page-limits).
--
-- Expand-only: one new table, its indexes and three new functions. Nothing
-- existing is altered, so the previous release runs unchanged on this schema.
-- Nothing reads these objects until AI_PAGE_LIMITS is ON.
--
-- Kinds:
--   onboarding  one row per user while unbound (site_id NULL), bound to the
--               store /api/onboarding/complete creates; 15 pages per store.
--   bulk_trial  one row per store for the whole trial (period_key 'trial').
--   bulk_paid   one row per store per billing month (period_key 'paid:<end>').

CREATE TABLE IF NOT EXISTS public.ai_page_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('onboarding', 'bulk_trial', 'bulk_paid')),
  user_id         text NOT NULL,
  site_id         uuid NULL,
  period_key      text NOT NULL DEFAULT '',
  period_ends_at  timestamptz NULL,
  pages_used      integer NOT NULL DEFAULT 0 CHECK (pages_used >= 0),
  pages_refunded  integer NOT NULL DEFAULT 0 CHECK (pages_refunded >= 0),
  page_limit      integer NOT NULL CHECK (page_limit >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  bound_at        timestamptz NULL
);

-- No foreign key to sites: stores are deleted from the dashboard, and the rows
-- stay as an audit ledger (a few per store).

-- One open onboarding bucket per user: what stops endless re-scans.
CREATE UNIQUE INDEX IF NOT EXISTS ai_page_usage_open_onboarding
  ON public.ai_page_usage (user_id) WHERE kind = 'onboarding' AND site_id IS NULL;
-- One bulk row per store per period.
CREATE UNIQUE INDEX IF NOT EXISTS ai_page_usage_bulk_period
  ON public.ai_page_usage (site_id, kind, period_key) WHERE kind <> 'onboarding' AND site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_page_usage_user ON public.ai_page_usage (user_id);

-- Server only: RLS on with no policies, and no table grants to client roles.
ALTER TABLE public.ai_page_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_page_usage FROM anon, authenticated;

-- Reserve p_pages or refuse. The single conditional UPDATE is the atomic
-- check-and-charge: concurrent callers serialise on the row lock, and READ
-- COMMITTED re-checks the WHERE clause against the committed value, so N
-- callers can never pass pages_used + p_pages <= p_limit together.
CREATE OR REPLACE FUNCTION public.reserve_ai_pages(
  p_user_id text, p_kind text, p_site_id uuid, p_period_key text,
  p_period_ends_at timestamptz, p_limit integer, p_pages integer)
RETURNS TABLE (ok boolean, reason text, bucket_id uuid, pages_used integer, page_limit integer)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_used integer;
BEGIN
  IF p_pages < 1 OR p_limit < 0 THEN
    RAISE EXCEPTION 'reserve_ai_pages: bad arguments';
  END IF;

  IF p_kind = 'onboarding' THEN
    INSERT INTO ai_page_usage (kind, user_id, page_limit)
      VALUES ('onboarding', p_user_id, p_limit)
      ON CONFLICT (user_id) WHERE kind = 'onboarding' AND site_id IS NULL DO NOTHING;
    SELECT u.id INTO v_id FROM ai_page_usage u
      WHERE u.kind = 'onboarding' AND u.user_id = p_user_id AND u.site_id IS NULL;
  ELSE
    -- Ownership, checked again here as defence in depth (the route checks too).
    IF NOT EXISTS (SELECT 1 FROM sites s WHERE s.id = p_site_id AND s.user_id = p_user_id) THEN
      RETURN QUERY SELECT false, 'not_owner'::text, NULL::uuid, 0, 0;
      RETURN;
    END IF;
    INSERT INTO ai_page_usage (kind, user_id, site_id, period_key, period_ends_at, page_limit)
      VALUES (p_kind, p_user_id, p_site_id, p_period_key, p_period_ends_at, p_limit)
      ON CONFLICT (site_id, kind, period_key) WHERE kind <> 'onboarding' AND site_id IS NOT NULL DO NOTHING;
    SELECT u.id INTO v_id FROM ai_page_usage u
      WHERE u.site_id = p_site_id AND u.kind = p_kind AND u.period_key = p_period_key;
  END IF;

  UPDATE ai_page_usage u
     SET pages_used = u.pages_used + p_pages, updated_at = now()
   WHERE u.id = v_id AND u.pages_used + p_pages <= p_limit
   RETURNING u.pages_used INTO v_used;

  IF FOUND THEN
    RETURN QUERY SELECT true, 'ok'::text, v_id, v_used, p_limit;
  ELSE
    RETURN QUERY SELECT false, 'limit'::text, v_id,
      (SELECT u.pages_used FROM ai_page_usage u WHERE u.id = v_id), p_limit;
  END IF;
END $$;

-- Give back pages the AI could not read. Never takes the counter below zero.
CREATE OR REPLACE FUNCTION public.refund_ai_pages(p_bucket_id uuid, p_pages integer)
RETURNS integer LANGUAGE sql SET search_path = public AS $$
  UPDATE ai_page_usage
     SET pages_refunded = pages_refunded + LEAST(p_pages, pages_used),
         pages_used = GREATEST(0, pages_used - p_pages),
         updated_at = now()
   WHERE id = p_bucket_id AND p_pages > 0
  RETURNING pages_used;
$$;

-- Tie the user's open onboarding bucket to the store just created, so the
-- next store opens a fresh one. Only the store's owner can bind it.
CREATE OR REPLACE FUNCTION public.bind_onboarding_pages(p_user_id text, p_site_id uuid)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  UPDATE ai_page_usage
     SET site_id = p_site_id, bound_at = now(), updated_at = now()
   WHERE kind = 'onboarding' AND user_id = p_user_id AND site_id IS NULL
     AND EXISTS (SELECT 1 FROM sites s WHERE s.id = p_site_id AND s.user_id = p_user_id);
$$;

-- Least privilege (the 055 lesson): callable by the server's service role only.
REVOKE EXECUTE ON FUNCTION public.reserve_ai_pages(text, text, uuid, text, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_ai_pages(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bind_onboarding_pages(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_pages(text, text, uuid, text, timestamptz, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_pages(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_onboarding_pages(text, uuid) TO service_role;
