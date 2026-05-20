'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useInView } from '@/hooks/useInView';

const stats = [
    {
        number: '1', icon: 'trending_up', iconBg: 'bg-red-50', iconColor: 'text-red-500',
        numberBg: 'bg-red-500', value: '₹2,400+', valueColor: 'text-red-600',
        label: 'LOST EVERY DAY',
        lines: ["Customers order less when they don't see what they're craving.", 'No photos. No upsell. No impulse decisions.'],
        noteIcon: 'calculate', noteIconColor: 'text-red-400', noteBg: 'bg-red-50',
        note: 'That\'s ~₹120 extra per table × 20 tables/day = ₹2,400 gone.', noteColor: 'text-red-700',
    },
    {
        number: '2', icon: 'print', iconBg: 'bg-slate-50', iconColor: 'text-slate-500',
        numberBg: 'bg-slate-700', value: '₹3,500+', valueColor: 'text-slate-800',
        label: '/ MONTH',
        lines: ['Every time prices change, menus get reprinted.', 'Design → Print → Distribute → Repeat.'],
        noteIcon: 'timer', noteIconColor: 'text-slate-500', noteBg: 'bg-slate-50',
        note: 'Digital menu: update in 10 seconds. Cost: ₹0', noteColor: 'text-slate-600',
    },
    {
        number: '3', icon: 'support_agent', iconBg: 'bg-green-50', iconColor: 'text-green-600',
        numberBg: 'bg-green-500', value: '2+ HOURS', valueColor: 'text-green-700',
        label: 'WASTED DAILY',
        lines: ['Waiters explain the same menu again and again.'],
        noteIcon: 'schedule', noteIconColor: 'text-green-600', noteBg: 'bg-green-50',
        note: "That's time they could use to serve more tables faster.", noteColor: 'text-green-800',
    },
    {
        number: '4', icon: 'table_restaurant', iconBg: 'bg-amber-50', iconColor: 'text-amber-600',
        numberBg: 'bg-amber-500', value: '2–3 TABLES', valueColor: 'text-amber-700',
        label: 'LOST EVERY PEAK HOUR',
        lines: ['Slow ordering = longer wait = customers walk away.'],
        noteIcon: 'speed', noteIconColor: 'text-amber-600', noteBg: 'bg-amber-50',
        note: 'Faster ordering = more table turnover = more revenue', noteColor: 'text-amber-800',
    },
];

