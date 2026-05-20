-- 022_table_checkout.sql
-- Records checkout events when admin settles a table's bill

CREATE TABLE IF NOT EXISTS public.table_checkouts (
  id             uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id        uuid          NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  table_number   text          NOT NULL,
  payment_method text          NOT NULL CHECK (payment_method IN ('cash', 'card', 'upi')),
  total_amount   numeric(10,2) NOT NULL,
  order_ids      uuid[]        NOT NULL DEFAULT '{}',
  checked_out_at timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_table_checkouts_site
  ON public.table_checkouts (site_id, checked_out_at DESC);

ALTER TABLE public.table_checkouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access" ON public.table_checkouts;
CREATE POLICY "service role full access" ON public.table_checkouts
  USING (true)
  WITH CHECK (true);
