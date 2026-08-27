'use client';

import Image from 'next/image';
import Reveal from './Reveal';

/**
 * "So what does my customer actually do?"
 *
 * This is the question every owner asks before they will put a code on a
 * table, and the previous version buried it under a benefit headline ("No app.
 * No sign-up.") with three loose cards. It is now asked out loud and answered
 * as a numbered journey with a connecting line, because a flow needs to read
 * as a sequence, not as a set of features.
 *
 * Step 4 is deliberately "they tell your server" — that is what actually
 * happens today, and it also quietly reassures the owner that nothing about
 * how their floor runs has to change.
 */

const STEPS = [
    {
        n: '1',
        time: 'Already there',
        title: 'They sit down and see the stand',
        body: 'The QR card is on the table before they arrive. Nobody has to wave at a waiter to get a menu.',
    },
    {
        n: '2',
        time: '2 seconds',
        title: 'They point their phone camera at it',
        body: 'Just the normal camera app. No scanner app to download, no typing, no Wi-Fi password.',
    },
    {
        n: '3',
        time: 'Under a second',
        title: 'Your menu opens with photos and prices',
        body: 'In their own browser. Nothing to install, nothing to sign up for — works on an old Android too.',
    },
    {
        n: '4',
        time: 'Faster than before',
        title: 'They tell your server what they want',
        body: 'Same as always — except they have already decided, and they have seen a dish they would never have asked about.',
    },
];

export default function DinerFlow() {
    return (
        <section className="bg-paper px-5 py-section lg:py-section-lg">
            <div className="mx-auto max-w-6xl">
                <Reveal className="max-w-3xl">
                    <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                        Your customer’s flow
                    </p>
                    <h2 className="mt-5 font-display text-h2 font-bold text-ink">
                        So what does your customer actually do?
                    </h2>
                    <p className="mt-5 text-body text-ink-70">
                        Four steps, and your floor works exactly the way it works today. Nothing to install,
                        nothing to sign up for, nothing for you to explain at the table.
                    </p>
                </Reveal>

                {/* The journey. Horizontal rail on desktop, vertical on mobile —
                    the connecting line is what makes it read as a sequence. */}
                <Reveal className="relative mt-10 grid sm:mt-12 gap-8 md:grid-cols-4 md:gap-6" stagger={130}>
                    {/* Rail */}
                    <div
                        aria-hidden
                        className="absolute left-[1.4rem] top-3 hidden h-[calc(100%-2rem)] w-px bg-line sm:block md:left-0 md:top-[1.4rem] md:h-px md:w-full"
                    />

                    {STEPS.map(({ n, time, title, body }) => (
                        <div key={n} data-reveal="up" className="relative flex gap-5 sm:gap-6 md:flex-col md:gap-0">
                            <div className="relative z-10 flex shrink-0 flex-col items-center md:flex-row md:gap-3">
                                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-[15px] font-bold text-accent-text shadow-sm">
                                    {n}
                                </span>
                            </div>

                            <div className="md:mt-6">
                                <p className="text-caption font-semibold uppercase tracking-[0.08em] text-ink-45">
                                    {time}
                                </p>
                                <h3 className="mt-1.5 text-h3 font-semibold text-ink">{title}</h3>
                                <p className="mt-2 text-[15px] leading-relaxed text-ink-70">{body}</p>
                            </div>
                        </div>
                    ))}
                </Reveal>

                {/* What they see at step 3, shown once rather than described four times. */}
                <Reveal
                    variant="up"
                    delay={140}
                    className="mt-9 flex flex-col items-center gap-8 sm:mt-11 rounded-card-lg bg-paper-2 p-7 sm:p-10 lg:flex-row lg:gap-14"
                >
                    <div className="hidden shrink-0 items-center gap-5 lg:flex">
                        <div data-mock="true" className="w-[8.5rem] overflow-hidden rounded-[1.4rem] border-[5px] border-ink bg-paper shadow-xl">
                            <div className="relative h-16">
                                <Image src="/menu-photos/chicken-biryani.jpg" alt="" fill sizes="136px" className="object-cover" loading="lazy" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                                <p className="absolute inset-x-0 bottom-0 p-2 text-[11px] font-bold text-white">Saravana Mess</p>
                            </div>
                            <ul className="flex flex-col gap-1 p-2">
                                {[
                                    { s: '/menu-photos/fish-65.jpg', n: 'Fish 65', p: '₹240' },
                                    { s: '/menu-photos/gobi-manchurian.jpg', n: 'Gobi 65', p: '₹160' },
                                    { s: '/menu-photos/rose-milk.jpg', n: 'Rose Milk', p: '₹40' },
                                ].map((d) => (
                                    <li key={d.n} className="flex items-center gap-1.5 rounded-lg border border-line p-1">
                                        <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded">
                                            <Image src={d.s} alt="" fill sizes="24px" className="object-cover" loading="lazy" />
                                        </div>
                                        <span className="flex-1 truncate text-[9px] font-semibold text-ink">{d.n}</span>
                                        <span className="text-[9px] text-ink-70">{d.p}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="flex-1">
                        <h3 className="text-h3 font-bold text-ink">This is all they ever see.</h3>
                        <p className="mt-3 text-body text-ink-70">
                            One page. Photos, prices, what’s finished for the day, and today’s offer. They never
                            make an account, never give a phone number, and never leave their browser.
                        </p>
                        <p className="mt-4 rounded-card border border-dashed border-[#B8B0A3] px-4 py-3 text-[15px] text-ink-70">
                            <strong className="font-semibold text-ink">Nothing changes for your staff.</strong>{' '}
                            Your server still takes the order at the table, exactly as they do now.
                        </p>
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
