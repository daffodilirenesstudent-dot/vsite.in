/**
 * Library photo suggestion for the Add Product drawer.
 *
 * Once the owner has named the dish, we look it up in our curated food photo
 * library (POST /api/images/match — in-process matching, no AI call, no cost)
 * and put the match in the photo slot, where the owner sees it BEFORE saving.
 * They can keep it, remove it or upload their own.
 *
 * Framework-free on purpose: the rules that matter — wait for a pause in
 * typing, never let an old name's answer land on a new name, never flash the
 * photo in, never block a save — are all timing, and are tested here with fake
 * timers rather than through React. `usePhotoSuggestion` is a thin wrapper.
 */

export const SUGGEST_MIN_CHARS = 3;
/** Wait for a pause in typing before looking up (keystrokes are not searches). */
export const SUGGEST_DEBOUNCE_MS = 700;
/**
 * The searching shimmer is held at least this long. The library answers in a
 * few milliseconds; a photo that snaps in mid-keystroke startles, while one
 * that visibly arrives reads as the product doing something for the owner.
 */
export const SUGGEST_MIN_SEARCH_MS = 450;
/** Give up quietly after this long; the slot stays an upload box. */
export const SUGGEST_TIMEOUT_MS = 6000;

/** Where the photo in the slot came from. A product's saved photo counts as the owner's. */
export type PhotoSource = 'none' | 'own' | 'library';

export function normalizeDishQuery(name: string): string {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function photoSourceOf(imagePreview: string | null, isLibrary: boolean): PhotoSource {
    if (!imagePreview) return 'none';
    return isLibrary ? 'library' : 'own';
}

export function shouldAutoSuggest(input: {
    name: string;
    source: PhotoSource;
    dismissed: boolean;
    lastQuery: string | null;
}): boolean {
    if (input.source === 'own' || input.dismissed) return false;
    const query = normalizeDishQuery(input.name);
    if (query.length < SUGGEST_MIN_CHARS) return false;
    return query !== input.lastQuery;
}

/** How much longer the searching state must stay up. */
export function revealDelay(startedAt: number, now: number, min: number = SUGGEST_MIN_SEARCH_MS): number {
    return Math.max(0, min - (now - startedAt));
}

/** The library's match for a dish name, or null. Never throws: no photo is a normal answer. */
export async function fetchLibraryPhoto(
    query: string,
    opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
    const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: opts.signal,
    };
    try {
        const res = opts.fetchImpl ? await opts.fetchImpl('/api/images/match', init) : await fetch('/api/images/match', init);
        if (!res.ok) return null;
        const json = (await res.json()) as { image_url?: unknown };
        return typeof json.image_url === 'string' && json.image_url ? json.image_url : null;
    } catch {
        return null;
    }
}

/** Resolves once the photo is downloaded AND decoded, so showing it cannot pop in late. */
export function preloadPhoto(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
            if (typeof img.decode === 'function') img.decode().then(() => resolve(), () => resolve());
            else resolve();
        };
        img.onerror = () => reject(new Error('Photo failed to load'));
        img.src = url;
    });
}

export type SuggestState =
    | { status: 'idle' }
    | { status: 'searching'; query: string }
    | { status: 'found'; query: string; url: string }
    | { status: 'none'; query: string };

export interface SuggesterDeps {
    lookup: (query: string, signal: AbortSignal) => Promise<string | null>;
    preload: (url: string) => Promise<void>;
    now: () => number;
}

