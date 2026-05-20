'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useInView } from '@/hooks/useInView';

const features = [
    {
        tag: 'Inventory Control',
        title: <>Live Product <span className="text-primary">Inventory</span> Updates</>,
        description: 'Keep your menu in sync with your kitchen — always. When a dish runs out, mark it unavailable in seconds and it disappears from every customer\'s menu instantly. No more awkward "sorry, that\'s not available" moments.',
        bullets: [
            'Mark items out-of-stock in one tap',
            'Changes go live across all customer phones instantly',
            'Low-stock alerts before you run out',
        ],
        image: '/productinven.png',
        imageAlt: 'Live product inventory management',
        reverse: false,
    },
    {
        tag: 'Order Management',
        title: <>Real-Time <span className="text-primary">Live Orders</span> View</>,
        description: 'Watch orders arrive the moment customers place them — directly on your phone or any device. No missed orders, no back-and-forth. Your kitchen and serving staff stay perfectly in sync, even during the busiest rush.',
        bullets: [
            'Orders appear in real-time — zero delay',
            'Track status: New → In Kitchen → Ready → Served',
            'Works across multiple devices simultaneously',
        ],
        image: '/orderpage.png',
        imageAlt: 'Live orders management',
        reverse: true,
    },
    {
        tag: 'Business Intelligence',
        title: <>Powerful <span className="text-primary">Admin Dashboard</span> Insights</>,
        description: 'Stop guessing what\'s working. Your dashboard shows daily revenue, total orders, average order value, and your bestselling dishes — all in one place. Make better decisions backed by real data.',
        bullets: [
            'Revenue and order trends at a glance',
            'Discover your most popular dishes',
            'Export daily reports in one click',
        ],
        image: '/dashboardpage.png',
        imageAlt: 'Admin dashboard insights',
        reverse: false,
    },
];

function FeatureRow({ feat, index }: { feat: typeof features[0]; index: number }) {
    const { ref, visible } = useInView(0.1);

    const imgFrom = feat.reverse
        ? 'translate-x-10 scale-[0.96]'
        : '-translate-x-10 scale-[0.96]';

    return (
        <div
            ref={ref}
            className={`flex flex-col gap-8 sm:gap-12 lg:gap-16 lg:items-center ${feat.reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'}`}
        >
            {/* Image */}
            <div
                className={`flex-1 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                    ${visible ? 'opacity-100 translate-x-0 scale-100' : `opacity-0 ${imgFrom}`}`}
            >
                <Image
                    src={feat.image}
                    alt={feat.imageAlt}
                    width={1200}
                    height={800}
                    sizes="(max-width: 1024px) 100vw, 560px"
                    className="w-full h-auto rounded-xl sm:rounded-2xl shadow-sm hover:shadow-xl hover:scale-[1.015] transition-all duration-500 ease-out"
                    priority={index === 0}
                />
            </div>

            {/* Text */}
            <div
                className={`flex-1 space-y-4 sm:space-y-5 transition-all duration-700 delay-100 ease-[cubic-bezier(0.22,1,0.36,1)]
                    ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
                <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.14em] text-primary bg-primary/8 px-3 py-1.5 rounded-full">
                    {feat.tag}
                </span>
                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 leading-tight">
                    {feat.title}
                </h3>
                <p className="text-sm sm:text-base lg:text-lg text-slate-500 leading-relaxed">
                    {feat.description}
                </p>
                <ul className="space-y-2.5 sm:space-y-3">
                    {feat.bullets.map((b, bi) => (
                        <li
                            key={b}
                            className={`flex items-start gap-2.5 sm:gap-3 text-slate-700 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                                ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
                            style={{ transitionDelay: visible ? `${280 + bi * 80}ms` : '0ms' }}
                        >
                            <span className="material-symbols-outlined text-green-500 text-base mt-0.5 shrink-0">check_circle</span>
                            <span className="text-sm sm:text-base">{b}</span>
                        </li>
                    ))}
                </ul>

            </div>
        </div>
    );
}

export default function PainSection() {
    const { ref: headerRef, visible: headerVisible } = useInView(0.2);

    return (
        <section className="py-14 sm:py-20 lg:py-28 px-4 bg-white">
            <div className="mx-auto max-w-6xl">

                <div
                    ref={headerRef}
                    className={`text-center mb-12 sm:mb-16 lg:mb-20 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                        ${headerVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.98]'}`}
                >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-4">Smart Features</p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
                        A digital menu made for<br className="hidden sm:block" />{' '}
                        <span className="text-slate-400">all your business needs</span>
                    </h2>
                    <p className="mt-4 sm:mt-5 text-sm sm:text-base lg:text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
                        Everything you need to manage your menu, track orders, and grow your restaurant — from one simple dashboard.
                    </p>
                </div>

                <div className="flex flex-col gap-14 sm:gap-20 lg:gap-28">
                    {features.map((feat, i) => (
                        <FeatureRow key={i} feat={feat} index={i} />
                    ))}
                </div>

                <div className="mt-14 sm:mt-20 text-center">
                    <Link
                        href="/signup"
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-full font-bold text-base sm:text-lg shadow-lg shadow-primary/25 hover:bg-primary-dark hover:scale-[1.03] active:scale-95 transition-all duration-300"
                    >
                        Start Your Free 14-Day Trial
                        <span className="material-symbols-outlined text-xl">arrow_forward</span>
                    </Link>
                </div>
            </div>
        </section>
    );
}
