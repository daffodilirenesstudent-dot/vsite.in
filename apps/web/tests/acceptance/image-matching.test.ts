/**
 * Acceptance: concept-based dish-image matching.
 *
 * Maps 1:1 to the acceptance criteria in docs/GOAL.md. Evidence and the root
 * cause analysis behind each case live in docs/image-matching-rnd.md.
 *
 * The library fixture is the real production set of 353 image names, so these
 * assertions exercise the same crowding (13 biryani variants, 7 "fry" dishes,
 * 56 versioned near-duplicates) that defeated the vector matcher.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  buildImageIndex,
  matchImage,
  dishConcepts,
  isNonVegImage,
  type ImageIndex,
} from '@/lib/menu/conceptMatcher';
import library from '../fixtures/defaultImageLibrary.json';

let index: ImageIndex;
beforeAll(() => { index = buildImageIndex(library as string[]); });

/** The image name a query resolves to, or null when the matcher abstains. */
const img = (q: string): string | null => {
  const r = matchImage(q, index);
  return r.decision === 'abstain' ? null : r.image;
};
/** Only a confident, specific match — generic fallbacks count as "not specific". */
const specific = (q: string): string | null => {
  const r = matchImage(q, index);
  return r.decision === 'specific' ? r.image : null;
};

// ── AC1 — Safety invariant: veg item never gets a non-veg image ──────────────
describe('AC1 — vegetarian items never receive a non-vegetarian image', () => {
  // Every one of these is a real failure observed in production today.
  const vegItems = [
    'dal fry', 'daal fry', 'dal tadka', 'veg fried rice', 'vegetable fried rice',
    'veg schezwan fried rice', 'veg schezwan noodles', 'veg soft noodles',
    'veg. noodles', 'veg. chowmein', 'veg soup', 'tomato soup',
    'sweet corn soup', 'lemon coriander soup', 'mushroom tikka', 'tandoori gobi',
    'kadai veg', 'paneer malai tikka', 'coconut uthappam', 'paneer butter masala',
    'ladies finger fry', 'cottage cheese tikka', 'veg fried rice with chilli gobi',
    'palak paneer', 'aloo paratha', 'veg biryani', 'chilli paneer', 'veg roll',
  ];

  it.each(vegItems)('“%s” is never given a non-veg image', (item) => {
    const got = img(item);
    if (got !== null) expect(isNonVegImage(got), `${item} -> ${got}`).toBe(false);
  });

  it('holds across the entire library used as queries', () => {
    const offenders: string[] = [];
    for (const name of library as string[]) {
      const q = name.replace(/-v\d[ab]?$/, '').replace(/-/g, ' ');
      const cs = dishConcepts(q);
      const queryIsVeg = cs.includes('VEG') || cs.some(c =>
        ['PANEER', 'DAL', 'GOBI', 'ALOO', 'MUSHROOM', 'OKRA', 'PALAK', 'SOYA', 'CORN'].includes(c));
      const queryIsNonVeg = cs.some(c =>
        ['CHICKEN', 'MUTTON', 'BEEF', 'PORK', 'FISH', 'PRAWN', 'CRAB', 'LOBSTER'].includes(c));
      if (!queryIsVeg || queryIsNonVeg) continue;
      const got = img(q);
      if (got && isNonVegImage(got)) offenders.push(`${q} -> ${got}`);
    }
    expect(offenders).toEqual([]);
  });
});

// ── AC2 — The reported bug ───────────────────────────────────────────────────
describe('AC2 — dal fry resolves to dal, not fish', () => {
  it('matches dal fry to the dal fry image', () => {
    expect(specific('dal fry')).toBe('dal-fry-v5');
  });
  it('matches the daal spelling too', () => {
    expect(specific('daal fry')).toBe('dal-fry-v5');
  });
  it.each(['dal fry', 'daal fry', 'dhal fry'])('“%s” never returns a fish image', (q) => {
    expect(img(q)).not.toMatch(/fish/);
  });
});