export interface PhotoSuggester {
    /** Debounced lookup that ends in `found` or `none`. Safe to call on every keystroke. */
    request(name: string): void;
    /** The owner asked for a photo: look up now, with the same soft reveal. */
    find(name: string): Promise<string | null>;
    /** Saving: finish the lookup for this name now. No reveal, no state change. */
    resolveForSave(name: string): Promise<string | null>;
    cancel(): void;
    /** Cancel and forget what was looked up (a new drawer). */
    reset(): void;
    /** The last name whose lookup finished. */
    lastQuery(): string | null;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out')), ms);
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

export function createPhotoSuggester(
    deps: SuggesterDeps,
    onChange: (state: SuggestState) => void,
): PhotoSuggester {
    let current: SuggestState = { status: 'idle' };
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingQuery: string | null = null;
    let runningQuery: string | null = null;
    // Bumped whenever a run stops being wanted. A run only speaks while its
    // number is current, which is what keeps "dal fry" off a dish renamed "fish fry".
    let seq = 0;
    let inflight: { query: string; controller: AbortController; result: Promise<string | null> } | null = null;
    let settled: { query: string; url: string | null } | null = null;

    const emit = (next: SuggestState) => {
        if (next.status === 'idle' && current.status === 'idle') return;
        current = next;
        onChange(next);
    };

    const clearTimer = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        pendingQuery = null;
    };

    const stopRun = () => {
        if (runningQuery === null) return;
        seq++;
        runningQuery = null;
        inflight?.controller.abort();
    };

    /** One network lookup per name: a second caller for the same name joins the first. */
    function lookupShared(query: string): Promise<string | null> {
        if (inflight && inflight.query === query) return inflight.result;
        inflight?.controller.abort();
        const controller = new AbortController();
        const result: Promise<string | null> = withDeadline(deps.lookup(query, controller.signal), SUGGEST_TIMEOUT_MS)
            .catch(() => {
                controller.abort();
                return null;
            })
            .finally(() => {
                if (inflight?.result === result) inflight = null;
            });
        inflight = { query, controller, result };
        return result;
    }

    function cancel() {
        clearTimer();
        stopRun();
        emit({ status: 'idle' });
    }

    async function reveal(query: string): Promise<string | null> {
        const my = ++seq;
        runningQuery = query;
        const startedAt = deps.now();
        emit({ status: 'searching', query });

        let url = await lookupShared(query);
        if (my !== seq) return null;
        if (url) {
            try {
                await withDeadline(deps.preload(url), SUGGEST_TIMEOUT_MS);
            } catch {
                url = null;
            }
            if (my !== seq) return null;
        }
        const wait = revealDelay(startedAt, deps.now());
        if (wait > 0) {
            await sleep(wait);
            if (my !== seq) return null;
        }

        runningQuery = null;
        settled = { query, url };
        emit(url ? { status: 'found', query, url } : { status: 'none', query });
        return url;
    }

    return {
        request(name) {
            const query = normalizeDishQuery(name);
            if (query === pendingQuery || (query === runningQuery && !timer)) return;
            clearTimer();
            const willSearch = query.length >= SUGGEST_MIN_CHARS && query !== settled?.query;
            if (runningQuery !== null) {
                stopRun();
                // Keep the shimmer up if another search follows; otherwise settle.
                if (!willSearch) emit({ status: 'idle' });
            }
            // The name was cleared (or cut below a searchable length) after a
            // match: that photo belongs to a dish that is no longer named, so it
            // goes, and retyping the same name looks it up again.
            if (query.length < SUGGEST_MIN_CHARS && settled) {
                settled = null;
                emit({ status: 'none', query });
                return;
            }
            if (!willSearch) return;
            pendingQuery = query;
            timer = setTimeout(() => {
                timer = null;
                pendingQuery = null;
                void reveal(query);
            }, SUGGEST_DEBOUNCE_MS);
        },

        find(name) {
            const query = normalizeDishQuery(name);
            if (query.length < SUGGEST_MIN_CHARS) return Promise.resolve(null);
            clearTimer();
            stopRun();
            return reveal(query);
        },

        async resolveForSave(name) {
            const query = normalizeDishQuery(name);
            if (query.length < SUGGEST_MIN_CHARS) return null;
            if (settled?.query === query) return settled.url;
            clearTimer();
            const url = await lookupShared(query);
            settled = { query, url };
            return url;
        },

        cancel,

        reset() {
            cancel();
            settled = null;
        },

        lastQuery() {
            return settled?.query ?? null;
        },
    };
}
