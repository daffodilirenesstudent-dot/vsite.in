-- ============================================================
-- Migration: Semantic Default Image Library
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Step 1: Enable pgvector extension
-- Required for vector similarity search (cosine distance)
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Create the default_images table
CREATE TABLE IF NOT EXISTS public.default_images (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url   TEXT         NOT NULL,
  description TEXT         NOT NULL,        -- GPT-4V generated description
  embedding   vector(1536),                  -- text-embedding-3-small (1536 dims)
  category    TEXT,                          -- 'street_food', 'beverage', 'dessert', etc.
  tags        TEXT[],                        -- ['pani puri', 'spicy', 'mumbai']
  created_at  TIMESTAMPTZ  DEFAULT now()
);

-- Step 3: IVFFlat index for fast cosine similarity search
-- The 'lists' param should be roughly sqrt(expected_rows).
-- Start with 100 for libraries up to ~10,000 images.
CREATE INDEX IF NOT EXISTS default_images_embedding_idx
  ON public.default_images
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Step 4: Row-Level Security
-- Public read (any visitor/anon can look up images)
-- Authenticated insert only (admin seeding)
ALTER TABLE public.default_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "default_images_public_read"   ON public.default_images;
DROP POLICY IF EXISTS "default_images_authed_insert" ON public.default_images;

CREATE POLICY "default_images_public_read"
  ON public.default_images
  FOR SELECT
  USING (true);

CREATE POLICY "default_images_authed_insert"
  ON public.default_images
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Step 5: Vector similarity RPC function
-- Called by /api/images/match — returns the closest image above threshold.
-- SECURITY DEFINER so anon callers can still hit it through the API layer.
CREATE OR REPLACE FUNCTION public.match_default_image(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int
)
RETURNS TABLE (
  image_url   text,
  description text,
  similarity  float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    image_url,
    description,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.default_images
  WHERE embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================
-- AFTER RUNNING THIS MIGRATION:
--
-- 1. Go to Supabase Dashboard > Storage
-- 2. Create a new bucket called "default-images" (public read)
-- 3. Call POST /api/admin/seed-images with your admin token
--    to begin seeding images from that bucket into this table.
--
-- The app will gracefully show an upload box when no image
-- matches — the library improves as more images are seeded.
-- ============================================================
