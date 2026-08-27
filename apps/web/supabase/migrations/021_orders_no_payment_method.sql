-- 021_orders_no_payment_method.sql
-- Extend orders.payment_method check to allow 'no_payment' for QR Ordering Without Payment plan

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('online', 'counter', 'no_payment'));
