'use client';

import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import Reveal from './Reveal';
import { LogoMark } from '@/components/Logo';
import { PLAN_PRICES_INR } from '@/lib/productFlags';

/**
 * One product, one price — presented as a restaurant bill.
 *
 * The band used to be the same indigo/violet as the hero, which made the two
 * dark sections read as the same beat and left the section looking like every
 * other SaaS pricing block. It is now warm ink with an amber wash: distinct
 * from the hero, and warm the way the food photography is.
 *
 * The card is a bill because the argument here IS an itemised comparison —
 * what you pay a printer against what you pay us. Putting that on a docket
 * with a torn edge makes the comparison legible in one glance to someone who
 * reads exactly this object twenty times a day.
 *
 * Price comes from productFlags so it can never drift from what checkout charges.
 */

const INCLUDED = [
    'Unlimited items, categories and price changes',
    'AI menu reading, descriptions and dish photos',
    'Tamil + English, offers, banners, sold-out control',
    'NFC card + weatherproof QR stickers, posted free',
    'WhatsApp support in Tamil, from a person',
];

const MONTHLY = PLAN_PRICES_INR.qr_menu;
const YEARLY = MONTHLY * 12;
const REPRINT = 3500;

/** Torn docket edge. Explicit zigzag rather than a mask stack, so it renders
 *  identically everywhere and stretches cleanly at any card width. */
function TornEdge({ className = '' }: { className?: string }) {
    const teeth = 40;
    const w = 400;
    const step = w / teeth;
    let d = 'M0,0 ';
    for (let i = 0; i < teeth; i++) {
        d += `L${(i + 0.5) * step},12 L${(i + 1) * step},0 `;
    }
    d += `L${w},0 Z`;
    return (
        <svg
            className={className}
            viewBox={`0 0 ${w} 12`}
            preserveAspectRatio="none"
            aria-hidden
            focusable="false"
        >
            <path d={d} fill="currentColor" />
        </svg>
    );
}

export default function Pricing() {
    return (
        <section id="pricing" className="relative scroll-mt-20 overflow-hidden bg-ink px-5 py-section lg:py-section-lg">
            {/* Warm wash + faint grid. Deliberately NOT the hero's indigo. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                    backgroundImage:
                        'radial-gradient(42rem 30rem at 82% 6%, rgba(234,88,12,0.16), transparent 62%), radial-gradient(38rem 28rem at 8% 96%, rgba(180,83,9,0.12), transparent 60%)',
                }}
            />
            <div aria-hidden className="hero-grid pointer-events-none absolute inset-0 opacity-40" />

            <div className="relative mx-auto max-w-6xl">
                <Reveal className="text-center">
                    <p className="text-caption font-semibold uppercase tracking-[0.1em] text-amber-300/90">
                        Pricing
                    </p>
                    <h2 className="mt-5 font-display text-h2 font-bold text-paper">
                        One reprint, or one year.
                    </h2>
                    <p className="mx-auto mt-5 max-w-md text-body text-white/65">
                        You already have a line in your books for the menu. This just moves it.
                    </p>
                </Reveal>

                <Reveal
                    variant="up"
                    delay={120}
                    className="mx-auto mt-9 w-full max-w-lg sm:mt-11"
                >
                    <div className="relative">
                        <div className="rounded-t-[1.25rem] bg-paper px-7 pb-2 pt-8 sm:px-10">
                            {/* Docket header */}
                            <div className="flex items-center justify-between border-b border-dashed border-line pb-5">
                                <div className="flex items-center gap-2">
                                    <LogoMark size={20} tone="brand" />
                                    <span className="text-[15px] font-extrabold tracking-[-0.04em] text-ink">vsite</span>
                                </div>
                                <span className="text-caption font-bold uppercase tracking-[0.14em] text-ink-45">
                                    Smart QR Menu
                                </span>
                            </div>

                            {/* The comparison, as line items */}
                            <dl className="divide-y divide-dashed divide-line">
                                <div className="flex items-baseline justify-between py-4">
                                    <dt className="text-[15px] text-ink-70">One paper reprint</dt>
                                    <dd className="text-lg font-semibold text-ink-45 line-through decoration-2">
                                        ₹{REPRINT.toLocaleString('en-IN')}
                                    </dd>
                                </div>
                                <div className="flex items-baseline justify-between py-4">
                                    <dt className="text-[15px] text-ink-70">
                                        vsite, a whole year
                                        <span className="ml-2 rounded bg-green-50 px-1.5 py-0.5 text-[12px] font-bold uppercase tracking-wide text-green-700">
                                            same money
                                        </span>
                                    </dt>
                                    <dd className="text-lg font-semibold text-ink">₹{YEARLY.toLocaleString('en-IN')}</dd>
                                </div>
                            </dl>

                            {/* Total */}
                            <div className="flex items-end justify-between border-t-2 border-ink pt-5">
                                <div>
                                    <p className="text-caption font-bold uppercase tracking-[0.14em] text-ink-45">
                                        You pay
                                    </p>
                                    <p className="mt-1 text-[15px] text-ink-70">
                                        Our only product.
                                        <br />
                                        There is no upsell tier.
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-4xl font-bold leading-none tracking-[-0.04em] text-ink sm:text-[2.9rem]">
                                        ₹{MONTHLY}
                                    </p>
                                    <p className="mt-1 text-sm text-ink-70">per month</p>
                                </div>
                            </div>

                            <ul className="mt-7 flex flex-col gap-3.5 border-t border-dashed border-line pt-6">
                                {INCLUDED.map((f) => (
                                    <li key={f} className="flex items-start gap-3">
                                        <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-700" strokeWidth={2.2} aria-hidden />
                                        <span className="text-base text-ink">{f}</span>
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href="/signup"
                                className="press mt-8 flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-primary text-[17px] font-semibold text-white shadow-lg shadow-primary/30 hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            >
                                Start free — 7 days
                                <ArrowRight className="cta-arrow h-5 w-5" strokeWidth={2} aria-hidden />
                            </Link>

                            {/* Names the exact moment money is asked for. The unspoken
                                fear about a free trial is that it is a card trap. */}
                            <p className="mb-4 mt-3.5 text-center text-sm text-ink-70">
                                No card today. We ask for payment on day 8 — not before.
                            </p>
                        </div>

                        <TornEdge className="block h-3 w-full text-paper" />
                    </div>
                </Reveal>

                <p className="mt-8 text-center text-[15px] text-white/55">
                    No commission. No per-scan fee. No charge for the NFC card.
                </p>
            </div>
        </section>
    );
}
