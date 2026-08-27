-- ============================================================
-- Migration 005: Menu item fields + site category
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Add item classification columns to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'single'
    CHECK (item_type IN ('single', 'variant', 'combo'));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS food_type TEXT NOT NULL DEFAULT 'unknown'
    CHECK (food_type IN ('veg', 'non_veg', 'unknown'));

-- Add business category to sites (for future type expansion beyond 'cafe')
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'cafe';
