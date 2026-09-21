// Lightweight in-memory sliding-window rate limiter for Next.js API routes.
//
// ─── WHAT THIS IS AND IS NOT ─────────────────────────────────────────────────
// This is a best-effort first line of defence. It is NOT an enforcement
// boundary, and nothing whose failure costs money or data should rest on it
// alone.
//
// LIMITATIONS — all three are live today, not hypothetical:
//
//   1. State lives in the Node.js process, so it is per-instance. vsite runs on
//      DigitalOcean App Platform at instance_count: 1, so there is currently no
//      multiplication — but any horizontal scale silently multiplies every limit
//      in the app by N, with nothing failing loudly to say so.
//
//   2. State is wiped on restart, and `deploy_on_push: true` means every push to
//      master restarts the app. An abuser does not even need to wait one out.
//
//   3. There is no cluster-wide back-off and no shared view of an attacker.
//
// CONSEQUENCE FOR ANYTHING THAT SPENDS: a `rateLimit()` call is not on its own a
// fix for a cost-abuse finding. Where the thing being limited is money — a paid
// third-party call, an LLM round trip — the durable counter belongs in Postgres,
// claimed atomically before the spend. `api/bulk-import/insert` does this with a
// compare-and-swap against `bulk_import_usage`; copy that shape rather than
// adding another bucket here.
//
// The upgrade path when instance_count > 1 is a shared store (Upstash Redis or
// equivalent). Until then, prefer narrow windows and keys an attacker cannot
// choose — see getClientIp below for why that second part is not automatic.
// ─────────────────────────────────────────────────────────────────────────────

type Bucket = { hits: number[]; firstSeen: number; windowMs: number };
const buckets = new Map<string, Bucket>();

// Periodic GC so the Map never grows unbounded if many one-off keys hit.
// Runs lazily — only sweeps when the next request arrives after the gap.
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Drops buckets that can no longer affect a decision.
 *
 * The eviction rule is NOT a tunable constant, and must stay derived from each
 * bucket's own `windowMs`: once a bucket's NEWEST hit has aged out of that
 * bucket's window, every older hit has aged out too, so the bucket is
 * empty-by-definition and deleting it changes no answer.
 *
 * This used to evict on a hardcoded 5-minute idle threshold instead. Because
 * `rateLimit()` sweeps BEFORE it looks the key up, an evicted bucket was
 * rebuilt empty on the very next call — so every caller declaring a window
 * longer than five minutes silently got a ~5-minute one. That was all seven of
 * the expensive call sites (both AI extract routes, create-subscription,
 * verify-payment, onboarding/complete, qr-card-request), each passing
 * `windowMs: 60 * 60_000`: pausing six minutes bought a fresh allowance, for
 * as long as the caller cared to keep pausing. See tests/unit/rateLimit.test.ts.
 */
function sweep(now: number) {
    if (now - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = now;
    buckets.forEach((bucket, key) => {
        if (
            bucket.hits.length === 0 ||
            now - bucket.hits[bucket.hits.length - 1] > bucket.windowMs
        ) {
            buckets.delete(key);
        }
    });
}

export type RateLimitResult = {
    allowed: boolean;
    /** Hits remaining in the current window after this call. */
    remaining: number;
    /** ms until the oldest in-window hit expires (when the user can try again). */
    retryAfterMs: number;
};

export type RateLimitOptions = {
    /** Max requests permitted within `windowMs`. */
    limit: number;
    /** Sliding window length in ms. */
    windowMs: number;
};

/**
 * Sliding-window rate limit. Returns whether to allow this request.
 * `key` should be a stable identifier — UID for authenticated routes,
 * IP for anonymous, or a composite. Derive an IP key with `getClientIp` below
 * and never by reading a forwarding header directly — the key must be something
 * the caller cannot choose, or the bucket is theirs to reset.
 */
export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    sweep(now);

    let bucket = buckets.get(key);
    if (!bucket) {
        bucket = { hits: [], firstSeen: now, windowMs: opts.windowMs };
        buckets.set(key, bucket);
    } else {
        // Keep the GC's view current if a key is ever used with a longer
        // window, so eviction never undercuts the window in force.
        bucket.windowMs = Math.max(bucket.windowMs, opts.windowMs);
    }

    // Drop hits that have aged out of the window.
    const cutoff = now - opts.windowMs;
    while (bucket.hits.length > 0 && bucket.hits[0] < cutoff) {
        bucket.hits.shift();
    }

    if (bucket.hits.length >= opts.limit) {
        const retryAfterMs = bucket.hits[0] + opts.windowMs - now;
        return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 0) };
    }

    bucket.hits.push(now);
    return {
        allowed: true,
        remaining: opts.limit - bucket.hits.length,
        retryAfterMs: 0,
    };
}

/**
 * Best-effort client IP. THE ONLY place this is derived — do not hand-roll it.
 *
 * ─── WHY THE RIGHTMOST X-FORWARDED-FOR ENTRY ─────────────────────────────────
 * A proxy APPENDS what it observed to X-Forwarded-For; it does not replace the
 * header. So for `X-Forwarded-For: <a>, <b>, <c>`, `<a>` is whatever the client
 * sent — arbitrary attacker text — and `<c>` is the only entry our own
 * infrastructure wrote. Reading `[0]` therefore hands the caller the key to
 * their own rate-limit bucket, which is exactly what happened on
 * /api/track-menu-scan (2026-09 assessment, Finding 8): rotating the header gave
 * a fresh bucket per request and the limit did nothing.
 *
 * `x-real-ip` is preferred because the ingress SETS it rather than appending,
 * so a client-supplied value is overwritten rather than merged.
 *
 * Neither header is trustworthy if a request can reach the app without passing
 * through the ingress. That is an infrastructure property, not something this
 * function can assert — see AGENTS.md.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function getClientIp(headers: Headers): string {
    const realIp = headers.get('x-real-ip')?.trim();
    if (realIp) return realIp;

    const forwarded = (headers.get('x-forwarded-for') ?? '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);

    return forwarded.length > 0 ? forwarded[forwarded.length - 1] : 'unknown';
}
