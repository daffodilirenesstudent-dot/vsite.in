import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Smart Add Product: the inventory drawer in the order an owner thinks, and a
 * library photo that appears by itself once the dish is named.
 *
 * Why this order (researched 2026-09-24; Shopify, YouTube Studio, Square,
 * Baymard, NN/g):
 *
 *   1. NAME FIRST. Everything else keys off it — the photo match today, and
 *      it is the one field every owner can fill without thinking. The old
 *      drawer put the "Use Professional Image" button ABOVE the name it needs,
 *      so pressing it first always failed with "Enter a product name first".
 *   2. PHOTO SECOND, filled from the name, so the owner sees it immediately.
 *   3. REQUIRED BEFORE OPTIONAL: veg/non-veg, category, price; then the
 *      optional description; then visibility beside the save button.
 *   4. PRODUCT TYPE IS A PRICING QUESTION. Single / sizes / combo only changes
 *      how the item is priced, and nearly every café item is a single item,
 *      so three big cards at the top made every owner stop for a rare case.
 *
 * Why suggest-in-form and not attach-silently-at-save: the owner must see a
 * photo before diners do. The matcher can return a GENERIC photo for a dish
 * family, and NN/g's defaults research says a plausible automatic value is
 * exactly the one people accept without checking.
 *
 * Why no veg/non-veg default: users keep defaults. The old default was
 * Non-Vegetarian, so an owner who skipped it listed Paneer Butter Masala as
 * non-veg — the one mistake a Tamil Nadu diner will not forgive.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');
const read = (p: string) => (existsSync(join(SRC, p)) ? readFileSync(join(SRC, p), 'utf8') : '');
/**
 * Match on shipped code, not on comments that name the old behaviour. A block
 * comment must start after whitespace or `{` (JSX), so `accept="image/*"` is
 * not mistaken for one and made to swallow the code after it.
 */
