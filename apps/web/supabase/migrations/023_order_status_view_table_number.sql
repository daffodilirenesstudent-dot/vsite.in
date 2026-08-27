-- 023: Add table_number and status to order_status_public view.
-- Previously the view omitted table_number, so the customer status page
-- could not render the "Table X" card for no_payment table orders.
-- Also expose status so the customer page can show the current order state.

CREATE OR REPLACE VIEW public.order_status_public AS
  SELECT id, counter_number, token_number, payment_status, status, table_number
  FROM   public.orders;

GRANT SELECT ON public.order_status_public TO anon;
