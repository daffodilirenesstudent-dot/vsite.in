'use client';

import Link from 'next/link';

const trustIcons = [
    { materialIcon: 'lock', label: 'No credit card needed' },
    { materialIcon: 'timer', label: 'Setup in under 3 minutes' },
    { materialIcon: 'nfc', label: 'NFC card + QR sticker included' },
    { materialIcon: 'cancel', label: 'Cancel any time, no questions' },
];

export default function FinalCTA() {
    return (
        <section className="py-16 sm:py-28 px-4 bg-[#0e0e2c] relative overflow-hidden">
            {/* Background orbs */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-20 left-1/4 w-80 h-80 bg-primary/20 rounded-full blur-[120px]" />
                <div className="absolute -bottom-20 right-1/4 w-80 h-80 bg-purple-700/15 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 mx-auto max-w-3xl text-center">
                <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-display text-white leading-tight mb-6">
                    Your Restaurant Deserves Better<br />
                    <span className="text-[#c3c0ff]">
                        Than a Paper Menu.
                    </span>
                </h2>

                <p className="text-xl text-white/65 leading-relaxed mb-10 max-w-xl mx-auto">
                    Start your free 7-day trial today.
                    Upload your menu. Get your QR code. Be live in 3 minutes.
                    No credit card. No tech skills. No risk.
                </p>

                <Link
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 bg-white text-primary px-7 py-4 sm:px-10 sm:py-5 rounded-full font-bold text-base sm:text-xl hover:bg-slate-100 transition-all shadow-2xl shadow-black/30 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0e0e2c]"
                >
                    Create My Free Digital Menu
                    <span className="material-symbols-outlined text-xl">arrow_forward</span>
                </Link>

                {/* Micro-trust icons */}
                <div className="mt-8 flex flex-wrap justify-center gap-4 sm:gap-6">
                    {trustIcons.map((t) => (
                        <div key={t.label} className="flex items-center gap-2 text-white/50 text-sm">
                            <span className="material-symbols-outlined text-base">{t.materialIcon}</span>
                            {t.label}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
