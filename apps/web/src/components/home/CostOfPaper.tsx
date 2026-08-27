'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Reveal from './Reveal';

/**
 * The problem section — moved from position 7 to position 3.
 *
 * Two deliberate copy decisions:
 *
 * 1. **Arithmetic, not percentages.** The old section claimed "grow revenue up
 *    to 15%" and "30% more orders" with nothing behind them. These show the
 *    multiplication instead, so the owner checks it against their own table
 *    count and reaches the conclusion themselves. A number you verify is worth
 *    more than a number you are told, and it is honest.
 *
 * 2. **Loss framing.** A rupee lost is felt roughly twice as hard as a rupee
 *    gained, so the frame is what paper is already costing — not what vsite
 *    might add.
 */

const COSTS = [
    {
        figure: '₹120 × 20 tables',
        headline: 'The side order nobody pictured',
        body: 'A diner orders what they can see. If a photo of the ghee roast moves one ₹120 extra across twenty tables, that is ₹2,400 — in a day, from the same footfall.',
    },
    {
        figure: '₹3,500 a reprint',
        headline: 'And a week of wrong prices',
        body: 'Tomato goes up. You redesign, you print, you wait — and old cards stay on the tables the whole time, quietly selling at last month’s price.',
    },
    {
        figure: '2 hours a day',
        headline: 'Explaining the same six dishes',
        body: '“What is in the Chettinad?” — table after table, all through the rush. That is your fastest server, tied to a paper card.',
    },
];

export default function CostOfPaper() {
    return (
        <section className="bg-paper-2 px-5 py-section lg:py-section-lg">
            <div className="mx-auto max-w-6xl">
                <Reveal className="max-w-3xl">
                    <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                        The real cost of paper
                    </p>
                    <h2 className="mt-5 font-display text-h2 font-bold text-ink">
                        Paper doesn’t just cost you printing. It costs you the order that never happened.
                    </h2>
                </Reveal>

                <Reveal className="mt-10 grid sm:mt-12 gap-7 sm:mt-16 md:grid-cols-3" stagger={110}>
                    {COSTS.map((c) => (
                        <div key={c.figure} data-reveal="up" className="border-t-2 border-ink pt-6">
                            <p className="text-3xl font-bold tracking-[-0.04em] text-ink sm:text-[2.5rem]">
                                {c.figure}
                            </p>
                            <p className="mt-3 text-[17px] font-semibold text-ink">{c.headline}</p>
                            <p className="mt-3 text-base leading-relaxed text-ink-70">{c.body}</p>
                        </div>
                    ))}
                </Reveal>

                {/* The reframe. This is the line the section exists to deliver:
                    it turns "spend ₹299" into "stop overpaying", which is a much
                    smaller decision to make. */}
                <Reveal
                    variant="scale"
                    className="mt-14 flex flex-col items-start gap-7 rounded-card-lg bg-ink p-7 sm:mt-16 sm:p-10 lg:flex-row lg:items-center lg:gap-10"
                >
                    <p className="flex-1 text-xl font-medium leading-snug tracking-[-0.02em] text-paper sm:text-2xl lg:text-[1.7rem]">
                        You are already paying for a digital menu.{' '}
                        <span className="text-[#A9A7FF]">
                            You are just paying for it in printing, waiting, and questions.
                        </span>
                    </p>
                    <Link
                        href="#pricing"
                        className="press inline-flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-full bg-white px-8 text-[17px] font-semibold text-ink hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                    >
                        See what ₹299 replaces
                        <ArrowRight className="cta-arrow h-5 w-5" strokeWidth={2} aria-hidden />
                    </Link>
                </Reveal>
            </div>
        </section>
    );
}
