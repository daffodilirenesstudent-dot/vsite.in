/**
 * The sliding window must actually be as long as the caller declared.
 *
 * ── The bug these tests pin down ────────────────────────────────────────────
 * `sweep()` is a garbage collector, but it was deciding what to evict using a
 * hardcoded 5-minute idle threshold while knowing nothing about each bucket's
 * own `windowMs`. `rateLimit()` sweeps BEFORE it looks the key up, so an
 * evicted bucket was rebuilt empty on the very next call: every limiter in the
 * app declaring a window longer than five minutes silently enforced a ~5-minute
 * one instead.
 *
 * That is seven live call sites, all of them the expensive ones — the two AI
 * extract routes, /api/subscription/create-subscription, verify-payment,
 * onboarding/complete and qr-card-request all pass `windowMs: 60 * 60_000`.
 * A caller who paused six minutes got a fresh allowance, indefinitely.
 *
 * The eviction rule is not a tunable constant: once a bucket's NEWEST hit has
 * aged out of that bucket's own window, every hit in it has aged out, so the
 * bucket is empty by definition and dropping it changes no decision. Anything
 * shorter than that changes decisions, which is the bug.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimit } from '@/lib/platform/rateLimit';

const HOUR = 60 * 60_000;

/** Buckets are module-global, so every test needs its own key. */
let n = 0;
const freshKey = () => `test-key-${process.pid}-${n++}`;

describe('rateLimit sliding window', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('denies past the limit inside the window', () => {
        const key = freshKey();
        const opts = { limit: 3, windowMs: HOUR };
        expect(rateLimit(key, opts).allowed).toBe(true);
        expect(rateLimit(key, opts).allowed).toBe(true);
        expect(rateLimit(key, opts).allowed).toBe(true);
        expect(rateLimit(key, opts).allowed).toBe(false);
    });

    it('keeps an hour-long window exhausted across a six-minute idle gap', () => {
        const key = freshKey();
        const opts = { limit: 10, windowMs: HOUR };
        for (let i = 0; i < 10; i++) expect(rateLimit(key, opts).allowed).toBe(true);
        expect(rateLimit(key, opts).allowed).toBe(false);

        // Six minutes idle is past the old 5-minute GC threshold but nowhere
        // near the hour the caller asked for.
        vi.advanceTimersByTime(6 * 60_000);
        expect(rateLimit(key, opts).allowed).toBe(false);
    });

    it('stays exhausted at 59 minutes and reopens just past the hour', () => {
        const key = freshKey();
        const opts = { limit: 2, windowMs: HOUR };
        rateLimit(key, opts);
        rateLimit(key, opts);

        vi.advanceTimersByTime(59 * 60_000);
        expect(rateLimit(key, opts).allowed, 'still inside the window').toBe(false);

        vi.advanceTimersByTime(2 * 60_000);   // t = 61 min
        expect(rateLimit(key, opts).allowed, 'window has genuinely passed').toBe(true);
    });

    it('does not let repeated denied calls extend the window', () => {
        const key = freshKey();
        const opts = { limit: 1, windowMs: HOUR };
        expect(rateLimit(key, opts).allowed).toBe(true);

        // Hammering while denied must not push the expiry out: a denial records
        // no hit, so the original hit still ages out on schedule.
        for (let i = 0; i < 20; i++) {
            vi.advanceTimersByTime(60_000);
            rateLimit(key, opts);
        }
        vi.advanceTimersByTime(41 * 60_000);  // t = 61 min after the single hit
        expect(rateLimit(key, opts).allowed).toBe(true);
    });

    it('still frees short-window buckets promptly', () => {
        // The GC must keep working — a one-minute bucket should not be held for
        // an hour just because long windows now survive.
        const key = freshKey();
        const opts = { limit: 1, windowMs: 60_000 };
        expect(rateLimit(key, opts).allowed).toBe(true);
        expect(rateLimit(key, opts).allowed).toBe(false);
        vi.advanceTimersByTime(61_000);
        expect(rateLimit(key, opts).allowed).toBe(true);
    });

    it('keys are independent', () => {
        const a = freshKey();
        const b = freshKey();
        const opts = { limit: 1, windowMs: HOUR };
        expect(rateLimit(a, opts).allowed).toBe(true);
        expect(rateLimit(a, opts).allowed).toBe(false);
        expect(rateLimit(b, opts).allowed).toBe(true);
    });
});
