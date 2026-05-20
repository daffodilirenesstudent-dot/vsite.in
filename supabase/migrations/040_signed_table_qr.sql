-- 040: Per-site HMAC secret for signed table QR codes
--
-- WHY: Closes H3 from the audit. Today the table QR URL is /shop/<slug>?table=N.
-- A customer at table 5 can edit the URL to ?table=3 and their order goes to
-- table 3. Same for bill-request — anyone who knows the slug can ring the
-- bell for any table.
--
-- HOW: Add a per-site 24-byte secret. The QR-generation page bakes a sig param
-- into every printed QR: sig = first 16 hex of HMAC-SHA256(secret, slug+'|'+table).
-- The /api/orders and /api/bill-request routes verify the sig BEFORE accepting
-- the tableNumber.
--
-- COMPAT: New column with auto-generated default. Existing sites get a fresh
-- secret on first read (server-side `coalesce` or migration UPDATE below).
-- Existing printed QRs without sig still work in PHASE 1 (warning logged) —
-- restaurants re-print to switch to PHASE 2 (strict).

-- 1. Column. NOT NULL with auto-generated default for new rows.
ALTER TABLE public.sites
    ADD COLUMN IF NOT EXISTS qr_secret TEXT;

-- 2. Backfill existing rows with a 24-byte hex secret. gen_random_bytes is in
--    the pgcrypto extension which Supabase enables by default.
UPDATE public.sites
   SET qr_secret = encode(gen_random_bytes(24), 'hex')
 WHERE qr_secret IS NULL;

-- 3. Now lock it in.
ALTER TABLE public.sites
    ALTER COLUMN qr_secret SET NOT NULL,
    ALTER COLUMN qr_secret SET DEFAULT encode(gen_random_bytes(24), 'hex');

-- 4. The secret must NEVER be exposed to the client. Keep it server-only.
--    Existing RLS on sites already prevents anon SELECTs from leaking it as
--    long as the route never .select('qr_secret') from a public context.

COMMENT ON COLUMN public.sites.qr_secret IS
    'Per-site HMAC secret for signed table QR URLs. NEVER expose via public API. Use only server-side in /api/orders and /api/bill-request to verify ?sig= against ?table=. See 040_signed_table_qr.sql.';
