-- 054_drop_site_branding.sql — retire the logo and the description; make the
-- store's real-world identity (business type, place, PIN) what we collect.
--
-- ─── WHY ─────────────────────────────────────────────────────────────────────
-- Two fields on the Store Details tab asked the owner to do marketing:
--
--   sites.image_url   a logo to upload
--   sites.description a blurb to write
--
-- Most owners have neither. The upload box sat empty, the blurb sat empty, and
-- the menu header was built to read as finished without them (see 052, which
-- added show_logo precisely because "most stores have no logo"). A field that
-- is empty on most rows is not a field — it is an obstacle on the first screen
-- an owner sees after signing up.
--
-- show_logo goes with them: a toggle whose only job was hiding a column that
-- no longer exists.
--
-- ─── THE ONE REAL LOSS, AND WHAT REPLACES IT ────────────────────────────────
-- sites.description was the <meta name="description"> and the OpenGraph blurb
-- for every public menu at /shop/[slug]. Deleting it without a replacement
-- would flatten every menu in the product to one generic sentence.
--
-- So the page now BUILDS that sentence from fields the owner can answer in a
-- tap — "Cream Story — Café in Madurai. Browse the full menu from your phone."
-- — using a NEW sites.business_type plus sites.location, which the rewritten
-- Store Details tab now actually collects. Derived beats owner-written here:
-- it is never empty, never stale, and never a paragraph of keywords.
--
-- Of the 59 live rows, 55 descriptions were the string onboarding wrote for
-- them ('<name> digital menu') and 4 were owner-written. Five rows have a logo.
-- That is the whole loss.
--
-- ─── ORDER MATTERS ───────────────────────────────────────────────────────────
-- delete_site() (015_db_hardening) SELECTs both columns into deleted_sites. It
-- is replaced FIRST, inside the same transaction, so there is no instant at
-- which the function references a dropped column.
--
-- Idempotent throughout: DROP COLUMN IF EXISTS, and a pg_constraint guard on
-- the new CHECK, following 046 and 052.

BEGIN;

-- ── 1. delete_site without the two columns ──────────────────────────────────
-- Byte-identical to 015 apart from the column lists. The ownership check, the
-- frozen search_path and SECURITY DEFINER are all load-bearing — this function
-- is reachable by any authenticated user and deletes a whole store.
CREATE OR REPLACE FUNCTION public.delete_site(site_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id text;
    v_caller  text;
BEGIN
    v_caller := (auth.jwt() ->> 'sub');
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
    END IF;

    SELECT user_id INTO v_user_id FROM public.sites WHERE id = site_id;
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'SITE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF v_user_id <> v_caller THEN
        RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.deleted_sites (
        id, original_created_at, user_id, social_links, is_live,
        owner_name, contact_number, timing, established_year, location,
        state, pincode, address, slug, email, whatsapp_number,
        tagline, type, business_type, name
    )
    SELECT
        id, created_at, user_id, social_links, is_live,
        owner_name, contact_number, timing, established_year, location,
        state, pincode, address, slug, email, whatsapp_number,
        tagline, type, business_type, name
    FROM public.sites
    WHERE id = site_id;

    DELETE FROM public.sites WHERE id = site_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_site(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_site(uuid) TO authenticated, service_role;

-- ── 2. Drop the columns ─────────────────────────────────────────────────────
-- Existing logos and blurbs go with them. That is the intent: owners who added
-- one should stop seeing it rather than keep an orphaned value that no screen
-- reads. Uploaded logo FILES are left in storage — deleting bytes is not
-- something a schema migration should do silently, and they cost nothing.
ALTER TABLE public.sites
  DROP COLUMN IF EXISTS image_url,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS show_logo;

ALTER TABLE public.deleted_sites
  DROP COLUMN IF EXISTS image_url,
  DROP COLUMN IF EXISTS description;

-- ── 3. business_type — a NEW column, deliberately not sites.type ────────────
-- sites.type is already taken. It holds 'Shop' | 'Menu' on all 59 live rows: a
-- product-kind discriminator that PosterGenerator prints onto the QR poster
-- ("MENU" vs "SHOP") and that ShopCard and SiteInfo branch on. Writing 'cafe'
-- into it would have mislabelled printed standees already on tables.
--
-- Constrained to the five ids the chips offer, so a value the UI cannot render
-- can never be stored. NULL is legal: every existing row has one, and the field
-- is optional.
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS business_type TEXT;

ALTER TABLE public.deleted_sites
  ADD COLUMN IF NOT EXISTS business_type TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_business_type_valid'
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_business_type_valid
      CHECK (business_type IS NULL OR business_type IN
        ('restaurant', 'cafe', 'takeaway', 'mess', 'tea_shop'));
  END IF;
END $$;

-- ── 4. Validate the PIN we are now asking for ───────────────────────────────
-- sites.pincode has been on this table since before 015 and was never
-- constrained. The tab now collects it deliberately, so it gets the same rule
-- 046 gave gst_pincode — plus the leading-zero exclusion: no Indian PIN starts
-- with 0, and '000000' is the single most common way a required numeric field
-- gets filled in to make it go away.
--
-- NULL stays legal. Existing rows predate the field being asked for, and a
-- migration that fails on real data is a migration that does not run.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_pincode_format'
  ) THEN
    -- Blank out anything already stored that the constraint would reject,
    -- otherwise ADD CONSTRAINT fails on the first bad legacy row.
    UPDATE public.sites
       SET pincode = NULL
     WHERE pincode IS NOT NULL
       AND pincode !~ '^[1-9][0-9]{5}$';

    ALTER TABLE public.sites
      ADD CONSTRAINT sites_pincode_format
      CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$');
  END IF;
END $$;

COMMENT ON COLUMN public.sites.pincode IS
  'Six-digit Indian PIN for the store itself. Distinct from gst_pincode, which is the registered GST address and may differ.';

COMMENT ON COLUMN public.sites.business_type IS
  'Business type, chosen from a fixed list in Store Details. Feeds the public menu''s meta description. NOT the same as sites.type, which is the Shop/Menu product discriminator printed on the QR poster. See src/lib/store/businessTypes.ts.';

COMMENT ON COLUMN public.sites.timing IS
  'Opening hours as one display string, e.g. "9:00 AM - 11:00 PM" or "Open 24 hours". Written by a picker, never free text. See src/lib/store/storeTiming.ts.';

COMMIT;
