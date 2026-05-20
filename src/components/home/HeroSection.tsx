'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';

export default function HeroSection() {
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const id = requestAnimationFrame(() => setLoaded(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const ease = 'ease-[cubic-bezier(0.22,1,0.36,1)]';

    return (
        <section className="relative pt-24 pb-16 px-4 overflow-hidden bg-[#0e0e2c] sm:pt-32 sm:pb-20 lg:pt-40 lg:pb-24">

            {/* Animated orbs */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-24 -left-24 w-72 h-72 sm:w-96 sm:h-96 bg-primary/25 rounded-full blur-[120px] animate-orb-slow" />
                <div className="absolute top-1/2 -right-24 w-64 h-64 sm:w-80 sm:h-80 bg-purple-700/20 rounded-full blur-[100px] animate-orb-mid" />
                <div className="absolute bottom-0 left-1/3 w-48 h-48 sm:w-64 sm:h-64 bg-primary/10 rounded-full blur-[80px] animate-orb-fast" />
            </div>

            <div className="relative z-10 mx-auto max-w-7xl">
                <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-16">

                    {/* Left: Text */}
                    <div className="flex-1 text-center lg:text-left space-y-5 sm:space-y-6 max-w-2xl mx-auto lg:mx-0 w-full">

                        {/* Badge */}
                        <div
                            className={`inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 rounded-full bg-white/8 border border-white/15 text-white/85 text-[11px] sm:text-xs lg:text-sm transition-all ${ease} duration-700 ${loaded ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`}
                        >
                            <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-full w-full bg-green-400" />
                            </span>
                            <span className="hidden sm:inline">14-Day Free Trial — Zero Risk. No Credit Card. No Hidden Charges.</span>
                            <span className="sm:hidden">14-Day Free Trial · No Credit Card</span>
                        </div>

                        {/* H1 */}
                        <h1 className="text-[1.75rem] sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold font-display text-white leading-[1.1] tracking-tight">
                            {["Restaurant's", 'Digital Menu & QR Ordering software'].map((line, i) => (
                                <span key={line} className="block overflow-hidden">
                                    <span
                                        className={`block transition-all ${ease} duration-700 ${loaded ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
                                        style={{ transitionDelay: `${80 + i * 100}ms` }}
                                    >
                                        {line}
                                    </span>
                                </span>
                            ))}
                            <span className="block overflow-hidden">
                                <span
                                    className={`block text-[#c3c0ff] transition-all ${ease} duration-700 ${loaded ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
                                    style={{ transitionDelay: '280ms' }}
                                >
                                    Live in 3 Minutes.
                                </span>
                            </span>
                        </h1>

                        {/* Subheadline */}
                        <p
                            className={`text-sm sm:text-base lg:text-lg text-white/70 leading-relaxed max-w-xl mx-auto lg:mx-0 transition-all ${ease} duration-700 ${loaded ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}
                            style={{ transitionDelay: '400ms' }}
                        >
                            Snap your menu — paper, printed, or handwritten. Our AI turns it into a complete digital menu with photos in seconds. Put the QR code on your table. Done.
                        </p>

                        {/* CTAs */}
                        <div
                            className={`flex flex-col sm:flex-row gap-3 justify-center lg:justify-start transition-all ${ease} duration-700 ${loaded ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}
                            style={{ transitionDelay: '520ms' }}
                        >
                            <Link
                                href="/signup"
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-primary px-7 py-3.5 sm:px-8 sm:py-4 rounded-full font-bold text-base sm:text-lg hover:bg-slate-100 hover:scale-[1.03] active:scale-95 transition-all duration-300 shadow-xl shadow-black/20"
                            >
                                Get My Free Digital Menu
                                <span className="material-symbols-outlined text-xl">arrow_forward</span>
                            </Link>
                            <Link
                                href="#setup-steps"
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/10 border border-white/20 text-white px-7 py-3.5 sm:px-8 sm:py-4 rounded-full font-bold text-base sm:text-lg hover:bg-white/20 hover:scale-[1.02] transition-all duration-300"
                            >
                                <span className="material-symbols-outlined text-xl">play_circle</span>
                                See How It Works
                            </Link>
                        </div>

                        {/* Trust strip */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:text-sm text-white/65 pt-1 max-w-sm sm:max-w-md mx-auto lg:mx-0">
                            {[
                                'No app download for customers',
                                'Works on any Android or iPhone',
                                'Update your menu live, any time',
                                'NFC card + QR sticker included',
                            ].map((item, i) => (
                                <div
                                    key={item}
                                    className={`flex items-start sm:items-center gap-1.5 sm:gap-2 transition-all ${ease} duration-500 ${loaded ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0'}`}
                                    style={{ transitionDelay: `${640 + i * 80}ms` }}
                                >
                                    <span className="material-symbols-outlined text-green-400 text-sm shrink-0 mt-px sm:mt-0">check_circle</span>
                                    <span className="leading-snug">{item}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Phone mockup */}
                    <div
                        className={`relative w-full max-w-[190px] sm:max-w-[260px] md:max-w-[300px] mx-auto lg:mx-0 lg:max-w-[340px] lg:flex-shrink-0
                            transition-all ${ease} duration-1000 ${loaded ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-10 opacity-0 scale-[0.95]'}`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        <div className="absolute inset-0 bg-primary/20 rounded-[2.5rem] blur-2xl animate-glow-pulse" />

                        <div className="relative bg-[#1a1a3a] border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] p-2 sm:p-3 shadow-2xl">
                            <div className="rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden aspect-[9/16] relative">
                                <Image
                                    src="/mockup home page.jpeg"
                                    alt="vsite digital menu mockup"
                                    fill
                                    sizes="(max-width: 640px) 190px, (max-width: 768px) 260px, (max-width: 1024px) 300px, 340px"
                                    className="object-cover object-top"
                                    priority
                                />
                            </div>

                            {/* Floating card: Menu is Live */}
                            <div
                                className={`absolute -top-3 -right-3 sm:-top-4 sm:-right-4 bg-white rounded-xl sm:rounded-2xl shadow-xl px-2 py-1.5 sm:px-3 sm:py-2 flex items-center gap-1.5 sm:gap-2 border border-slate-100
                                    transition-all ease-[cubic-bezier(0.34,1.56,0.64,1)] duration-500
                                    ${loaded ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
                                style={{ transitionDelay: '800ms' }}
                            >
                                <span className="relative flex h-2 w-2 shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-full w-full bg-green-500" />
                                </span>
                                <span className="text-[10px] sm:text-xs font-bold text-slate-800 whitespace-nowrap">Menu is Live</span>
                            </div>

                            {/* Floating card: Tap or Scan */}
                            <div
                                className={`absolute -bottom-3 -left-3 sm:-bottom-4 sm:-left-4 bg-white rounded-xl sm:rounded-2xl shadow-xl px-2 py-1.5 sm:px-3 sm:py-2 flex items-center gap-1.5 sm:gap-2 border border-slate-100
                                    transition-all ease-[cubic-bezier(0.34,1.56,0.64,1)] duration-500
                                    ${loaded ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
                                style={{ transitionDelay: '950ms' }}
                            >
                                <span className="material-symbols-outlined text-primary text-sm sm:text-base">nfc</span>
                                <span className="text-[10px] sm:text-xs font-bold text-slate-800 whitespace-nowrap">Tap or Scan</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <style>{`
                @keyframes orbSlow {
                    0%, 100% { transform: translate(0,0) scale(1); }
                    50%       { transform: translate(20px,15px) scale(1.08); }
                }
                @keyframes orbMid {
                    0%, 100% { transform: translate(0,0) scale(1); }
                    50%       { transform: translate(-15px,20px) scale(1.1); }
                }
                @keyframes orbFast {
                    0%, 100% { transform: translate(0,0) scale(1); }
                    50%       { transform: translate(10px,-12px) scale(1.06); }
                }
                @keyframes glowPulse {
                    0%, 100% { opacity: 0.2; }
                    50%       { opacity: 0.35; }
                }
                .animate-orb-slow   { animation: orbSlow 9s ease-in-out infinite; }
                .animate-orb-mid    { animation: orbMid 7s ease-in-out infinite; }
                .animate-orb-fast   { animation: orbFast 5s ease-in-out infinite; }
                .animate-glow-pulse { animation: glowPulse 3s ease-in-out infinite; }
            `}</style>
        </section>
    );
}
