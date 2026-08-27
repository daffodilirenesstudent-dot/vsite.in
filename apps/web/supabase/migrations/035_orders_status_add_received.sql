-- 035: Add 'received' to orders status check constraint
-- Required for KOT flow: orders start as 'received' before KOT is sent to kitchen.

ALTER TABLE public.orders
  DROP CONSTRAINT orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY['received'::text, 'preparing'::text, 'ready'::text, 'completed'::text]));
