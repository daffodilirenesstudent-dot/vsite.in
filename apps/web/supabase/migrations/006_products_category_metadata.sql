-- ============================================================
-- Migration 006: Products — category, egg food_type, metadata
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Add category column
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Extend food_type to include 'egg' (vegetarian-but-egg)
--    Drop existing constraint and recreate with 'egg' added
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_food_type_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_food_type_check
    CHECK (food_type IN ('veg', 'egg', 'non_veg', 'unknown'));

-- 3. Add metadata JSONB for variants, toppings, and combo items
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
