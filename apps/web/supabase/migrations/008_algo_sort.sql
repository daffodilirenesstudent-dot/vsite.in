-- ============================================================
-- Migration 008: Algo-sorted menu columns
-- display_order: weighted MCDS rank (lower = shown first)
-- ks_quadrant:   Kasavana-Smith label (Star/Plowhorse/Puzzle/Dog)
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 9999,
  ADD COLUMN IF NOT EXISTS ks_quadrant   TEXT
    CHECK (ks_quadrant IN ('Star', 'Plowhorse', 'Puzzle', 'Dog'));

-- Fast sorted fetch per site
CREATE INDEX IF NOT EXISTS idx_products_site_order
  ON public.products(site_id, display_order ASC);
