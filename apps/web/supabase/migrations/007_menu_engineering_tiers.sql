-- ============================================================
-- Migration 007: Menu Engineering owner-input tiers
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- star_rating: owner strategic priority (1 = low, 4 = top push)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS star_rating INT DEFAULT 2
    CHECK (star_rating BETWEEN 1 AND 4);

-- profit_tier: owner profitability assessment (1 = low margin, 4 = high margin)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS profit_tier INT DEFAULT 2
    CHECK (profit_tier BETWEEN 1 AND 4);

-- prep_complexity_tier: 1 = heat & serve, 2 = simple cook, 3 = made fresh, 4 = from scratch
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS prep_complexity_tier INT DEFAULT 2
    CHECK (prep_complexity_tier BETWEEN 1 AND 4);