const shipped = (p: string) => read(p).replace(/(^|[\s{])\/\*[\s\S]*?\*\//g, '$1').replace(/\/\/[^\n]*/g, '');

const PAGE = 'app/manage/product-inventory/page.tsx';
const SLOT = 'components/manage/ProductPhotoSlot.tsx';
const HOOK = 'hooks/usePhotoSuggestion.ts';
const CSS = 'app/globals.css';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.resetModules();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC1 — flag
// ─────────────────────────────────────────────────────────────────────────────

describe('AC1: flag', () => {
    it('is OFF when the env var is missing', async () => {
        vi.stubEnv('NEXT_PUBLIC_SMART_ADD_PRODUCT', '');
        const m = await import('@/lib/menu/productForm');
        expect(m.SMART_ADD_PRODUCT).toBe(false);
    });

    it('is OFF for anything but the exact value "true"', async () => {
        vi.stubEnv('NEXT_PUBLIC_SMART_ADD_PRODUCT', '1');
        const m = await import('@/lib/menu/productForm');
        expect(m.SMART_ADD_PRODUCT).toBe(false);
    });

    it('is ON for "true"', async () => {
        vi.stubEnv('NEXT_PUBLIC_SMART_ADD_PRODUCT', 'true');
        const m = await import('@/lib/menu/productForm');
        expect(m.SMART_ADD_PRODUCT).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 / AC3 — order
// ─────────────────────────────────────────────────────────────────────────────

describe('AC2: the drawer asks in the order an owner thinks', () => {
    it('is name, photo, veg/non-veg, category, pricing, description, visibility', async () => {
        const { SMART_FORM_ORDER } = await import('@/lib/menu/productForm');
        expect([...SMART_FORM_ORDER]).toEqual([
            'name', 'photo', 'dishType', 'category', 'pricing', 'description', 'visibility',
        ]);
    });

    it('the page renders the drawer from that order, not from a hand-kept copy', () => {
        expect(shipped(PAGE)).toMatch(/SMART_FORM_ORDER\.map\(/);
    });

    it('focuses the name when adding a new product', () => {
        expect(shipped(PAGE)).toMatch(/autoFocus=\{!editingProduct\}/);
    });
});

describe('AC3: product type is part of pricing', () => {
    it('is not a step of its own', async () => {
        const { SMART_FORM_ORDER } = await import('@/lib/menu/productForm');
        expect(SMART_FORM_ORDER as readonly string[]).not.toContain('productType');
    });

    it('offers the three pricing modes in plain words, single price first', async () => {
        const { PRICING_MODES } = await import('@/lib/menu/productForm');
        expect(PRICING_MODES.map(m => m.value)).toEqual(['Single Item', 'Variants', 'Combo']);
        for (const m of PRICING_MODES) expect(m.label.length).toBeGreaterThan(0);
    });

    it('the pricing section carries the switch', () => {
        expect(shipped(PAGE)).toMatch(/<ProductTypeSwitch\b/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC4 — veg / non-veg is a choice, not a default
// ─────────────────────────────────────────────────────────────────────────────

describe('AC4: veg or non-veg must be chosen', () => {
    it('starts empty for a new product when the flag is on', async () => {
        const { initialDishType } = await import('@/lib/menu/productForm');
        expect(initialDishType(true)).toBe('');
    });

    it('refuses to save without it, with a message that says what to do', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        expect(validateProductForm({ name: 'Paneer Butter Masala', sellingPrice: '180', dishType: '' }, { requireDishType: true }))
            .toBe('Choose Veg or Non-veg');
    });

    it('saves once it is chosen', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        expect(validateProductForm({ name: 'Paneer Butter Masala', sellingPrice: '180', dishType: 'Vegetarian' }, { requireDishType: true }))
            .toBeNull();
    });

    it('still asks for the name before anything else', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        expect(validateProductForm({ name: '  ', sellingPrice: '', dishType: '' }, { requireDishType: true }))
            .toBe('Product name is required');
    });

    it('the page validates through it', () => {
        expect(shipped(PAGE)).toMatch(/validateProductForm\(/);
        expect(shipped(PAGE)).toMatch(/initialDishType\(/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC5 / AC6 / AC7 / AC10 — the suggestion pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe('AC6: when to suggest', () => {
    it('needs at least three letters of dish name', async () => {
        const { shouldAutoSuggest } = await import('@/lib/menu/photoSuggest');
        expect(shouldAutoSuggest({ name: 'Ch', source: 'none', dismissed: false, lastQuery: null })).toBe(false);
        expect(shouldAutoSuggest({ name: 'Tea', source: 'none', dismissed: false, lastQuery: null })).toBe(true);
    });

    it('never replaces the owner\'s own photo', async () => {
        const { shouldAutoSuggest } = await import('@/lib/menu/photoSuggest');
        expect(shouldAutoSuggest({ name: 'Masala Chai', source: 'own', dismissed: false, lastQuery: null })).toBe(false);
    });

    it('stops once the owner has removed a suggestion', async () => {
        const { shouldAutoSuggest } = await import('@/lib/menu/photoSuggest');
        expect(shouldAutoSuggest({ name: 'Masala Chai', source: 'none', dismissed: true, lastQuery: null })).toBe(false);
    });

    it('does not look up the same name twice', async () => {
        const { shouldAutoSuggest } = await import('@/lib/menu/photoSuggest');
        expect(shouldAutoSuggest({ name: '  masala   CHAI ', source: 'library', dismissed: false, lastQuery: 'masala chai' })).toBe(false);
    });

    it('re-matches a library photo when the name changes', async () => {
        const { shouldAutoSuggest } = await import('@/lib/menu/photoSuggest');
        expect(shouldAutoSuggest({ name: 'Mutton Biryani', source: 'library', dismissed: false, lastQuery: 'biryani' })).toBe(true);
    });

    it('treats a product\'s saved photo as the owner\'s', async () => {
        const { photoSourceOf } = await import('@/lib/menu/photoSuggest');
        expect(photoSourceOf('https://x/product-images/a.jpg', false)).toBe('own');
        expect(photoSourceOf('https://x/default-images/tea.jpg', true)).toBe('library');
        expect(photoSourceOf(null, false)).toBe('none');
    });
});

type State = { status: string; query?: string; url?: string };

async function makeSuggester(opts: {
    lookup?: (q: string, signal: AbortSignal) => Promise<string | null>;
    preload?: (url: string) => Promise<void>;
} = {}) {
    vi.useFakeTimers();
    const { createPhotoSuggester, SUGGEST_DEBOUNCE_MS, SUGGEST_MIN_SEARCH_MS } = await import('@/lib/menu/photoSuggest');
    const lookups: string[] = [];
    const states: State[] = [];
    const lookup = vi.fn(async (q: string, signal: AbortSignal) => {
        lookups.push(q);
        return opts.lookup ? opts.lookup(q, signal) : `https://lib/${q.replace(/ /g, '-')}.jpg`;
    });
    const suggester = createPhotoSuggester(
        { lookup, preload: opts.preload ?? (async () => {}), now: () => Date.now() },
        s => states.push(s as State),
    );
    return { suggester, lookups, states, lookup, DEBOUNCE: SUGGEST_DEBOUNCE_MS, HOLD: SUGGEST_MIN_SEARCH_MS };
}

const last = (states: State[]) => states[states.length - 1];

const revealRule = () => read(CSS).match(/\.vs-photo-reveal\s*\{[^}]*\}/)?.[0] ?? '';

function revealCurve(): [number, number, number, number] {
    const m = revealRule().match(/cubic-bezier\(([^)]+)\)/);
    if (!m) throw new Error('.vs-photo-reveal has no cubic-bezier easing');
    const [x1, y1, x2, y2] = m[1].split(',').map(Number);
    return [x1, y1, x2, y2];
}

/** CSS cubic-bezier: animation progress at time fraction `t` (bisection on x). */
function bezierProgress([x1, y1, x2, y2]: [number, number, number, number], t: number): number {
    const at = (a: number, b: number, s: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s ** 2 * b + s ** 3;
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (at(x1, x2, mid) < t) lo = mid; else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
}

describe('AC5: the lookup follows the name', () => {
    it('waits for the owner to pause, then looks up the name once', async () => {
        const { suggester, lookups, DEBOUNCE } = await makeSuggester();
        suggester.request('Mas');
        await vi.advanceTimersByTimeAsync(100);
        suggester.request('Masala');
        await vi.advanceTimersByTimeAsync(100);
        suggester.request('Masala Chai');
        await vi.advanceTimersByTimeAsync(DEBOUNCE - 1);
        expect(lookups).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);
        expect(lookups).toEqual(['masala chai']);
    });

    it('announces the search, then the photo', async () => {
        const { suggester, states, DEBOUNCE, HOLD } = await makeSuggester();
        suggester.request('Masala Chai');
        await vi.advanceTimersByTimeAsync(DEBOUNCE + HOLD);
        expect(states.map(s => s.status)).toEqual(['searching', 'found']);
        expect(last(states)).toMatchObject({ query: 'masala chai', url: 'https://lib/masala-chai.jpg' });
    });

    it('does not ask for fewer than three letters', async () => {
        const { suggester, lookups, DEBOUNCE } = await makeSuggester();
        suggester.request('Ch');
        await vi.advanceTimersByTimeAsync(DEBOUNCE * 3);
        expect(lookups).toEqual([]);
    });
});

describe('AC7: a late answer for an old name is thrown away', () => {
    it('never shows the dal fry answer once the owner typed fish fry', async () => {
        let releaseDal: (v: string) => void = () => {};
        const { suggester, states, DEBOUNCE, HOLD } = await makeSuggester({
            lookup: (q) => q === 'dal fry'
                ? new Promise<string>(r => { releaseDal = r; })
                : Promise.resolve('https://lib/fish-fry.jpg'),
        });
        suggester.request('Dal Fry');
        await vi.advanceTimersByTimeAsync(DEBOUNCE);           // dal fry in flight
        suggester.request('Fish Fry');
        await vi.advanceTimersByTimeAsync(DEBOUNCE + HOLD);    // fish fry done
        releaseDal('https://lib/dal-fry.jpg');                 // dal fry lands late
        await vi.advanceTimersByTimeAsync(HOLD * 2);
        expect(states.filter(s => s.status === 'found').map(s => s.url)).toEqual(['https://lib/fish-fry.jpg']);
    });

    it('cancel() drops a pending lookup', async () => {
        const { suggester, lookups, DEBOUNCE } = await makeSuggester();
        suggester.request('Masala Chai');
        suggester.cancel();
        await vi.advanceTimersByTimeAsync(DEBOUNCE * 2);
        expect(lookups).toEqual([]);
    });
});

describe('AC8: the photo appears softly, never as a flash', () => {
    it('holds the searching state for a moment even when the answer is instant', async () => {
        const { suggester, states, DEBOUNCE, HOLD } = await makeSuggester();
        suggester.request('Masala Chai');
        await vi.advanceTimersByTimeAsync(DEBOUNCE + HOLD - 1);
        expect(last(states).status).toBe('searching');
        await vi.advanceTimersByTimeAsync(1);
        expect(last(states).status).toBe('found');
    });

    it('waits for the photo to load before showing it', async () => {
        let loaded: () => void = () => {};
        const { suggester, states, DEBOUNCE, HOLD } = await makeSuggester({
            preload: () => new Promise<void>(r => { loaded = r; }),
        });
        suggester.request('Masala Chai');
        await vi.advanceTimersByTimeAsync(DEBOUNCE + HOLD * 4);
        expect(last(states).status).toBe('searching');
        loaded();
        await vi.advanceTimersByTimeAsync(0);
        expect(last(states).status).toBe('found');
    });

    it('treats a photo that will not load as no match', async () => {
        const { suggester, states, DEBOUNCE, HOLD } = await makeSuggester({
            preload: () => Promise.reject(new Error('404')),
        });
        suggester.request('Masala Chai');
        await vi.advanceTimersByTimeAsync(DEBOUNCE + HOLD);
        expect(last(states)).toMatchObject({ status: 'none', query: 'masala chai' });
    });

    it('uses timings inside the researched ranges', async () => {
        const { SUGGEST_DEBOUNCE_MS, SUGGEST_MIN_SEARCH_MS } = await import('@/lib/menu/photoSuggest');
        expect(SUGGEST_DEBOUNCE_MS).toBeGreaterThanOrEqual(400);
        expect(SUGGEST_DEBOUNCE_MS).toBeLessThanOrEqual(1000);
        expect(SUGGEST_MIN_SEARCH_MS).toBeGreaterThanOrEqual(300);
        expect(SUGGEST_MIN_SEARCH_MS).toBeLessThanOrEqual(800);
    });

    it('the reveal is 200–500 ms (NN/g)', () => {
        const ms = Number(revealRule().match(/(\d+)ms/)?.[1] ?? NaN);
        expect(ms).toBeGreaterThanOrEqual(200);
        expect(ms).toBeLessThanOrEqual(500);
    });

    /**
     * Measured in the browser, 2026-09-24: on Material's emphasized-DECELERATE
     * curve the photo was 63% opaque 50 ms in — three frames — which reads as
     * the pop the owner asked us to avoid. That curve is built for things that
     * must land fast. The photo should start softly and still settle firmly.
     */
    it('starts softly: under a third of the way in the first tenth of the time', () => {
        expect(bezierProgress(revealCurve(), 0.1)).toBeLessThan(0.3);
    });

    it('still settles decisively: most of the way by the halfway point', () => {
        expect(bezierProgress(revealCurve(), 0.5)).toBeGreaterThan(0.6);
    });

    it('drops the movement under reduced motion', () => {
        const blocks = read(CSS).match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g) ?? [];
        expect(blocks.some(b => b.includes('.vs-photo-reveal'))).toBe(true);
    });

    it('the slot reveals only after its own image has decoded, and says so to screen readers', () => {
        const slot = shipped(SLOT);
        expect(slot).toMatch(/\.decode\(/);
        expect(slot).toMatch(/vs-photo-reveal/);
        expect(slot).toMatch(/aria-live="polite"/);
    });
});

describe('AC9: save finishes the lookup the owner did not wait for', () => {
    it('runs it straight away instead of waiting for the pause', async () => {
        const { suggester, lookups } = await makeSuggester();
        const url = await suggester.resolveForSave('Masala Chai');
        expect(lookups).toEqual(['masala chai']);
        expect(url).toBe('https://lib/masala-chai.jpg');
    });

    it('reuses an answer it already has', async () => {
        const { suggester, lookups, DEBOUNCE, HOLD } = await makeSuggester();
        suggester.request('Masala Chai');
        await vi.advanceTimersByTimeAsync(DEBOUNCE + HOLD);
        const url = await suggester.resolveForSave('masala chai');
        expect(lookups).toEqual(['masala chai']);
        expect(url).toBe('https://lib/masala-chai.jpg');
    });

    it('joins a lookup already in flight rather than starting another', async () => {
        let release: (v: string) => void = () => {};
        const { suggester, lookups, DEBOUNCE } = await makeSuggester({
            lookup: () => new Promise<string>(r => { release = r; }),
        });
        suggester.request('Masala Chai');
        await vi.advanceTimersByTimeAsync(DEBOUNCE);
        const pending = suggester.resolveForSave('Masala Chai');
        release('https://lib/masala-chai.jpg');
        expect(await pending).toBe('https://lib/masala-chai.jpg');
        expect(lookups).toEqual(['masala chai']);
    });

    it('the page asks for it when saving with no photo', () => {
        expect(shipped(PAGE)).toMatch(/resolveForSave\(/);
    });
});

describe('AC10: a failed lookup is silent and never blocks saving', () => {
    it('a lookup that throws ends as no match', async () => {
        const { suggester, states, DEBOUNCE, HOLD } = await makeSuggester({
            lookup: () => Promise.reject(new Error('network')),
        });
        suggester.request('Masala Chai');
        await vi.advanceTimersByTimeAsync(DEBOUNCE + HOLD);
        expect(last(states)).toMatchObject({ status: 'none' });
    });

    it('save gets null, not an error', async () => {
        const { suggester } = await makeSuggester({ lookup: () => Promise.reject(new Error('network')) });
        await expect(suggester.resolveForSave('Masala Chai')).resolves.toBeNull();
    });

    it('fetchLibraryPhoto posts the name to the library match route', async () => {
        const { fetchLibraryPhoto } = await import('@/lib/menu/photoSuggest');
        const calls: Array<[string, RequestInit | undefined]> = [];
        const fetchImpl = (async (url: string, init?: RequestInit) => {
            calls.push([url, init]);
            return new Response(JSON.stringify({ image_url: 'https://lib/tea.jpg' }), { status: 200 });
        }) as unknown as typeof fetch;
        expect(await fetchLibraryPhoto('masala chai', { fetchImpl })).toBe('https://lib/tea.jpg');
        expect(calls[0][0]).toBe('/api/images/match');
        expect(calls[0][1]?.method).toBe('POST');
        expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ query: 'masala chai' });
    });

    it('fetchLibraryPhoto returns null when the library abstains, errors or is unreachable', async () => {
        const { fetchLibraryPhoto } = await import('@/lib/menu/photoSuggest');
        const reply = (body: unknown, status = 200) =>
            (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
        expect(await fetchLibraryPhoto('dal fry', { fetchImpl: reply({ image_url: null }) })).toBeNull();
        expect(await fetchLibraryPhoto('dal fry', { fetchImpl: reply({ error: 'x' }, 500) })).toBeNull();
        const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        expect(await fetchLibraryPhoto('dal fry', { fetchImpl: down })).toBeNull();
    });

    it('the hook wires the real lookup and preload', () => {
        const hook = shipped(HOOK);
        expect(hook).toMatch(/createPhotoSuggester\(/);
        expect(hook).toMatch(/fetchLibraryPhoto/);
        expect(hook).toMatch(/preloadPhoto/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC11 — flag off is today's drawer
// ─────────────────────────────────────────────────────────────────────────────

describe('AC11: with the flag off the drawer is unchanged', () => {
    it('keeps the Non-Vegetarian default', async () => {
        const { initialDishType } = await import('@/lib/menu/productForm');
        expect(initialDishType(false)).toBe('Non-Vegetarian');
    });

    it('does not require a dish type', async () => {
        const { validateProductForm } = await import('@/lib/menu/productForm');
        expect(validateProductForm({ name: 'Tea', sellingPrice: '20', dishType: '' }, { requireDishType: false }))
            .toBeNull();
    });

    it('keeps the manual library button and the product type cards', () => {
        const page = shipped(PAGE);
        expect(page).toMatch(/Use Professional Image/);
        expect(page).toMatch(/PRODUCT_TYPES\.map\(/);
    });

    it('chooses between the two drawers on the flag', () => {
        expect(shipped(PAGE)).toMatch(/SMART_ADD_PRODUCT\s*\?/);
    });
});
