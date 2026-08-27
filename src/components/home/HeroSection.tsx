'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowRight, Check, CirclePlay, Nfc } from 'lucide-react';
import { RevealLines } from './Reveal';
import { prefersReducedMotion } from '@/hooks/useInView';
import PhoneMenu from './PhoneMenu';

const TRUST = [
    'Diners download nothing',
    'Any Android or iPhone',
    'Change a price in 10 seconds',
    'Tamil and English',
];

export default function HeroSection() {
    const sectionRef = useRef<HTMLElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);

    /**
     * Pointer parallax on the phone. rAF-throttled, writes two CSS custom
     * properties and lets CSS do the transform — so the work stays on the
     * compositor and there is no React re-render per mouse move.
     *
     * Fine pointers only: on touch there is no hover state to reward, and a
     * tilt that fires on tap would just look like a glitch.
     */
    useEffect(() => {
        const section = sectionRef.current;
        const stage = stageRef.current;
        if (!section || !stage) return;
        if (prefersReducedMotion()) return;
        if (!window.matchMedia('(pointer: fine)').matches) return;

        let frame = 0;
        const onMove = (e: PointerEvent) => {
            if (frame) return;
            frame = requestAnimationFrame(() => {
                frame = 0;
                const r = section.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width - 0.5;
                const y = (e.clientY - r.top) / r.height - 0.5;
                stage.style.setProperty('--tilt-x', x.toFixed(3));
                stage.style.setProperty('--tilt-y', y.toFixed(3));
            });
        };
        const onLeave = () => {
            stage.style.setProperty('--tilt-x', '0');
            stage.style.setProperty('--tilt-y', '0');
        };

        section.addEventListener('pointermove', onMove);
        section.addEventListener('pointerleave', onLeave);
        return () => {
            if (frame) cancelAnimationFrame(frame);
            section.removeEventListener('pointermove', onMove);
            section.removeEventListener('pointerleave', onLeave);
        };
    }, []);

    return (
        <section
            ref={sectionRef}
            className="hero-mesh relative overflow-hidden px-5 pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-[6.5rem] lg:pt-40"
        >
            {/* Backdrop layers — all decorative, all pointer-transparent. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 hero-grid" />
            <div
                aria-hidden
                className="hero-ember pointer-events-none absolute -bottom-32 -right-24 h-[30rem] w-[30rem] rounded-full bg-orange-500/25 blur-[130px]"
            />
            <div aria-hidden className="pointer-events-none absolute inset-0 hero-grain" />
            {/* Ties the hero into the paper section below instead of ending on a hard seam. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-paper/10" />

            <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-12 lg:flex-row lg:gap-16">
                <div className="w-full max-w-2xl lg:flex-1">
                    <div
                        data-reveal="pop"
                        data-visible="true"
                        className="inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 backdrop-blur-sm"
                    >
                        <span className="pulse-ring relative inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-green-400 text-green-400" />
                        <span className="text-caption font-medium text-[#E7E4F5] sm:text-sm">
                            Live in Tamil Nadu · 7 days free, no card
                        </span>
                    </div>

                    <h1 className="mt-6 font-display text-display font-bold text-on-night">
                        <RevealLines
                            lines={[
                                'Your paper menu.',
                                'A QR code.',
                                <span
                                    key="3"
                                    className="bg-gradient-to-r from-[#C7C4FF] via-[#A9A7FF] to-[#F0A868] bg-clip-text text-transparent"
                                >
                                    Three minutes.
                                </span>,
                            ]}
                        />
                    </h1>

                    {/* Labour illusion: naming each step the AI performs makes the
                        three-minute claim feel earned instead of glib. */}
                    <p
                        data-reveal="up"
                        data-visible="true"
                        style={{ '--reveal-delay': '380ms' } as React.CSSProperties}
                        className="mt-6 max-w-xl text-body text-on-night-70 sm:text-lg"
                    >
                        Photograph the menu you already have — printed, laminated, or handwritten in a
                        notebook. Our AI reads every item, writes the descriptions, generates the photos,
                        and hands you a QR code for your tables.
                    </p>

                    <div
                        data-reveal="up"
                        data-visible="true"
                        style={{ '--reveal-delay': '480ms' } as React.CSSProperties}
                        className="mt-8 flex flex-col gap-3 sm:flex-row"
                    >
                        <Link
                            href="/signup"
                            className="press group inline-flex h-14 items-center justify-center gap-2.5 rounded-full bg-white px-8 text-lg font-semibold text-ink shadow-[0_10px_40px_-8px_rgba(255,255,255,0.35)] transition-shadow hover:shadow-[0_14px_50px_-8px_rgba(255,255,255,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-night"
                        >
                            Build my menu free
                            <ArrowRight className="cta-arrow h-5 w-5" strokeWidth={2} aria-hidden />
                        </Link>
                        <Link
                            href="#setup-steps"
                            className="press inline-flex h-14 items-center justify-center gap-2.5 rounded-full border border-white/25 bg-white/[0.06] px-8 text-lg font-semibold text-on-night backdrop-blur-sm transition-colors hover:border-white/40 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                            <CirclePlay className="h-5 w-5" strokeWidth={1.6} aria-hidden />
                            Watch the 3-minute setup
                        </Link>
                    </div>

                    {/* Specific reversals beat vague ones: "cancel from your dashboard"
                        is checkable, "cancel anytime" is not. */}
                    <p
                        data-reveal="up"
                        data-visible="true"
                        style={{ '--reveal-delay': '560ms' } as React.CSSProperties}
                        className="mt-5 text-sm text-on-night-45"
                    >
                        No card today. No commission ever. Cancel from your dashboard.
                    </p>

                    <ul className="mt-7 grid max-w-lg grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                        {TRUST.map((item, i) => (
                            <li
                                key={item}
                                data-reveal="left"
                                data-visible="true"
                                style={{ '--reveal-delay': `${640 + i * 70}ms` } as React.CSSProperties}
                                className="flex items-center gap-2.5 text-[15px] text-white/80"
                            >
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-400/15">
                                    <Check className="h-3 w-3 text-green-400" strokeWidth={3} aria-hidden />
                                </span>
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Phone stage — parallax origin. */}
                <div
                    ref={stageRef}
                    data-reveal="scale"
                    data-visible="true"
                    style={{ '--reveal-delay': '220ms', '--reveal-duration': '1s' } as React.CSSProperties}
                    className="relative w-full max-w-[260px] shrink-0 sm:max-w-[300px] lg:max-w-[336px]"
                >
                    <div
                        aria-hidden
                        className="absolute -inset-4 rounded-[3.5rem] bg-gradient-to-br from-primary/30 via-violet-500/20 to-orange-500/20 blur-3xl"
                    />

                    <div className="tilt relative">
                        <PhoneMenu />
                        {/* Light catching the glass. */}
                        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2.5rem]">
                            <div className="glass-sweep absolute -inset-y-8 left-0 w-16 bg-gradient-to-r from-transparent via-white/12 to-transparent" />
                        </div>
                    </div>

                    <div className="tilt-pop pointer-events-none absolute -right-3 top-6 sm:-right-6">
                        <div className="chip-float-a flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 shadow-xl">
                            <span className="pulse-ring relative inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-green-500 text-green-500" />
                            <span className="text-caption font-semibold text-ink">Menu is live</span>
                        </div>
                    </div>
                    <div className="tilt-pop pointer-events-none absolute -left-3 bottom-14 sm:-left-6">
                        <div className="chip-float-b flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 shadow-xl">
                            <Nfc className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden />
                            <span className="text-caption font-semibold text-ink">Tap or scan</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
