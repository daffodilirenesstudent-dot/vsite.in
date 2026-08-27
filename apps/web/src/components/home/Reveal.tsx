'use client';

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { prefersReducedMotion } from '@/hooks/useInView';

type Variant = 'up' | 'left' | 'right' | 'scale' | 'pop';

interface RevealProps {
    children: ReactNode;
    /** Direction of the entrance. `pop` uses the spring curve — badges only. */
    variant?: Variant;
    /** Delay in ms. Use `stagger` on a parent instead of hand-tuning these. */
    delay?: number;
    /** Stagger step in ms applied to each direct child element. */
    stagger?: number;
    className?: string;
    as?: ElementType;
    threshold?: number;
    rootMargin?: string;
}

/**
 * The single entrance primitive for the homepage.
 *
 * All the animation lives in CSS (`[data-reveal]` in globals.css) — this only
 * flips `data-visible`. That keeps the work on the compositor thread and means
 * `prefers-reduced-motion` is handled in one place rather than per component.
 *
 * `stagger` sets `--reveal-delay` on each direct child, so a list animates in
 * sequence without the caller computing `${i * 90}ms` at every call site (the
 * pattern the old sections repeated in seven different files).
 */
export default function Reveal({
    children,
    variant = 'up',
    delay = 0,
    stagger,
    className = '',
    as: Tag = 'div',
    threshold = 0.12,
    rootMargin = '0px 0px -8% 0px',
}: RevealProps) {
    const ref = useRef<HTMLElement>(null);
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
                    observer.disconnect();
                }
            },
            { threshold, rootMargin },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [threshold, rootMargin]);

    // Stagger is applied to children rather than wrapping each one, so the
    // caller's markup stays flat and the DOM gains no extra nodes.
    useEffect(() => {
        if (!stagger) return;
        const el = ref.current;
        if (!el) return;
        Array.from(el.children).forEach((child, i) => {
            (child as HTMLElement).style.setProperty('--reveal-delay', `${delay + i * stagger}ms`);
        });
    }, [stagger, delay]);

    return (
        <Tag
            ref={ref}
            className={className}
            data-reveal={stagger ? undefined : variant}
            data-visible={visible ? 'true' : 'false'}
            style={stagger ? undefined : ({ '--reveal-delay': `${delay}ms` } as React.CSSProperties)}
        >
            {children}
        </Tag>
    );
}

/**
 * Masked line-by-line headline rise — the hero's one "expensive-looking"
 * moment. Each line is clipped by its own wrapper so the text slides up from
 * behind a hard edge instead of fading in place.
 */
export function RevealLines({
    lines,
    className = '',
    lineClassName = '',
    step = 90,
    startDelay = 60,
}: {
    lines: ReactNode[];
    className?: string;
    lineClassName?: string;
    step?: number;
    startDelay?: number;
}) {
    const ref = useRef<HTMLSpanElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (prefersReducedMotion()) {
            setVisible(true);
            return;
        }
        // The hero is above the fold — animate on mount, not on intersection.
        const id = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(id);
    }, []);

    return (
        <span ref={ref} className={className} data-visible={visible ? 'true' : 'false'}>
            {lines.map((line, i) => (
                <span key={i} className="reveal-line">
                    <span
                        className={lineClassName}
                        style={{ '--reveal-delay': `${startDelay + i * step}ms` } as React.CSSProperties}
                    >
                        {line}
                    </span>
                </span>
            ))}
        </span>
    );
}
