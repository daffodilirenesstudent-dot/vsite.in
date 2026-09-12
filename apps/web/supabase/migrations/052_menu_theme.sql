-- 052_menu_theme.sql — menu design themes + brand controls.
--
-- vsite ships THREE menu designs, not six: classic (what every menu renders
-- today), cafe, premium. The PM decision of 8 Sep 2026 treats the picker as a
-- SALES tool — it answers the "looks like a free QR tool" objection during a
-- counter demo — and explicitly refuses the six-design switcher.
--
-- ─── THE NON-NEGOTIABLE ──────────────────────────────────────────────────────
-- A theme is a CONFIG VALUE ON THE SITE ROW. It is never baked into menu data.
-- Switching a design must not touch a product row, the slug, or qr_secret.
-- Get that wrong and every future design becomes a migration — and the printed
-- standees on twenty tables stop resolving.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Idempotent throughout, following 046_gst_compliance and
-- 048_whatsapp_orders_and_currency: batched ADD COLUMN IF NOT EXISTS with
-- DB-level defaults, plus DO $$ ... pg_constraint guards for the CHECKs.
--
-- Every column needs a DEFAULT: api/onboarding/complete/route.ts sets only six
-- fields on insert, so anything without one arrives NULL on every new store.

-- ── 1. Theme + font + logo visibility ───────────────────────────────────────
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS menu_theme TEXT NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS menu_font  TEXT NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS show_logo  BOOLEAN NOT NULL DEFAULT TRUE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_menu_theme_valid') THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_menu_theme_valid
      CHECK (menu_theme IN ('classic', 'cafe', 'premium'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_menu_font_valid') THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_menu_font_valid
      CHECK (menu_font IN ('classic', 'warm', 'sharp'));
  END IF;
END $$;

-- ── 2. primary_color — repurposed, not added ────────────────────────────────
--
-- The column already existed (dashboard-created, pre-migrations) with the
-- DASHBOARD's violet as its default and not one line of application code
-- reading it. Every row in production held the untouched default, so this is a
-- free repurpose rather than a risky change of meaning.
--
-- The default moves to the shipped menu pink. Existing rows are backfilled to
-- match, so the first release that actually READS this column leaves all 56
-- live menus looking exactly as they do now.
UPDATE public.sites
   SET primary_color = '#EF59A1'
 WHERE primary_color IS NULL OR primary_color = '#5137EF';

ALTER TABLE public.sites
  ALTER COLUMN primary_color SET DEFAULT '#EF59A1';

-- Owner-supplied and rendered into a style block built with
-- dangerouslySetInnerHTML. Anything but a plain six-digit hex is a CSS
-- injection, not a colour. The app validates too; this is the backstop.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_primary_color_hex') THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_primary_color_hex
      CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;

-- ── 3. Documentation ────────────────────────────────────────────────────────
COMMENT ON COLUMN public.sites.menu_theme IS
  'Menu design: classic | cafe | premium. Config only — never affects menu data, the slug or the printed QR. Changed from onboarding or the settings Appearance tab; every change is written to admin_audit_log as menu_theme_change.';

COMMENT ON COLUMN public.sites.menu_font IS
  'Curated font pairing: classic | warm | sharp. Each pair includes a Tamil face, because the root layout loads latin-only subsets and Tamil dish names otherwise fall back to an uncontrolled system face.';

COMMENT ON COLUMN public.sites.show_logo IS
  'Whether sites.image_url is drawn on the public menu. Opt-out: most stores have no logo, and the header must read as finished without one.';

COMMENT ON COLUMN public.sites.primary_color IS
  'Owner brand colour, six-digit hex. Drawn as TEXT on a light ground (price, shop name, active chip), so the app clamps it toward 4.5:1 before rendering while keeping the raw value for fills. Was the unused dashboard violet before 052.';
