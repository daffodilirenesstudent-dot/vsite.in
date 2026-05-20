-- 018: Hardens RLS on the QR-ordering tables.
-- Removes leftover permissive policies and revokes broad anon/authenticated grants.
--
-- Reason for this migration: legacy permissive policies on `orders`
--   ("read orders" USING true, "insert orders" WITH CHECK true,
--    "update orders" USING true)
-- and broad SELECT/UPDATE/DELETE grants to anon/authenticated were left
-- behind on `orders`, `order_items`, `transactions`, `daily_counters`.
-- Combined with the public anon key shipped to every browser, this allowed
-- any visitor to read every customer's email/items/totals and forge orders.
--
-- After this migration:
--   * anon  : INSERT-only on orders/order_items/transactions, gated on
--             site is_open + is_live. No SELECT, no UPDATE, no DELETE.
--   * authenticated (admin) : SELECT/UPDATE only orders the user owns
--             via sites.user_id. SELECT on order_items/transactions same way.
--   * service_role : full access (used by API routes).

-- ── 1. orders: drop the legacy permissive policies ────────────────────────
DROP POLICY IF EXISTS "read orders"   ON public.orders;
DROP POLICY IF EXISTS "insert orders" ON public.orders;
DROP POLICY IF EXISTS "update orders" ON public.orders;

REVOKE ALL ON public.orders FROM anon, authenticated;
GRANT  INSERT          ON public.orders TO anon;
GRANT  SELECT, UPDATE  ON public.orders TO authenticated;

-- ── 2. order_items: same lockdown ─────────────────────────────────────────
DROP POLICY IF EXISTS "read order_items"        ON public.order_items;
DROP POLICY IF EXISTS "insert order_items"      ON public.order_items;
DROP POLICY IF EXISTS "update order_items"      ON public.order_items;
DROP POLICY IF EXISTS order_items_public_insert ON public.order_items;
DROP POLICY IF EXISTS order_items_owner_select  ON public.order_items;

REVOKE ALL ON public.order_items FROM anon, authenticated;
GRANT  INSERT ON public.order_items TO anon;
GRANT  SELECT ON public.order_items TO authenticated;

CREATE POLICY order_items_public_insert ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.sites s ON s.id = o.site_id
      WHERE o.id = order_items.order_id
        AND COALESCE(s.is_open, false) = true
        AND COALESCE(s.is_live, false) = true
    )
  );

CREATE POLICY order_items_owner_select ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.sites s ON s.id = o.site_id
      WHERE o.id = order_items.order_id
        AND s.user_id = (SELECT auth.jwt() ->> 'sub')
    )
  );

-- ── 3. transactions: same lockdown ────────────────────────────────────────
DROP POLICY IF EXISTS "read transactions"        ON public.transactions;
DROP POLICY IF EXISTS "insert transactions"      ON public.transactions;
DROP POLICY IF EXISTS "update transactions"      ON public.transactions;
DROP POLICY IF EXISTS transactions_public_insert ON public.transactions;
DROP POLICY IF EXISTS transactions_owner_select  ON public.transactions;

REVOKE ALL ON public.transactions FROM anon, authenticated;
GRANT  INSERT ON public.transactions TO anon;
GRANT  SELECT ON public.transactions TO authenticated;

CREATE POLICY transactions_public_insert ON public.transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.sites s ON s.id = o.site_id
      WHERE o.id = transactions.order_id
        AND COALESCE(s.is_open, false) = true
        AND COALESCE(s.is_live, false) = true
    )
  );

CREATE POLICY transactions_owner_select ON public.transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.sites s ON s.id = o.site_id
      WHERE o.id = transactions.order_id
        AND s.user_id = (SELECT auth.jwt() ->> 'sub')
    )
  );

-- ── 4. daily_counters: never accessed via anon/auth — only RPCs ───────────
REVOKE ALL ON public.daily_counters FROM anon, authenticated;

-- ── 5. Defensive: ensure RLS is on (idempotent) ───────────────────────────
ALTER TABLE public.orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_counters ENABLE ROW LEVEL SECURITY;
