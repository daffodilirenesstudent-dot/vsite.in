'use client';

import { useEffect, useRef, useState } from 'react';

/** True when the OS asks for reduced motion. SSR-safe (returns false). */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface UseInViewOptions {
    /** Fraction of the element that must be visible. */
    threshold?: number;
    /** Margin around the root, e.g. '0px 0px -12% 0px' to fire slightly early. */
    rootMargin?: string;
    /** Disconnect after the first intersection. Default true. */
    once?: boolean;
}

/**
 * Reveal-on-scroll observer.
 *
 * Two behaviours matter beyond "is it on screen":
 *
 * 1. **Reduced motion starts visible.** Previously a reduced-motion user got
 *    `visible: false` until the observer fired — and because the CSS now pins
 *    reveals to their end state under `prefers-reduced-motion`, any element
 *    still gated on this flag in JS would have stayed hidden. It now returns
 *    `true` on the first render instead.
 *
 * 2. **No IntersectionObserver means visible.** Failing open keeps content
 *    readable on old browsers rather than blank.
 */
export function useInView(
    thresholdOrOptions: number | UseInViewOptions = 0.12,
    legacyRootMargin?: string,
) {
    const opts: UseInViewOptions =
        typeof thresholdOrOptions === 'number'
            ? { threshold: thresholdOrOptions, rootMargin: legacyRootMargin }
            : thresholdOrOptions;

    const { threshold = 0.12, rootMargin = '0px 0px -8% 0px', once = true } = opts;

    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
            setVisible(true);
            return;
        }

        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    if (once) observer.disconnect();
                } else if (!once) {
                    setVisible(false);
                }
            },
            { threshold, rootMargin },
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [threshold, rootMargin, once]);

    return { ref, visible };
}
