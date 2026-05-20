'use client';

import Image from 'next/image';
import { useInView } from '@/hooks/useInView';

const steps = [
    {
        number: '1',
        icon: 'storefront',
        title: 'Enter your business name & type',
        description: 'Type your restaurant name and pick your business type — café, hotel, food truck, tiffin centre, bakery, and more.',
    },
    {
        number: '2',
        icon: 'photo_camera',
        title: 'Upload your menu photos',
        description: 'Snap a photo of your existing menu — printed, laminated, or handwritten. Our AI reads every item and builds your menu automatically.',
    },
    {
        number: '3',
        icon: 'qr_code_2',
        title: 'Get your digital menu with QR — instantly',
        description: 'Your digital menu goes live in under 3 minutes with a QR code ready to place on your tables.',
    },
];

export default function HowItWorks() {
    const { ref: headerRef, visible: headerVisible } = useInView(0.2);
    const { ref: imgRef, visible: imgVisible } = useInView(0.1);
    const { ref: stepsRef, visible: stepsVisible } = useInView(0.1);

    return (
        <section id="how-it-works" className="py-14 sm:py-20 lg:py-28 px-4 bg-slate-50">
            <div className="mx-auto max-w-5xl">

                <div
                    ref={headerRef}
                    className={`text-center mb-10 sm:mb-14 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                        ${headerVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.98]'}`}
                >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-4">
                        Setup in 3 minutes
                    </p>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
                        Create you digital menu in 3 simple steps
                    </h2>
                    <p className="mt-4 text-sm sm:text-base lg:text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
                        Go from paper menu to a live digital menu in under 3 minutes — no tech skills needed.
                    </p>
                </div>

                <div className="flex flex-col lg:flex-row gap-8 sm:gap-12 lg:gap-20 items-center">

                    {/* Image */}
                    <div
                        ref={imgRef}
                        className={`w-full max-w-sm sm:max-w-md mx-auto lg:w-[400px] lg:max-w-none lg:mx-0 lg:shrink-0
                            transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]
                            ${imgVisible ? 'opacity-100 scale-100 translate-x-0' : 'opacity-0 scale-[0.96] -translate-x-8'}`}
                    >
                        <div className="relative rounded-xl sm:rounded-2xl overflow-hidden border border-slate-100 shadow-md
                            aspect-[4/5]
                            hover:shadow-xl hover:scale-[1.02] transition-all duration-500 ease-out">
                            <Image
                                src="/onboarding stock.png"
                                alt="vsite onboarding"
                                fill
                                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
                                className="object-contain object-center"
                                priority
                            />
                        </div>
                    </div>

                    {/* Steps */}
                    <div ref={stepsRef} className="flex-1 flex flex-col gap-0 w-full">
                        {steps.map((step, i) => (
                            <div
                                key={step.number}
                                className={`flex gap-4 sm:gap-5 items-start transition-all duration-600 ease-[cubic-bezier(0.22,1,0.36,1)]
                                    ${stepsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
                                style={{ transitionDelay: stepsVisible ? `${i * 140}ms` : '0ms' }}
                            >
                                <div className="flex flex-col items-center shrink-0">
                                    <div
                                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm
                                            transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                                            ${stepsVisible ? 'scale-100' : 'scale-75'}`}
                                        style={{ transitionDelay: stepsVisible ? `${i * 140 + 80}ms` : '0ms' }}
                                    >
                                        <span className="material-symbols-outlined text-primary text-base sm:text-[18px]">{step.icon}</span>
                                    </div>
                                    {i < steps.length - 1 && (
                                        <div
                                            className={`w-px bg-slate-200 mt-2 transition-all duration-500 ease-out
                                                ${stepsVisible ? 'h-8 sm:h-10 opacity-100' : 'h-0 opacity-0'}`}
                                            style={{ transitionDelay: stepsVisible ? `${i * 140 + 180}ms` : '0ms' }}
                                        />
                                    )}
                                </div>

                                <div className={`flex-1 pb-8 sm:pb-10 ${i === steps.length - 1 ? '!pb-0' : ''}`}>
                                    <p className="text-[10px] sm:text-[11px] font-semibold text-primary uppercase tracking-[0.1em] mb-1">Step {step.number}</p>
                                    <h3 className="text-sm sm:text-base lg:text-lg font-semibold text-slate-900 mb-1 sm:mb-1.5 leading-snug">
                                        {step.title}
                                    </h3>
                                    <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                                        {step.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
