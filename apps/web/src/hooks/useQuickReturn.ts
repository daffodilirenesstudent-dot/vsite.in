'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The quick-return pattern: hide a bar while the reader scrolls down into the
 * content, bring it back the instant they scroll up — wherever they are.
 *
 * Material calls it a scroll-aware app bar; headroom.js is the same idea. It
 * exists because a filter that only lives at the top of the page forces a
 * reader 40 dishes down to scroll all the way back just to change category,
 * and a bar that is permanently pinned eats a sixth of a phone screen that
 * should be showing food.
 *
 * ── Why distance and not a count of scroll events ──────────────────────────
 *
 * "Show it after two scrolls up" is the intuitive rule and it does not work.
 * A single flick is ONE scroll event carrying 800px of travel; a slow drag is
 * dozens of events carrying 10px. Counting events either fires immediately on
 * a flick or never fires on a drag. So this measures DISTANCE TRAVELLED in one
 * direction, which is what every shipped implementation of this pattern does.
 *
 * The two tolerances are deliberately asymmetric:
 *
 *   - `upTolerance` is small. An upward scroll IS the request to get the bar
 *     back, and hesitating on it feels broken.
 *   - `downTolerance` is larger, so a thumb that wobbles while reading does
 *     not strobe the bar in and out.
 *
 * `offset` keeps the bar visible near the top of the page: there is nothing to
 * gain by hiding it there, and a bar that vanishes after 20px feels twitchy.
 *
 * Returns `pinned` only. The caller decides what pinned looks like — this hook
 * never touches the DOM, so it can be tested and reused without a component.
 */

export interface UseQuickReturnOptions {
    /** Stay pinned while within this many px of the top. */
    offset?: number;
    /** Px of upward travel before the bar comes back. */
    upTolerance?: number;
    /** Px of downward travel before the bar hides. */
    downTolerance?: number;
    /** Suspend tracking — e.g. while a modal owns the screen and the body is locked. */
    disabled?: boolean;
}

export function useQuickReturn({
    offset = 140,
    upTolerance = 6,
    downTolerance = 18,
    disabled = false,
}: UseQuickReturnOptions = {}): boolean {
    const [pinned, setPinned] = useState(true);

    // Refs, not state: these update on every frame of a scroll and must not
    // re-render anything. Only `pinned` flipping is worth a render.
    const lastY = useRef(0);
    const ticking = useRef(false);

    useEffect(() => {
        if (disabled) {
            // A sheet is open and the body is locked. Leave the bar pinned so
            // it is already there when the reader closes the sheet.
            setPinned(true);
            return;
        }
        if (typeof window === 'undefined') return;

        lastY.current = window.scrollY;

        const evaluate = () => {
            ticking.current = false;
            const y = window.scrollY;

            // Near the top, or rubber-banded past it on iOS.
            if (y <= offset) {
                lastY.current = y;
                setPinned(true);
                return;
            }

            const delta = y - lastY.current;

            if (delta > downTolerance) {
                lastY.current = y;
                setPinned(false);
            } else if (delta < -upTolerance) {
                lastY.current = y;
                setPinned(true);
            }
            // Inside the tolerance band: hold the current state and keep the
            // anchor where it was, so slow travel still accumulates toward a
            // threshold instead of resetting every frame.
        };

        const onScroll = () => {
            // One read per frame. An unthrottled handler reads scrollY on
            // every event and forces layout on a cheap Android mid-scroll.
            if (ticking.current) return;
            ticking.current = true;
            requestAnimationFrame(evaluate);
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [offset, upTolerance, downTolerance, disabled]);

    return pinned;
}
