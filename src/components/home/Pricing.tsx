'use client';

import Link from 'next/link';
import { useInView } from '@/hooks/useInView';

const qrFeatures = [
    'Clean digital menu (no printing needed)',
    'Auto-generated food images & descriptions',
    'Edit menu anytime (add/remove/update)',
    'Highlight offers & sold-out items live',
    'Works for dine-in & takeaway',
    'NFC card + QR stickers included',
];

// Kept for unfreeze — see @/lib/productFlags.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const payEatFeatures = [
    'Everything in Smart QR Menu, plus —',
    'Customers place orders directly from phone',
    'Accept UPI, GPay, PhonePe & cash',
    'Instant order to kitchen (live)',
    'Automatic billing (no manual work)',
    'Smart queue (handles rush smoothly)',
    'Sell more with faster table turnover',
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const qrOrderFeatures = [
    'Everything in Smart QR Menu, plus —',
    'Customers order directly from their phone',
    'No payment step — pay at counter when done',
    'Kitchen gets instant order notifications',
    'Orders accumulate per table until bill is requested',
    'One-tap "Request Bill" button for customers',
    'Table-specific QR codes only',
];

export default function Pricing() {
    const { ref: headerRef, visible: headerVisible } = useInView(0.2);
    const { ref: cardsRef, visible: cardsVisible } = useInView(0.08);
    const { ref: bannerRef, visible: bannerVisible } = useInView(0.2);

    return (
        <section id="pricing" className="py-14 sm:py-20 lg:py-28 px-4 bg-white">
            <div className="mx-auto max-w-5xl">

                {/* Header */}
                <div
                    ref={headerRef}
                    className={`text-center mb-8 sm:mb-12 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                        ${headerVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.98]'}`}
                >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-4">Simple, Honest Pricing</p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
                        Less Than What You Spend on Printing.<br className="hidden sm:block" />{' '}
                        <span className="text-slate-400">Every Month.</span>
                    </h2>
                    <p className="mt-4 sm:mt-5 text-sm sm:text-base lg:text-lg text-slate-500 max-w-2xl mx-auto">
                        One-time setup. One small monthly fee.
                        No hidden charges. No per-order commission. Your revenue stays 100% yours.
                    </p>
                    <p className="mt-2 text-xs sm:text-sm font-semibold text-primary/80 tracking-wide">
                        India&apos;s fastest-growing digital menu software — trusted by restaurants across Tamil Nadu.
                    </p>
                </div>

                {/* Cards */}
                <div ref={cardsRef} className="grid grid-cols-1 max-w-md mx-auto gap-4 sm:gap-6 mb-5 sm:mb-8">

                    {/* Smart QR Menu */}
                    <div
                        className={`bg-white rounded-2xl sm:rounded-3xl border border-slate-100 p-5 sm:p-7 lg:p-8 flex flex-col shadow-sm
                            hover:shadow-lg hover:-translate-y-1 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                            ${cardsVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-[0.97]'}`}
                    >
                        <div className="mb-4 sm:mb-6">
                            <span className="inline-block border border-green-500 text-green-600 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3 sm:mb-4">
                                Smart QR Menu
                            </span>
                            <p className="text-slate-500 text-xs sm:text-sm mb-4 sm:mb-5">View-only digital menu for your tables</p>
                            <div className="flex items-baseline gap-1 mb-2 sm:mb-3">
                                <span className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">₹299</span>
                                <span className="text-slate-400 text-sm">/ month</span>
                            </div>
                            <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-slate-600">
                                <span className="material-symbols-outlined text-slate-400 text-sm sm:text-base">info</span>
                                No setup fee · Billed every 30 days
                            </div>
                        </div>

                        <ul className="space-y-2 sm:space-y-3 flex-1 mb-6 sm:mb-8">
                            {qrFeatures.map((f) => (
                                <li key={f} className="flex items-start gap-2 sm:gap-2.5 text-xs sm:text-sm text-slate-700">
                                    <span className="material-symbols-outlined text-green-500 text-sm sm:text-base shrink-0 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                    {f}
                                </li>
                            ))}
                        </ul>

                        <Link
                            href="/signup"
                            className="flex items-center justify-center gap-2 border-2 border-green-500 text-green-600 px-5 py-3 sm:px-6 sm:py-3.5 rounded-full font-bold text-sm sm:text-base hover:bg-green-500 hover:text-white hover:scale-[1.02] active:scale-95 transition-all duration-300"
                        >
                            Start Free — 7 Days
                            <span className="material-symbols-outlined text-lg sm:text-xl">arrow_forward</span>
                        </Link>
                        <p className="text-center text-[11px] sm:text-xs text-slate-400 mt-2">No credit card. No commitment.</p>
                    </div>

                </div>

                {/* Trial banner */}
                <div
                    ref={bannerRef}
                    className={`bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-100 px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex items-start sm:items-center gap-3 sm:gap-4
                        transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                        ${bannerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
                    style={{ transitionDelay: bannerVisible ? '200ms' : '0ms' }}
                >
                    <span className="material-symbols-outlined text-primary text-2xl sm:text-3xl shrink-0">redeem</span>
                    <div>
                        <p className="font-bold text-slate-900 text-sm sm:text-base">Every plan includes a 7-day completely free trial.</p>
                        <p className="text-slate-500 text-xs sm:text-sm mt-0.5">No credit card. No payment details. No commitment. Use the full product free for 7 days — then decide.</p>
                    </div>
                </div>

            </div>
        </section>
    );
}
