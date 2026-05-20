'use client';

import { useInView } from '@/hooks/useInView';

const testimonials = [
    {
        quote: 'I took a photo of my handwritten menu on Sunday evening. By Monday morning, I had a proper digital menu with photos and everything. My customers were genuinely surprised.',
        name: 'Karthik R.',
        business: 'Saravana Café, Coimbatore',
        initials: 'KR',
        bg: 'bg-primary',
    },
    {
        quote: 'During lunch rush, we had 8 tables ordering at the same time through Pay & Eat. No queue. No confusion. My one waiter handled everything. This alone was worth it.',
        name: 'Priya M.',
        business: 'The Curry House, Chennai',
        initials: 'PM',
        bg: 'bg-purple-600',
    },
    {
        quote: 'The AI picked better food photos than I could have found myself. Customers keep telling me the menu looks very professional. Setup was 3 minutes, exactly like they said.',
        name: 'Senthil K.',
        business: 'Annachi Food Truck, Madurai',
        initials: 'SK',
        bg: 'bg-slate-700',
    },
];

export default function SocialProof() {
    const { ref: headerRef, visible: headerVisible } = useInView(0.2);
    const { ref: cardsRef, visible: cardsVisible } = useInView(0.08);

    return (
        <section className="py-14 sm:py-20 lg:py-28 px-4 bg-slate-50">
            <div className="mx-auto max-w-6xl">

                {/* Header */}
                <div
                    ref={headerRef}
                    className={`text-center mb-10 sm:mb-14 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                        ${headerVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.98]'}`}
                >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-4">Early Adopters</p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
                        Be One of the First Restaurants<br className="hidden sm:block" />{' '}
                        in Tamil Nadu to Never Print a Menu Again.
                    </h2>
                    <p className="mt-4 sm:mt-5 text-sm sm:text-base lg:text-lg text-slate-500 max-w-2xl mx-auto">
                        vsite is built specifically for restaurants, cafés, food trucks, and hotels
                        in South India — starting right here in Tamil Nadu.
                    </p>
                </div>

                {/* Testimonial Cards */}
                <div ref={cardsRef} className="grid gap-4 sm:gap-5 lg:gap-6 md:grid-cols-3">
                    {testimonials.map((t, i) => (
                        <div
                            key={t.name}
                            className={`flex flex-col rounded-xl sm:rounded-2xl border border-slate-100 bg-white p-5 sm:p-6 lg:p-8 shadow-sm
                                hover:shadow-lg hover:-translate-y-1 hover:border-slate-200
                                transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                                ${cardsVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-[0.97]'}`}
                            style={{ transitionDelay: cardsVisible ? `${i * 110}ms` : '0ms' }}
                        >
                            {/* Stars */}
                            <div className="flex gap-0.5 sm:gap-1 mb-4 sm:mb-5">
                                {[...Array(5)].map((_, j) => (
                                    <span key={j} className="material-symbols-outlined text-amber-400 text-base sm:text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>
                                        star
                                    </span>
                                ))}
                            </div>

                            <blockquote className="flex-1 text-slate-700 text-sm sm:text-base leading-relaxed italic mb-5 sm:mb-6">
                                &ldquo;{t.quote}&rdquo;
                            </blockquote>

                            <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                                <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-full ${t.bg} flex items-center justify-center text-white font-bold text-xs sm:text-sm shrink-0`}>
                                    {t.initials}
                                </div>
                                <div>
                                    <div className="font-bold text-slate-900 text-sm">{t.name}</div>
                                    <div className="text-slate-400 text-xs">{t.business}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <p className="text-center text-[11px] text-slate-400 mt-6 sm:mt-8 italic">
                    * Testimonials to be replaced with real customer quotes after beta launch.
                </p>
            </div>
        </section>
    );
}
