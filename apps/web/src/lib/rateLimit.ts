// Lightweight in-memory sliding-window rate limiter for Next.js API routes.
//
// LIMITATIONS — read before relying on this in production at scale:
//
//   1. State lives in the Node.js process. On Vercel / Firebase Functions
//      with multiple instances, each instance has its own counter — true
//      capacity = (limit × N instances). Fine for our scale (500 DAU → 1–2
//      warm instances), but switch to Upstash Redis once we cross ~5 instances.
//
//   2. State is wiped on cold start. Aggressive abusers can reset by
//      triggering enough quiet time. Mitigated by short windows and IP keys.
//
//   3. There is no cluster-wide back-off (no leader election). For abuse
//      attacks we layer additional Cloudflare / Vercel firewall rules.
//
// Use this for the FIRST line of defence. For payment, security-critical, or
// compliance-graded throttling, escalate to a real distributed limiter.

type Bucket = { hits: number[]; firstSeen: number };
const buckets = new Map<string, Bucket>();

// Periodic GC so the Map never grows unbounded if many one-off keys hit.
// Runs lazily — only sweeps when the next request arrives after the gap.
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number) {
    if (now - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = now;
    buckets.forEach((bucket, key) => {
        // Drop buckets whose newest hit is older than 5 minutes.
        if (bucket.hits.length === 0 || now - bucket.hits[bucket.hits.length - 1] > 5 * 60_000) {
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
 * IP for anonymous, or a composite. Be careful with X-Forwarded-For
 * spoofing on platforms that don't strip it (we trust Vercel's value).
 */
export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    sweep(now);

    let bucket = buckets.get(key);
    if (!bucket) {
        bucket = { hits: [], firstSeen: now };
        buckets.set(key, bucket);
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
 * Pulls a best-effort client IP from a Next.js request. Trusts platform
 * forwarding headers — these are stripped of user-supplied versions on
 * Vercel and Firebase Hosting before they reach us.
 */
export function getClientIp(headers: Headers): string {
    return (
        headers.get('x-real-ip') ||
        (headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
        'unknown'
    );
}
