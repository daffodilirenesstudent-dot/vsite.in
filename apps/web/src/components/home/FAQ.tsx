'use client';

import { ChevronDown } from 'lucide-react';
import Reveal from './Reveal';
import JsonLd from '@/components/seo/JsonLd';
import { HOME_FAQS } from '@/content/faqs';
import { faqPageSchema } from '@/lib/seo/jsonld';

/**
 * Objection handling; the copy lives in `@/content/faqs` so the page, the
 * FAQPage JSON-LD below and /llms-full.txt all read the same array.
 *
 * Native <details>/<summary>: keyboard accessible, works without JS, and the
 * answers stay in the DOM for Google.
 */

export default function FAQ() {
    return (
        <section className="bg-paper-2 px-5 py-section lg:py-section-lg">
            <JsonLd data={faqPageSchema(HOME_FAQS)} />
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
                    {HOME_FAQS.map((f, i) => (
                        <details
                            key={f.q}
                            data-reveal="up"
                            open={i === 0}
                            className={`group border-t border-[#D9D3C8] ${i === HOME_FAQS.length - 1 ? 'border-b' : ''}`}
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
