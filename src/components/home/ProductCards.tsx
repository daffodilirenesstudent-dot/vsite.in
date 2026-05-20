'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useInView } from '@/hooks/useInView';

const cards = [
    {
        number: '01',
        accent: '#22c55e',
        accentBg: 'rgba(34,197,94,0.10)',
        accentBorder: 'rgba(34,197,94,0.25)',
        tag: 'Menu Engineering',
        title: 'Grow revenue up to 15% — without adding a single new dish.',
        description: 'Our AI analyses every item on your menu and tells you exactly what to push, what to reprice, and what to retire. Best sellers, hidden gems, and slow movers — surfaced automatically every week so you always know where your money is coming from.',
        image: '/productinven.png',
        imageAlt: 'vsite menu engineering and AI analysis',
        bullets: ['AI ranks best-selling & most-ordered items', 'Popular item badges shown to customers', 'Weekly insights — no spreadsheets needed'],
    },
    {
        number: '02',
        accent: '#6366f1',
        accentBg: 'rgba(99,102,241,0.10)',
        accentBorder: 'rgba(99,102,241,0.25)',
        tag: 'AI Food Photos',
        title: 'Every dish looks irresistible — automatically.',
        description: 'No photographer. No studio. No cost. The moment you add an item, our AI generates a high-accuracy food photo that matches your dish — the right colours, plating style, and portion size. Menus with photos get 30% more orders than those without.',
        image: '/orderpage.png',
        imageAlt: 'vsite AI generated food photos',
        bullets: ['Accurate photos matched to each dish', 'Generated instantly on item creation', 'Replace with your own photo anytime'],
    },
    {
        number: '03',
        accent: '#f59e0b',
        accentBg: 'rgba(245,158,11,0.10)',
        accentBorder: 'rgba(245,158,11,0.25)',
        tag: 'Offers & Banners',
        title: 'Put your offer in front of every customer — in under 1 minute.',
        description: 'Running a lunch deal? A weekend special? A new launch? Add a banner or offer to your digital menu in seconds — no designer, no tech skills, no waiting. Every customer who scans your QR sees it the moment it goes live.',
        image: '/dashboardpage.png',
        imageAlt: 'vsite offer and banner management',
        bullets: ['Live on your menu in under 1 minute', 'Full-width banners & limited-time offers', 'No designer or tech skills needed'],
    },
];

export default function ProductCards() {
    const { ref: headerRef, visible: headerVisible } = useInView(0.2);

    return (
        <section id="features" className="py-16 sm:py-24 lg:py-32 px-4 bg-white">
            <div className="mx-auto max-w-6xl">

                {/* Header */}
                <div
                    ref={headerRef}
                    className={`text-center mb-14 sm:mb-20 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                        ${headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                >
                    <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-5">
                        <span className="w-5 h-px bg-slate-200" />
                        What you get
                        <span className="w-5 h-px bg-slate-200" />
                    </span>
                    <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-[1.05] tracking-tight">
                        Three tools.<br />
                        <span className="text-slate-400">One restaurant.</span>
                    </h2>
                    <p className="mt-5 text-sm sm:text-lg text-slate-500 max-w-lg mx-auto leading-relaxed">
                        Everything you need to run a modern restaurant — menu, orders, and revenue — built into one simple platform.
                    </p>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-5 sm:gap-6">
                    {cards.map((card, i) => (
                        <FeatureCard key={card.number} card={card} index={i} />
                    ))}
                </div>

                {/* CTA */}
                <div className="mt-14 sm:mt-16 text-center">
                    <Link
                        href="/signup"
                        className="inline-flex items-center gap-2 bg-primary text-white px-8 py-4 rounded-full font-bold text-base hover:bg-primary-dark hover:scale-[1.03] active:scale-95 transition-all duration-300 shadow-lg shadow-primary/25"
                    >
                        Start your free 14-day trial
                        <span className="material-symbols-outlined text-xl">arrow_forward</span>
                    </Link>
                    <p className="mt-3 text-xs text-slate-400">No credit card · Setup in 3 minutes · Cancel anytime</p>
                </div>

            </div>
        </section>
    );
}

function FeatureCard({ card, index }: { card: typeof cards[0]; index: number }) {
    const { ref, visible } = useInView(0.08);
    const isEven = index % 2 === 0;

    return (
        <div
            ref={ref}
            className={`rounded-2xl sm:rounded-3xl overflow-hidden border transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
            style={{
                transitionDelay: `${index * 100}ms`,
                borderColor: card.accentBorder,
                background: 'white',
            }}
        >
            <div className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} min-h-[420px] sm:min-h-[460px]`}>

                {/* Text side */}
                <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14 lg:w-[42%] lg:shrink-0">

                    {/* Number + Tag */}
                    <div className="flex items-center gap-3 mb-6">
                        <span
                            className="text-[11px] font-black tracking-[0.2em] uppercase"
                            style={{ color: card.accent }}
                        >
                            {card.number}
                        </span>
                        <span className="w-6 h-px" style={{ background: card.accentBorder }} />
                        <span
                            className="text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full border"
                            style={{ color: card.accent, borderColor: card.accentBorder, background: card.accentBg }}
                        >
                            {card.tag}
                        </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 leading-snug mb-4 tracking-tight">
                        {card.title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm sm:text-base text-slate-500 leading-relaxed mb-7">
                        {card.description}
                    </p>

                    {/* Bullets */}
                    <ul className="space-y-2.5">
                        {card.bullets.map((b) => (
                            <li key={b} className="flex items-center gap-2.5 text-sm text-slate-700">
                                <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ background: card.accent }}
                                />
                                {b}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Image side */}
                <div className="relative flex-1 min-h-[240px] sm:min-h-[300px] lg:min-h-0 overflow-hidden">
                    {/* Gradient fade toward text side */}
                    <div
                        className={`absolute inset-y-0 z-10 w-16 sm:w-24 pointer-events-none`}
                        style={{
                            [isEven ? 'left' : 'right']: 0,
                            background: isEven
                                ? 'linear-gradient(to right, #ffffff, transparent)'
                                : 'linear-gradient(to left, #ffffff, transparent)',
                        }}
                    />

                    {/* Accent glow behind image */}
                    <div
                        className="absolute inset-0 opacity-20 pointer-events-none"
                        style={{
                            background: `radial-gradient(ellipse at center, ${card.accent} 0%, transparent 70%)`,
                        }}
                    />

                    <Image
                        src={card.image}
                        alt={card.imageAlt}
                        fill
                        sizes="(max-width: 1024px) 100vw, 60vw"
                        className="object-cover object-left-top"
                        priority={index === 0}
                    />
                </div>
            </div>
        </div>
    );
}