// ── AC3 — Core-ingredient integrity ─────────────────────────────────────────
describe('AC3 — the identity-bearing ingredient is never swapped', () => {
  it.each([
    ['mutton biryani', /mutton/],
    ['chicken biryani', /chicken/],
    ['prawn biryani', /prawn/],
    ['egg biryani', /egg/],
    ['veg biryani', /veg/],
  ])('“%s” keeps its own protein', (q, want) => {
    expect(specific(q)).toMatch(want);
  });

  it('mutton biryani never returns another protein’s biryani', () => {
    const got = specific('mutton biryani');
    expect(got).not.toMatch(/chicken|prawn|egg|veg|fish/);
  });

  it('paneer 65 does not return chicken 65', () => {
    expect(img('paneer 65')).not.toMatch(/chicken/);
    expect(specific('paneer 65')).toMatch(/paneer/);
  });

  it('fish fry and prawn fry stay distinct', () => {
    expect(specific('fish fry')).toBe('fish-fry');
    expect(specific('prawn fry')).toBe('prawn-fry');
  });
});

// ── AC4 — Many names, one image ─────────────────────────────────────────────
describe('AC4 — several names map to the same image', () => {
  it.each(['roti', 'rotti', 'chapati', 'chapathi', 'chapatti', 'phulka', 'fulka'])(
    '“%s” resolves to the roti image', (q) => {
      expect(specific(q)).toBe('roti-chapathi');
    });

  it.each(['curd rice', 'thayir sadam', 'thayir sadham', 'dahi rice', 'rice curd'])(
    '“%s” resolves to the curd rice image', (q) => {
      expect(specific(q)).toBe('curd-rice');
    });

  it.each([
    ['meen varuval', 'fish-fry'],
    ['kozhi biryani', 'chicken-biryani-v5'],
    ['murgh biryani', 'chicken-biryani-v5'],
    ['eral biryani', 'prawn-biriyani'],
  ])('cross-language “%s” resolves to %s', (q, want) => {
    expect(specific(q)).toBe(want);
  });
});

// ── AC5 — Partial-anchor rejection ──────────────────────────────────────────
describe('AC5 — a matching core with the wrong dish word is not confident', () => {
  it.each([
    'mutton sukka', 'chicken bhuna', 'chicken xacuti', 'mutton garlic',
    'chicken stroganoff', 'paneer bhurji',
  ])('“%s” does not confidently return a rice dish', (q) => {
    const got = img(q);
    if (got !== null) expect(got).not.toMatch(/biryani|biriyani|pulao|fried-rice/);
  });

  it('never invents a protein the query did not name', () => {
    for (const q of ['lemon', 'butter scotch', 'loaded fries', 'hot and sour soup']) {
      const got = img(q);
      if (got !== null) {
        expect(got, `${q} -> ${got}`).not.toMatch(/chicken|mutton|fish|prawn|beef/);
      }
    }
  });
});

// ── AC6 — Honest abstain ────────────────────────────────────────────────────
describe('AC6 — abstains rather than guessing', () => {
  it.each(['kulcha', 'puttu', 'vellayappam', 'sirloin steak', 'lahori khurchan', 'ragi koozh'])(
    'dish absent from the library: “%s” yields no specific match', (q) => {
      expect(specific(q)).toBeNull();
    });

  it.each(['testing', 'food name', 'meal 1', 'panga', 'extra chicken piece'])(
    'junk input “%s” yields no specific match', (q) => {
      expect(specific(q)).toBeNull();
    });

  it('returns a null image rather than throwing on empty input', () => {
    expect(matchImage('', index).decision).toBe('abstain');
    expect(matchImage('   ', index).decision).toBe('abstain');
  });
});

