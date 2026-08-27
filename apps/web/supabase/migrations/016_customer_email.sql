-- Replace customer_mobile with customer_email on orders and transactions
-- Mobile number is no longer collected; email is used for order confirmation.

ALTER TABLE public.orders
  RENAME COLUMN customer_mobile TO customer_email;

ALTER TABLE public.transactions
  RENAME COLUMN customer_mobile TO customer_email;
