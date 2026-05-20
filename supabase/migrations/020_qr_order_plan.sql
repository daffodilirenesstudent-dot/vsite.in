-- 020_qr_order_plan.sql
-- Adds qr_order plan value and bill_requests table for QR Ordering Without Payment

-- Extend plan constraint to allow qr_order
ALTER TABLE public.site_subscriptions
  DROP CONSTRAINT IF EXISTS site_subscriptions_store_plan_check;
ALTER TABLE public.site_subscriptions
  ADD CONSTRAINT site_subscriptions_store_plan_check
  CHECK (store_plan IN ('qr_menu', 'pay_eat', 'qr_order'));

-- Bill requests: customers tap "Request Bill" → admin gets notified
CREATE TABLE IF NOT EXISTS public.bill_requests (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id         uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  table_number    text        NOT NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'acknowledged')),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

ALTER TABLE public.bill_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access" ON public.bill_requests;
CREATE POLICY "service role full access" ON public.bill_requests
  USING (true)
  WITH CHECK (true);

-- Fast lookup: pending bill requests per site ordered by time
CREATE INDEX IF NOT EXISTS bill_requests_site_pending
  ON public.bill_requests(site_id, requested_at DESC)
  WHERE status = 'pending';
