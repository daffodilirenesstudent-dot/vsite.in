import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { buildImageIndex, type ImageIndex } from '@/lib/menu/conceptMatcher';
import { logger } from '@/lib/platform/logger';

// In-process cache of the default image library.
//
// The matcher needs the whole library in memory, but it only needs the NAME of
// each image. We must never `select *` here: default_images.embedding is a
// 1536-dimension vector, roughly 4-5 MB of egress per cold start once
// serialised, which would quietly consume the Supabase free-tier allowance.
// Selecting two text columns instead keeps a refresh at ~90 KB.

export interface LibraryRow {
  /** Public storage URL. */
  imageUrl: string;
  /** Two-line copy shown on the inventory card. */
  description: string;
  /** Filename stem — what the matcher indexes, e.g. "chicken-biryani-v5". */
  name: string;
}

export interface Library {
  index: ImageIndex;
  byName: Map<string, LibraryRow>;
}

const REFRESH_MS = 15 * 60 * 1000;

let cached: Library | null = null;
let cachedAt = 0;
let inFlight: Promise<Library> | null = null;

/** "…/default-images/cafe-foods/chicken-biryani-v5.jpeg" → "chicken-biryani-v5" */
export function imageNameFromUrl(url: string): string {
  const file = url.split('/').pop() ?? '';
  return file.replace(/\.(jpeg|jpg|png|webp|avif)$/i, '');
}

async function load(): Promise<Library> {
  const { data, error } = await supabaseServer
    .from('default_images')
    .select('image_url, description');

  if (error) throw new Error(`default_images load failed: ${error.message}`);

  const byName = new Map<string, LibraryRow>();
  for (const row of (data ?? []) as Array<{ image_url: string; description: string | null }>) {
    if (!row.image_url) continue;
    const name = imageNameFromUrl(row.image_url);
    // First row wins — keeps the index deterministic if two rows collide.
    if (name && !byName.has(name)) {
      byName.set(name, { imageUrl: row.image_url, description: row.description ?? '', name });
    }
  }
  return { index: buildImageIndex(Array.from(byName.keys())), byName };
}

/**
 * The library, cached per process and refreshed lazily.
 *
 * On a refresh failure the previous snapshot is kept and served: a stale
 * library is strictly better than dropping image matching during onboarding.
 */
export async function getImageLibrary(): Promise<Library> {
  const fresh = cached !== null && Date.now() - cachedAt < REFRESH_MS;
  if (fresh) return cached as Library;
  if (inFlight) return inFlight;

  inFlight = load()
    .then((lib) => {
      cached = lib;
      cachedAt = Date.now();
      return lib;
    })
    .catch((err: unknown) => {
      if (cached) {
        logger.warn('[imageLibrary] refresh failed, serving cached snapshot', err);
        return cached;
      }
      throw err;
    })
    .finally(() => { inFlight = null; });

  return inFlight;
}

/** Test seam — drops the cache so the next call reloads. */
export function resetImageLibraryCache(): void {
  cached = null;
  cachedAt = 0;
  inFlight = null;
}
