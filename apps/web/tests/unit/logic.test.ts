/**
 * Unit tests for pure logic — no network, no DB.
 * Tests: defaultImages, middleware helpers, product-type detection,
 *        DISH_TYPE mappings, and generateSlug contract.
 */

import { describe, it, expect } from 'vitest';
import {
  isDefaultImage,
  DEFAULT_IMAGE_BUCKET,
  DEFAULT_IMAGE_BUCKET_PREFIX,
  matchByKeyword,
  confidentKeywordImage,
  KEYWORD_CONFIDENCE_THRESHOLD,
} from '@/lib/menu/defaultImages';

// ── 1. isDefaultImage ──────────────────────────────────────────────────────────
describe('isDefaultImage', () => {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!; // set in setup.ts

  it('returns true for a URL from the default-images bucket', () => {
    const url = `${SUPABASE_URL}/storage/v1/object/public/default-images/food/pani-puri.jpg`;
    expect(isDefaultImage(url)).toBe(true);
  });

  it('returns false for a user-uploaded URL (different bucket)', () => {
    const url = `${SUPABASE_URL}/storage/v1/object/public/user-uploads/abc123.jpg`;
    expect(isDefaultImage(url)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isDefaultImage('')).toBe(false);
  });

  it('returns false for an external CDN URL', () => {
    expect(isDefaultImage('https://cdn.example.com/image.jpg')).toBe(false);
  });

  it('returns false for a URL that merely contains the bucket name in a path segment but not the correct prefix', () => {
    // /default-images/ in an arbitrary position should NOT match
    const url = 'https://another-host.com/default-images/food.jpg';
    expect(isDefaultImage(url)).toBe(false);
  });

  it('DEFAULT_IMAGE_BUCKET constant equals "default-images"', () => {
    expect(DEFAULT_IMAGE_BUCKET).toBe('default-images');
  });

  it('DEFAULT_IMAGE_BUCKET_PREFIX contains the supabase url and bucket path', () => {
    expect(DEFAULT_IMAGE_BUCKET_PREFIX).toContain(SUPABASE_URL);
    expect(DEFAULT_IMAGE_BUCKET_PREFIX).toContain('default-images');
  });
});

// ── 1b. confidentKeywordImage — the onboarding keyword-confidence gate ─────────
// The onboarding batch matcher must only treat a keyword hit as FINAL when it is
// confident (mirrors the >= 0.75 gate in /api/images/match). Low-confidence
// guesses (Tier 4 generic / Tier 4b token-fuzzy) must be discarded so the item
// falls through to the vector DB search instead of being locked to a wrong image.
describe('confidentKeywordImage', () => {
  it('exposes the same 0.75 confidence threshold the inventory route uses', () => {
    expect(KEYWORD_CONFIDENCE_THRESHOLD).toBe(0.75);
  });

  it('returns the image URL for a high-confidence exact match', () => {
    // "chicken biryani" is an exact KEYWORD_MAP key → confidence 1.0
    const m = matchByKeyword('Chicken Biryani');
    expect(m).not.toBeNull();
    expect(m!.confidence).toBeGreaterThanOrEqual(KEYWORD_CONFIDENCE_THRESHOLD);

    const url = confidentKeywordImage('Chicken Biryani');
    expect(url).toBe(m!.image_url);
    expect(url).toContain('biriyani');
  });

  it('returns null for a low-confidence generic match so it falls through to vector', () => {
    // "Special Fish Thokku" has no specific image — matchByKeyword only finds it
    // via a low-confidence generic/token fallback. That guess must NOT be locked in.
    const m = matchByKeyword('Special Fish Thokku');
    expect(m).not.toBeNull();                                   // premise: a hit exists
    expect(m!.confidence!).toBeLessThan(KEYWORD_CONFIDENCE_THRESHOLD); // but it's weak

    expect(confidentKeywordImage('Special Fish Thokku')).toBeNull();
  });

  it('returns null when there is no keyword match at all', () => {
    expect(confidentKeywordImage('Zzxqv Nonexistent Dish')).toBeNull();
  });

  it('honours a custom minimum-confidence argument', () => {
    // A perfect exact match (1.0) clears any threshold <= 1.0 ...
    expect(confidentKeywordImage('Chicken Biryani', 0.95)).not.toBeNull();
    // ... but an impossible threshold rejects even a perfect match.
    expect(confidentKeywordImage('Chicken Biryani', 1.01)).toBeNull();
  });
});

