'use client';

import Image from 'next/image';
import { useInView } from '@/hooks/useInView';

const steps = [
    { number: '01', title: 'Customers scan your QR', desc: 'They scan the QR code on the table using their phone.', image: '/step1-HIW.png', imageAlt: 'QR code stand on restaurant table' },
    { number: '02', title: 'Menu opens instantly', desc: 'Your digital menu opens instantly with photos, prices & descriptions.', image: '/step2-HIW.png', imageAlt: 'Digital menu on phone screen' },
    { number: '03', title: 'They place the order', desc: 'Customers place order and pay securely via UPI, GPay or cash.', image: '/step3-HTW.png', imageAlt: 'Customer placing order on phone' },
    { number: '04', title: 'You get the order, they enjoy!', desc: 'You receive the order instantly & serve happy customers.', image: '/step4-HIW.png', imageAlt: 'Kitchen display showing new order' },
];

export default function CustomerExperience() {
    const { ref: headerRef, visible: headerVisible } = useInView(0.2);
    const { ref: cardsRef, visible: cardsVisible } = useInView(0.08);

    return (
        <section className="py-14 sm:py-20 lg:py-28 px-4 bg-white">
            <div className="mx-auto max-w-6xl">

                {/* Header */}
                <div
                    ref={headerRef}
                    className={`text-center mb-8 sm:mb-12 lg:mb-14 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                        ${headerVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.98]'}`}
                >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-4">How Customers Use It</p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
                        4 Simple Steps.<br className="hidden sm:block" />{' '}
                        Happy Customers.{' '}
                        <span className="text-primary">More Orders.</span>
                    </h2>
                </div>

                {/* Step cards */}
                <div ref={cardsRef} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                    {steps.map((step, i) => (
                        <div
                            key={step.number}
                            className={`bg-white border border-slate-100 rounded-xl sm:rounded-2xl overflow-hidden flex flex-col shadow-sm
                                hover:shadow-lg hover:-translate-y-1 hover:border-slate-200
                                transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]
                                ${cardsVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-[0.96]'}`}
                            style={{ transitionDelay: cardsVisible ? `${i * 90}ms` : '0ms' }}
                        >
                            <div className="p-3 sm:p-4 lg:p-5 flex-1">
                                <div
                                    className={`w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-primary flex items-center justify-center mb-3 sm:mb-4 shadow-md shadow-primary/30
                                        transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                                        ${cardsVisible ? 'scale-100' : 'scale-50'}`}
                                    style={{ transitionDelay: cardsVisible ? `${i * 90 + 180}ms` : '0ms' }}
                                >
                                    <span className="text-white font-bold text-[10px] sm:text-xs">{step.number}</span>
                                </div>
                                <h3 className="font-bold text-slate-900 text-xs sm:text-sm lg:text-base leading-snug mb-1 sm:mb-2">
                                    {step.title}
                                </h3>
                                <p className="text-slate-500 text-[11px] sm:text-xs lg:text-sm leading-relaxed">
                                    {step.desc}
                                </p>
                            </div>
                            <div className="relative w-full aspect-[4/3] overflow-hidden">
                                <Image
                                    src={step.image}
                                    alt={step.imageAlt}
                                    fill
                                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                                    className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                                />
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}
