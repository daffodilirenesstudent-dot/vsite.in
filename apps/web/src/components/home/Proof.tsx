'use client';

import { MessageCircle, MapPin, Timer } from 'lucide-react';
import Reveal from './Reveal';
import {
    FOUNDER_INITIALS,
    FOUNDER_LOCATION,
    FOUNDER_NAME,
    FOUNDER_TITLE,
    whatsappUrl,
} from '@/lib/platform/brand';

/**
 * Replaces SocialProof (and the interim EarlyAccess panel).
 *
 * The old section shipped three invented testimonials to production with the
 * "these are placeholders" footnote still rendered underneath them, alongside
 * an aggregateRating of 4.8 from 124 reviews in the page's JSON-LD. Both gone.
 *
 * Every figure below now comes from PROOF_STATS — one exported constant, so
 * there is exactly one place to audit or update what the site claims, and no
 * number is hardcoded into markup where it can quietly drift.
 */

/**
 * SINGLE SOURCE OF TRUTH for the public-facing counts.
 *
 * Update here and the homepage follows. Confirmed by the owner as accurate at
 * the time of writing — keep it that way: these are the numbers a prospective
 * customer will judge the whole site's honesty by.
 */
export const PROOF_STATS = {
    menusLive: '1,000+',
    districts: '38',
    setupMinutes: '3',
} as const;

const STATS = [
    {
        Icon: MapPin,
        value: PROOF_STATS.menusLive,
        label: 'menus live',
        note: 'Restaurants, messes, cafés, bakeries and tiffin centres.',
    },
    {
        Icon: MapPin,
        value: `All ${PROOF_STATS.districts}`,
        label: 'districts of Tamil Nadu',
        note: 'From Chennai to Kanyakumari — and the towns in between.',
    },
    {
        Icon: Timer,
        value: `${PROOF_STATS.setupMinutes} min`,
        label: 'from photo to live menu',
        note: 'The same three steps, whatever your menu looks like.',
    },
];

export default function Proof({
    founderName = FOUNDER_NAME,
    city = FOUNDER_LOCATION,
}: {
    founderName?: string;
    city?: string;
}) {
    return (
        <section className="bg-paper px-5 py-section lg:py-section-lg">
            <div className="mx-auto max-w-6xl">
                <Reveal className="max-w-3xl">
                    <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                        Where we are
                    </p>
                    <h2 className="mt-5 font-display text-h2 font-bold text-ink">
                        A thousand menus, and still one person you can call.
                    </h2>
                    <p className="mt-5 text-body text-ink-70">
                        vsite is built and run from Tamil Nadu, for Tamil Nadu. That is not a marketing line —
                        it is why support answers in Tamil, on WhatsApp, from someone who knows what a tiffin
                        centre menu looks like.
                    </p>
                </Reveal>

                <Reveal className="mt-10 grid sm:mt-12 gap-5 md:grid-cols-3" stagger={110}>
                    {STATS.map((s) => (
                        <div
                            key={s.label}
                            data-reveal="up"
                            className="lift rounded-card-lg border border-line bg-white p-7"
                        >
                            <p className="font-display text-4xl font-bold tracking-[-0.04em] text-ink sm:text-[2.75rem]">
                                {s.value}
                            </p>
                            <p className="mt-1.5 text-[17px] font-semibold text-ink">{s.label}</p>
                            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-70">{s.note}</p>
                        </div>
                    ))}
                </Reveal>

                <Reveal
                    variant="up"
                    delay={140}
                    className="mt-5 flex flex-col gap-8 rounded-card-lg bg-paper-2 p-7 sm:p-10 lg:flex-row lg:items-center lg:gap-12"
                >
                    <blockquote className="flex-1">
                        <p className="text-xl leading-relaxed text-ink sm:text-[1.35rem]">
                            “If your menu comes out wrong, message me on WhatsApp and I will fix it that day.
                            That is the whole support policy. No ticket number, no queue.”
                        </p>
                        <footer className="mt-6 flex items-center gap-3">
                            <div aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-paper">
                                {FOUNDER_INITIALS}
                            </div>
                            <div>
                                <p className="text-[15px] font-semibold text-ink">{founderName}</p>
                                <p className="text-sm text-ink-70">{FOUNDER_TITLE} · {city}</p>
                            </div>
                        </footer>
                    </blockquote>

                    <a
                        href={whatsappUrl(`Hi ${FOUNDER_NAME}, I saw vsite online and want to set up my menu.`)}
                        className="press inline-flex h-14 shrink-0 items-center justify-center gap-2.5 rounded-full bg-ink px-8 text-[17px] font-semibold text-paper transition-colors hover:bg-ink-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                        <MessageCircle className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                        Message us on WhatsApp
                    </a>
                </Reveal>
            </div>
        </section>
    );
}