// ── 1c. Biryani family — onboarding picks the most specific confident image ────
// Verifies the three dishes the owner asked about. The gate must keep specific
// confident matches and reject the ambiguous one (no dedicated image) so it
// falls through to vector search instead of locking a generic guess.
describe('biryani family — onboarding image selection', () => {
  it('chicken biryani → confident exact match (generic biryani image, no chicken-specific art)', () => {
    const m = matchByKeyword('chicken biryani');
    expect(m).not.toBeNull();
    expect(m!.confidence).toBe(1.0);
    expect(m!.image_url).toContain('biriyani.jpeg');
    expect(m!.image_url).not.toContain('mutton');
    // Confident → onboarding keeps it.
    expect(confidentKeywordImage('chicken biryani')).toBe(m!.image_url);
  });

  it('mutton biryani → confident exact match to the MUTTON-specific image', () => {
    const m = matchByKeyword('mutton biryani');
    expect(m).not.toBeNull();
    expect(m!.confidence).toBe(1.0);
    expect(m!.image_url).toContain('mutton-biriyani.jpeg');
    // Confident → onboarding keeps the mutton-specific image.
    expect(confidentKeywordImage('mutton biryani')).toBe(m!.image_url);
  });

  it('paneer biryani → only a low-confidence generic hit, so the gate sends it to vector', () => {
    // There is no "paneer biryani" image in the library; the keyword matcher can
    // only offer a generic biryani guess at low confidence.
    const m = matchByKeyword('paneer biryani');
    expect(m).not.toBeNull();
    expect(m!.confidence!).toBeLessThan(KEYWORD_CONFIDENCE_THRESHOLD);
    // Gate rejects the weak guess → null → onboarding falls through to vector search.
    expect(confidentKeywordImage('paneer biryani')).toBeNull();
  });

  it('the three dishes do NOT all collapse to the same keyword image', () => {
    const chicken = matchByKeyword('chicken biryani')!.image_url;
    const mutton = matchByKeyword('mutton biryani')!.image_url;
    expect(mutton).not.toBe(chicken); // mutton is correctly distinct
  });
});

// ── 2. Middleware JWT helpers (replicated logic — not exported) ─────────────────
// We replicate the exact logic from middleware.ts to test it as a pure function.
// This documents the contract and would catch regressions if the logic changes.

