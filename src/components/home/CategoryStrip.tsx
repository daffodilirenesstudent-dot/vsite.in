'use client';

import { useInView } from '@/hooks/useInView';

const restaurantTypes = [
    { icon: 'coffee', label: 'Cafes' },
    { icon: 'restaurant', label: 'Restaurants' },
    { icon: 'cloud', label: 'Cloud Kitchens' },
    { icon: 'takeout_dining', label: 'QSR & Takeaway' },
    { icon: 'sports_bar', label: 'Bars & Pubs' },
    { icon: 'food_bank', label: 'Food Courts' },
];

export default function CategoryStrip() {
    const { ref: labelRef, visible: labelVisible } = useInView(0.3);
    const { ref: gridRef, visible: gridVisible } = useInView(0.2);

    return (
        <section className="bg-white border-b border-slate-100 px-4 py-10 sm:py-12">
            <div className="mx-auto max-w-5xl">
                <p
                    ref={labelRef}
                    className={`text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-7 sm:mb-8
                        transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                        ${labelVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                >
                    Works for every type of food business
                </p>
                <div ref={gridRef} className="grid grid-cols-3 sm:grid-cols-6 gap-4 sm:gap-6">
                    {restaurantTypes.map((t, i) => (
                        <div
                            key={t.label}
                            className={`flex flex-col items-center gap-2 sm:gap-2.5
                                transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                                ${gridVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-5 scale-[0.88]'}`}
                            style={{ transitionDelay: gridVisible ? `${i * 55}ms` : '0ms' }}
                        >
                            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center
                                hover:bg-slate-100 hover:border-slate-200 hover:scale-110 hover:-translate-y-0.5
                                transition-all duration-300 ease-out cursor-default">
                                <span className="material-symbols-outlined text-slate-400 text-lg sm:text-xl">{t.icon}</span>
                            </div>
                            <span className="text-[10px] sm:text-xs font-medium text-slate-500 text-center leading-tight">{t.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