export default function LossAversion() {
    const { ref: headerRef, visible: headerVisible } = useInView(0.15);
    const { ref: statsRef, visible: statsVisible } = useInView(0.06);
    const { ref: calloutRef, visible: calloutVisible } = useInView(0.15);

    return (
        <section className="py-14 sm:py-20 lg:py-28 px-4 bg-white">
            <div className="mx-auto max-w-5xl">

                {/* Header */}
                <div
                    ref={headerRef}
                    className="flex flex-col lg:flex-row items-center gap-8 sm:gap-10 mb-10 sm:mb-14"
                >
                    <div
                        className={`flex-1 text-center lg:text-left transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                            ${headerVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}
                    >
                        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight mb-4 sm:mb-5">
                            Paper Menus Are{' '}
                            <span className="text-red-600">Quietly Killing</span>{' '}
                            Your Daily Revenue
                        </h2>
                        <div className="w-10 h-0.5 bg-red-400 rounded-full mb-4 sm:mb-5 mx-auto lg:mx-0" />
                        <p className="text-slate-600 text-sm sm:text-base lg:text-lg leading-relaxed max-w-lg mx-auto lg:mx-0">
                            This isn&apos;t about printing costs. This is about how much money
                            your restaurant is{' '}
                            <span className="text-red-600 font-semibold">losing every single day</span>{' '}
                            without you realising it.
                        </p>
                    </div>

                    <div
                        className={`shrink-0 w-full max-w-[240px] sm:max-w-xs lg:max-w-[280px] mx-auto lg:mx-0
                            transition-all duration-700 delay-150 ease-[cubic-bezier(0.22,1,0.36,1)]
                            ${headerVisible ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-8 scale-[0.96]'}`}
                    >
                        <Image
                            src="/losscomparestock.jpg"
                            alt="Digital menu vs paper menu comparison"
                            width={600}
                            height={500}
                            sizes="(max-width: 640px) 240px, (max-width: 1024px) 320px, 280px"
                            className="w-full h-auto object-contain drop-shadow-lg hover:scale-[1.02] transition-transform duration-500"
                        />
                    </div>
                </div>

                {/* 2×2 Stat Cards */}
                <div ref={statsRef} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 mb-6 sm:mb-8">
                    {stats.map((s, i) => (
                        <div
                            key={s.number}
                            className={`rounded-xl sm:rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden
                                hover:shadow-md hover:-translate-y-0.5
                                transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                                ${statsVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.97]'}`}
                            style={{ transitionDelay: statsVisible ? `${i * 90}ms` : '0ms' }}
                        >
                            <div className="p-4 sm:p-5 lg:p-6">
                                <div className="flex items-start gap-3 mb-3 sm:mb-4">
                                    <div className={`w-6 h-6 rounded-full ${s.numberBg} flex items-center justify-center shrink-0 mt-0.5`}>
                                        <span className="text-white text-[10px] font-bold">{s.number}</span>
                                    </div>
                                    <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${s.iconBg} flex items-center justify-center`}>
                                        <span className={`material-symbols-outlined text-xl sm:text-2xl ${s.iconColor}`}>{s.icon}</span>
                                    </div>
                                </div>
                                <div className={`text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight ${s.valueColor} leading-none mb-1`}>
                                    {s.value}
                                </div>
                                <div className="text-slate-700 font-bold text-xs sm:text-sm uppercase tracking-wide mb-2 sm:mb-3">
                                    {s.label}
                                </div>
                                <div className="space-y-1">
                                    {s.lines.map((line, j) => (
                                        <p key={j} className="text-slate-500 text-xs sm:text-sm leading-relaxed">{line}</p>
                                    ))}
                                </div>
                            </div>
                            <div className={`${s.noteBg} px-4 sm:px-5 lg:px-6 py-3 flex items-start gap-2 border-t border-slate-100`}>
                                <span className={`material-symbols-outlined text-sm shrink-0 mt-0.5 ${s.noteIconColor}`}>{s.noteIcon}</span>
                                <p className={`text-[11px] sm:text-xs font-medium ${s.noteColor}`}>{s.note}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bottom callout */}
                <div
                    ref={calloutRef}
                    className={`rounded-xl sm:rounded-2xl bg-slate-50 border border-slate-100 p-5 sm:p-6 lg:p-8
                        transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                        ${calloutVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.98]'}`}
                >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-red-500 flex items-center justify-center shrink-0 shadow-lg">
                            <span className="material-symbols-outlined text-white text-2xl sm:text-3xl">trending_down</span>
                        </div>
                        <div className="flex-1">
                            <p className="text-slate-700 font-semibold text-sm sm:text-base mb-1">Your Real Loss Isn&apos;t ₹3,500…</p>
                            <p className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-red-600 leading-tight mb-2">
                                It&apos;s ₹18,000 – ₹32,000
                                <span className="text-slate-900"> Every Month</span>
                            </p>
                            <p className="text-slate-500 text-xs sm:text-sm mb-3 sm:mb-4">And that&apos;s just from:</p>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { icon: 'shopping_cart', label: 'Missed upsells' },
                                    { icon: 'hourglass_empty', label: 'Slow service' },
                                    { icon: 'person_off', label: 'Lost customers' },
                                ].map((pill) => (
                                    <div key={pill.label} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-semibold px-2.5 py-1.5 rounded-full">
                                        <span className="material-symbols-outlined text-red-500 text-sm">{pill.icon}</span>
                                        {pill.label}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="mt-5 sm:mt-6 pt-5 border-t border-slate-200 text-center">
                        <p className="text-slate-500 text-xs sm:text-sm mb-4">vsite costs a fraction of that — and the first 14 days are completely free.</p>
                        <Link
                            href="/signup"
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-white px-7 py-3.5 rounded-full font-bold text-sm sm:text-base hover:bg-primary-dark hover:scale-[1.03] active:scale-95 transition-all duration-300 shadow-lg shadow-primary/25"
                        >
                            Start Your Free Trial
                            <span className="material-symbols-outlined text-xl">arrow_forward</span>
                        </Link>
                    </div>
                </div>

            </div>
        </section>
    );
}