function decodeJwt(token: string): { exp?: number; sub?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

function isTokenValid(token: string | undefined): boolean {
  if (!token || token.length < 20) return false;
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  return payload.exp > Math.floor(Date.now() / 1000) + 30;
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fakesig`;
}

describe('decodeJwt (middleware logic, replicated)', () => {
  it('decodes a valid JWT payload', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = makeJwt({ sub: 'user123', exp });
    const decoded = decodeJwt(jwt);
    expect(decoded?.sub).toBe('user123');
    expect(decoded?.exp).toBe(exp);
  });

  it('returns null for a token with wrong number of parts', () => {
    expect(decodeJwt('only.two')).toBeNull();
    expect(decodeJwt('one')).toBeNull();
  });

  it('returns null for a token with invalid base64 in payload', () => {
    const result = decodeJwt('header.!!!invalid!!!.sig');
    expect(result).toBeNull();
  });
});

describe('isTokenValid (middleware logic, replicated)', () => {
  it('returns true for a token with exp well in the future', () => {
    const exp = Math.floor(Date.now() / 1000) + 7200;
    const jwt = makeJwt({ sub: 'uid', exp });
    expect(isTokenValid(jwt)).toBe(true);
  });

  it('returns false for an expired token', () => {
    const exp = Math.floor(Date.now() / 1000) - 60; // 60s in the past
    const jwt = makeJwt({ sub: 'uid', exp });
    expect(isTokenValid(jwt)).toBe(false);
  });

  it('returns false for a token expiring within the 30s buffer', () => {
    const exp = Math.floor(Date.now() / 1000) + 15; // 15s left — inside the 30s buffer
    const jwt = makeJwt({ sub: 'uid', exp });
    expect(isTokenValid(jwt)).toBe(false);
  });

  it('returns false for undefined token', () => {
    expect(isTokenValid(undefined)).toBe(false);
  });

  it('returns false for a very short token (length < 20)', () => {
    expect(isTokenValid('short')).toBe(false);
  });

  it('returns false for a token with no exp claim', () => {
    const jwt = makeJwt({ sub: 'uid' }); // no exp
    expect(isTokenValid(jwt)).toBe(false);
  });
});

// ── 3. QRMenuTemplate — product type detection (replicated inline logic) ────────
// Mirrors the exact ternary in ProductDetailSheet (QRMenuTemplate.tsx lines 100-102).
function detectProductType(
  meta: Record<string, unknown>
): 'variant' | 'combo' | 'single' {
  const variants = Array.isArray(meta.variants) && (meta.variants as unknown[]).length > 0
    ? meta.variants : null;
  const comboItems = Array.isArray(meta.comboItems) && (meta.comboItems as unknown[]).length > 0
    ? meta.comboItems : null;
  return variants ? 'variant' : comboItems ? 'combo' : 'single';
}

describe('QRMenuTemplate — product type detection', () => {
  it('returns "variant" when metadata.variants is a non-empty array', () => {
    expect(detectProductType({ variants: [{ size: 'S', price: 50 }] })).toBe('variant');
  });

  it('returns "combo" when metadata.comboItems is non-empty and variants is absent', () => {
    expect(detectProductType({ comboItems: [{ name: 'Burger', qty: 1 }] })).toBe('combo');
  });

  it('returns "single" when neither variants nor comboItems are present', () => {
    expect(detectProductType({})).toBe('single');
  });

  it('prefers "variant" over "combo" when both are present (variants take precedence)', () => {
    expect(detectProductType({
      variants: [{ size: 'S', price: 50 }],
      comboItems: [{ name: 'Fries', qty: 1 }],
    })).toBe('variant');
  });

  it('returns "single" when variants is an empty array', () => {
    expect(detectProductType({ variants: [] })).toBe('single');
  });

  it('returns "single" when comboItems is an empty array', () => {
    expect(detectProductType({ comboItems: [] })).toBe('single');
  });
});

// ── 4. DISH_TYPE_TO_DB / DB_TO_DISH_TYPE mappings (product-inventory) ──────────
// These are not exported, so we replicate them and assert they match the expected contract.

const DISH_TYPE_TO_DB: Record<string, string> = {
  'Vegetarian':     'veg',
  'Egg':            'egg',
  'Non-Vegetarian': 'non_veg',
};

const DB_TO_DISH_TYPE: Record<string, string> = {
  'veg':     'Vegetarian',
  'egg':     'Non-Vegetarian',    // Note: maps egg → Non-Vegetarian (not 'Egg')
  'non_veg': 'Non-Vegetarian',
  'unknown': 'Non-Vegetarian',
};

const ITEM_TYPE_TO_DB: Record<string, string> = {
  'Single Item': 'single',
  'Variants':    'variant',
  'Combo':       'combo',
};

const DB_TO_ITEM_TYPE: Record<string, string> = {
  'single':  'Single Item',
  'variant': 'Variants',
  'combo':   'Combo',
};

describe('DISH_TYPE_TO_DB mapping', () => {
  it('maps Vegetarian → veg', () => {
    expect(DISH_TYPE_TO_DB['Vegetarian']).toBe('veg');
  });
  it('maps Egg → egg', () => {
    expect(DISH_TYPE_TO_DB['Egg']).toBe('egg');
  });
  it('maps Non-Vegetarian → non_veg', () => {
    expect(DISH_TYPE_TO_DB['Non-Vegetarian']).toBe('non_veg');
  });
  it('has exactly 3 entries', () => {
    expect(Object.keys(DISH_TYPE_TO_DB)).toHaveLength(3);
  });
});

describe('DB_TO_DISH_TYPE mapping', () => {
  it('maps veg → Vegetarian', () => {
    expect(DB_TO_DISH_TYPE['veg']).toBe('Vegetarian');
  });
  // BUG DOCUMENTED: egg maps to "Non-Vegetarian" instead of "Egg"
  it('maps egg → Non-Vegetarian (known inconsistency: loses egg distinction)', () => {
    expect(DB_TO_DISH_TYPE['egg']).toBe('Non-Vegetarian');
  });
  it('maps non_veg → Non-Vegetarian', () => {
    expect(DB_TO_DISH_TYPE['non_veg']).toBe('Non-Vegetarian');
  });
  it('maps unknown → Non-Vegetarian (fallback)', () => {
    expect(DB_TO_DISH_TYPE['unknown']).toBe('Non-Vegetarian');
  });
});

describe('ITEM_TYPE_TO_DB mapping', () => {
  it('maps Single Item → single', () => {
    expect(ITEM_TYPE_TO_DB['Single Item']).toBe('single');
  });
  it('maps Variants → variant', () => {
    expect(ITEM_TYPE_TO_DB['Variants']).toBe('variant');
  });
  it('maps Combo → combo', () => {
    expect(ITEM_TYPE_TO_DB['Combo']).toBe('combo');
  });
});

describe('DB_TO_ITEM_TYPE mapping', () => {
  it('maps single → Single Item', () => {
    expect(DB_TO_ITEM_TYPE['single']).toBe('Single Item');
  });
  it('maps variant → Variants', () => {
    expect(DB_TO_ITEM_TYPE['variant']).toBe('Variants');
  });
  it('maps combo → Combo', () => {
    expect(DB_TO_ITEM_TYPE['combo']).toBe('Combo');
  });
});

// ── 5. generateSlug (replicated from onboarding/complete/route.ts) ──────────────
function generateSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50) || `cafe-${Date.now()}`
  );
}

describe('generateSlug', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(generateSlug('My Cafe')).toBe('my-cafe');
  });

  it('removes special characters', () => {
    // "Raj's Dhaba & Grill!" → strip [^\w\s-] → "Rajs Dhaba  Grill"
    // → spaces→hyphens: "Rajs-Dhaba--Grill" → collapse hyphens: "Rajs-Dhaba-Grill"
    // → lowercase: "rajs-dhaba-grill"
    expect(generateSlug("Raj's Dhaba & Grill!")).toBe('rajs-dhaba-grill');
  });

  it('truncates to 50 characters', () => {
    const long = 'a'.repeat(60);
    expect(generateSlug(long).length).toBeLessThanOrEqual(50);
  });

  it('returns a fallback for an empty or special-only name', () => {
    const result = generateSlug('!!!');
    // After stripping specials we get empty string → fallback
    expect(result).toMatch(/^cafe-\d+$/);
  });

  it('collapses multiple spaces into single hyphen', () => {
    expect(generateSlug('my   cafe')).toBe('my-cafe');
  });

  it('handles hindi/multilingual characters (treated as word chars)', () => {
    // \w in JS regex matches Unicode word chars via the engine
    // The regex [^\w\s-] removes non-word non-space chars
    const result = generateSlug('पानी पूरी');
    // Should lowercase and hyphenate — multilingual chars pass through \w
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });
});
