-- 048: WhatsApp order taking + display currency
--
-- WhatsApp order taking is for stores on the qr_order (no-payment) plan that
-- prefer to fulfil orders out-of-band through a WhatsApp chat. When the toggle
-- is on, the customer's "Place Order" tap saves the order to the DB (so
-- transactions / insights / My Orders all keep working) and immediately
-- redirects to a wa.me link with a prefilled message to the restaurant.
--
-- Display currency lets the restaurant flip the symbol shown to customers
-- between INR and AED. It's purely cosmetic — amounts on the order rows are
-- the same numbers regardless. The currency a customer paid in is captured
-- on the order via currency_code (snapshot) so a later switch never relabels
-- past orders.

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS whatsapp_order_taking BOOL NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_order_number TEXT,
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_currency_code_valid') THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_currency_code_valid CHECK (currency_code IN ('INR', 'AED'));
  END IF;
END $$;

-- WhatsApp number stored as E.164-ish (+countrycode + 7-15 digits). NULL allowed
-- since the toggle can be off, and we don't want to force a value during
-- early onboarding.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_whatsapp_order_number_format') THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_whatsapp_order_number_format
      CHECK (whatsapp_order_number IS NULL OR whatsapp_order_number ~ '^\+?[0-9]{7,15}$');
  END IF;
END $$;

-- When the toggle is on, the number must be set.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_whatsapp_complete') THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_whatsapp_complete
      CHECK (whatsapp_order_taking = FALSE OR whatsapp_order_number IS NOT NULL);
  END IF;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_whatsapp_order BOOL NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR';

CREATE INDEX IF NOT EXISTS orders_is_whatsapp_idx ON public.orders (site_id, created_at DESC) WHERE is_whatsapp_order = TRUE;
