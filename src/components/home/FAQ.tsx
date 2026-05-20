'use client';

import { useState } from 'react';
import { useInView } from '@/hooks/useInView';

const faqs = [
    {
        q: 'Do my customers need to download an app to use the digital menu?',
        a: 'No. Customers simply tap the NFC card or scan the QR sticker with their phone camera. The menu opens instantly in their browser — no app download, no sign-up, no friction.',
    },
    {
        q: 'How long does it take to set up my digital menu?',
        a: 'About 3 minutes. Take a photo of your existing paper menu, upload it, and our AI reads it, matches professional food photos, writes item descriptions, and builds your full digital menu automatically.',
    },
    {
        q: 'What if I want to update my menu prices or add new items?',
        a: 'You can edit your menu anytime from your dashboard — change prices, add or remove dishes, mark items as sold out, or post a daily special. Changes go live instantly for all customers.',
    },
    {
        q: 'Is vsite available only in Tamil Nadu?',
        a: 'vsite is built for restaurants across South India, starting with Tamil Nadu. The platform supports English and Tamil and is designed for the local F&B context — tiffin centres, cafés, hotels, food trucks, and more.',
    },
    {
        q: 'What happens after the 14-day free trial?',
        a: 'After your trial ends, you choose a plan to continue. No credit card is needed to start, and there is no automatic charge. Your menu stays safe — we will remind you before anything changes.',
    },
];

export default function FAQ() {
    const [open, setOpen] = useState<number | null>(null);
    const { ref: headerRef, visible: headerVisible } = useInView(0.2);
    const { ref: listRef, visible: listVisible } = useInView(0.08);

    return (
        <section id="faq" className="py-14 sm:py-20 lg:py-28 px-4 bg-slate-50">
            <div className="mx-auto max-w-3xl">

                {/* Header */}
                <div
                    ref={headerRef}
                    className={`text-center mb-10 sm:mb-14 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                        ${headerVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.98]'}`}
                >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-4">FAQ</p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
                        Questions You Might Have
                    </h2>
                    <p className="mt-4 sm:mt-5 text-sm sm:text-base lg:text-lg text-slate-500">
                        Everything you need to know before getting started.
                    </p>
                </div>

                {/* Accordion */}
                <div ref={listRef} className="space-y-2 sm:space-y-3">
                    {faqs.map((faq, i) => (
                        <div
                            key={i}
                            className={`bg-white rounded-xl sm:rounded-2xl border overflow-hidden
                                transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                                ${open === i ? 'border-slate-200 shadow-sm' : 'border-slate-100 hover:border-slate-200'}
                                ${listVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
                            style={{ transitionDelay: listVisible ? `${i * 70}ms` : '0ms' }}
                        >
                            <button
                                onClick={() => setOpen(open === i ? null : i)}
                                className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 lg:px-6 py-4 sm:py-5 text-left group min-h-[52px] sm:min-h-[60px]"
                            >
                                <span className={`font-semibold text-sm sm:text-base leading-snug transition-colors duration-200
                                    ${open === i ? 'text-primary' : 'text-slate-800 group-hover:text-slate-900'}`}>
                                    {faq.q}
                                </span>
                                <span
                                    className={`material-symbols-outlined text-slate-400 text-lg sm:text-xl shrink-0 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
                                        ${open === i ? 'text-primary rotate-180' : 'rotate-0'}`}
                                >
                                    expand_more
                                </span>
                            </button>

                            {/* Smooth expand via CSS grid trick */}
                            <div
                                className="grid transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                                style={{ gridTemplateRows: open === i ? '1fr' : '0fr' }}
                            >
                                <div className="overflow-hidden">
                                    <div className="px-4 sm:px-5 lg:px-6 pb-4 sm:pb-5 text-slate-600 text-sm sm:text-base leading-relaxed border-t border-slate-100 pt-3 sm:pt-4">
                                        {faq.a}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
