'use client';

import { ChevronDown } from 'lucide-react';
import Reveal from './Reveal';

/**
 * Objection handling, ordered by how much each objection costs.
 *
 * "Can customers order from the menu?" is first because it is the question
 * that decides whether the sale survives week one. Answering it honestly at
 * the top of the FAQ costs a few signups and saves the refunds and the
 * one-star reviews that follow the alternative.
 *
 * Native <details>/<summary>: keyboard accessible, works without JS, and the
 * answers stay in the DOM for Google.
 */

const FAQS = [
    {
        q: 'Can customers order from the menu?',
        a: 'Not today. vsite shows your menu; your server takes the order as usual. In-menu ordering and payment are being built, and existing customers get them first — but we are not going to sell you something that does not exist yet.',
    },
    {
        q: 'My menu is handwritten in a notebook. Will it work?',
        a: 'That is the case we built it for. Photograph the page. You will fix a line or two afterwards, and the whole thing still takes under three minutes.',
    },
    {
        q: 'What happens after the 7 free days?',
        a: 'We ask you to pay ₹299. If you do not, the menu pauses — nothing is deleted, and it comes straight back whenever you return. We never take a card before day 8.',
    },
    {
        q: 'Do you take a cut of my sales?',
        a: 'No. ₹299 a month is the entire relationship. No commission, no per-scan fee, no charge for the NFC card.',
    },
    {
        q: 'Do my customers need to install anything?',
        a: 'No. It opens in the phone’s own browser. Older Android, iPhone, a borrowed phone — all the same.',
    },
    {
        q: 'Is support in Tamil?',
        a: 'Yes — on WhatsApp, from a person, in Tamil or English.',
    },
];

export default function FAQ() {
    return (
        <section className="bg-paper-2 px-5 py-section lg:py-section-lg">
            <div className="mx-auto flex max-w-6xl flex-col gap-12 lg:flex-row lg:gap-16">
                <Reveal className="lg:w-80 lg:shrink-0">
                    <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                        Before you sign up
                    </p>
                    <h2 className="mt-5 font-display text-h2 font-bold text-ink">
                        The questions people actually ask.
                    </h2>
                </Reveal>

                <Reveal className="flex flex-1 flex-col" stagger={70}>
                    {FAQS.map((f, i) => (
                        <details
                            key={f.q}
                            data-reveal="up"
                            open={i === 0}
                            className={`group border-t border-[#D9D3C8] ${i === FAQS.length - 1 ? 'border-b' : ''}`}
                        >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-6 text-left text-[17px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                                {f.q}
                                <ChevronDown
                                    className="h-5 w-5 shrink-0 text-ink-45 transition-transform duration-300 ease-out-expo group-open:rotate-180"
                                    strokeWidth={2}
                                    aria-hidden
                                />
                            </summary>
                            <p className="pb-6 pr-9 text-base leading-relaxed text-ink-70">{f.a}</p>
                        </details>
                    ))}
                </Reveal>
            </div>
        </section>
    );
}