// ── AC7 — Typo tolerance ────────────────────────────────────────────────────
describe('AC7 — typos and transliteration variants still resolve', () => {
  it.each([
    ['chiken biriyani', 'chicken-biryani-v5'],
    ['mtton biriyani', /mutton/],
    ['chiken 65', /chicken-65/],
    ['parrota', 'parotta'],
    ['schewan veg fried rice', /veg/],
  ])('“%s” resolves correctly', (q, want) => {
    const got = specific(q);
    if (typeof want === 'string') expect(got).toBe(want);
    else expect(got).toMatch(want);
  });

  it('panner is treated as paneer and stays vegetarian', () => {
    const got = img('panner tikka');
    expect(got).not.toBeNull();
    expect(isNonVegImage(got as string)).toBe(false);
  });
});

// ── AC8 — No network at match time ──────────────────────────────────────────
describe('AC8 — matching is pure, in-process computation', () => {
  it('does not touch fetch', () => {
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = (() => { called = true; throw new Error('network not allowed'); }) as typeof fetch;
    try {
      for (const q of ['dal fry', 'mutton biryani', 'roti', 'unknown dish xyz']) matchImage(q, index);
    } finally {
      globalThis.fetch = original;
    }
    expect(called).toBe(false);
  });

  it('matches the whole library in well under a second', () => {
    const t0 = performance.now();
    for (const name of library as string[]) matchImage(name.replace(/-/g, ' '), index);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

// ── AC9 — Determinism / single source of truth ──────────────────────────────
describe('AC9 — one matcher, stable answers', () => {
  it('is deterministic across repeated calls', () => {
    for (const q of ['dal fry', 'mutton biryani', 'chicken 65', 'roti']) {
      const a = matchImage(q, index);
      const b = matchImage(q, index);
      expect(a).toEqual(b);
    }
  });

  it('is insensitive to case, padding and punctuation', () => {
    const base = specific('chicken biryani');
    for (const v of ['Chicken Biryani', '  CHICKEN   BIRYANI  ', 'chicken-biryani', 'Chicken  Biryani!']) {
      expect(specific(v)).toBe(base);
    }
  });

  it('is insensitive to word order for compositional names', () => {
    expect(specific('biryani chicken')).toBe(specific('chicken biryani'));
  });

  it('explains its decision', () => {
    const r = matchImage('dal fry', index);
    expect(r.concepts).toContain('DAL');
    expect(r.concepts).toContain('FRY');
  });
});

// ── AC11 — Synonymous preparations resolve to the same picture ──────────────
// Reported from manual testing: "bbq paneer" returned irani-bbq (a chicken
// dish) even though grill-paneer exists. BBQ and grill are the same plate.
describe('AC11 — bbq and grill are the same preparation', () => {
  it.each(['bbq paneer', 'grill paneer', 'grilled paneer', 'barbeque paneer'])(
    '“%s” resolves to the paneer grill image', (q) => {
      expect(specific(q)).toBe('grill-paneer');
    });

  it.each(['bbq paneer', 'barbeque paneer', 'bbq veg', 'grill paneer'])(
    '“%s” is never given a non-veg image', (q) => {
      const got = img(q);
      if (got !== null) expect(isNonVegImage(got), `${q} -> ${got}`).toBe(false);
    });

  it.each(['bbq chicken', 'grill chicken', 'hot bbq chicken'])(
    '“%s” still resolves to a chicken grill image', (q) => {
      expect(specific(q)).toMatch(/chicken/);
    });

  it('keeps tikka distinct from plain grilling', () => {
    // Deliberately not asserting `specific`: the library holds five paneer
    // tikka variants that tie, so a generic answer is the honest one. What
    // matters here is that tikka does not collapse into the grill family.
    expect(img('paneer tikka')).toMatch(/tikka/);
  });
});

// ── AC10 — Portion / modifier noise ─────────────────────────────────────────
describe('AC10 — portion and modifier noise does not derail the match', () => {
  it.each([
    'chicken biryani',
    'special chicken biryani full',
    'chicken biryani (serves 2)',
    'our famous chicken biryani [8 pcs]',
    'chicken biryani - quarter/half/full',
  ])('“%s” resolves to the chicken biryani image', (q) => {
    expect(specific(q)).toBe('chicken-biryani-v5');
  });
});
