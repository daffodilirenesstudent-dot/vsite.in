'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import MobileScrollNav from './MobileBottomNav';

export default function Navbar() {
    const [open, setOpen] = useState(false);

    // Lock body scroll when mobile menu is open
    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    // Close menu on Escape key
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const navLinks = [
        { href: '/features', label: 'Features' },
        { href: '/pricing', label: 'Pricing' },
        { href: '/demo', label: 'Demo' },
        { href: '/blog', label: 'Blog' },
        { href: '/support', label: 'Support' },
    ];

    return (
        <>
            <header className="fixed top-0 w-full z-50 bg-white/85 backdrop-blur-xl border-b border-slate-200/60">
                <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
                    {/* Logo */}
                    <Link
                        href="/"
                        className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                    >
                        <Image src="/android-chrome-192x192.png" alt="Vsite icon" width={32} height={32} className="h-8 w-8 rounded-lg" priority />
                        <span className="text-xl font-extrabold tracking-tight text-slate-900">vsite</span>
                    </Link>

                    {/* Desktop Nav */}
                    <div className="hidden lg:flex items-center gap-8">
                        {navLinks.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                className="text-sm font-medium text-slate-600 hover:text-primary transition-colors focus-visible:outline-none focus-visible:text-primary"
                            >
                                {l.label}
                            </Link>
                        ))}
                    </div>

                    {/* Desktop CTA */}
                    <div className="hidden lg:flex items-center gap-4">
                        <Link
                            href="/login"
                            className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-primary hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            Log in
                        </Link>
                        <Link
                            href="/signup"
                            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            Start Free Trial
                            <span className="material-symbols-outlined text-base">arrow_forward</span>
                        </Link>
                    </div>

                    {/* Mobile hamburger */}
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-label={open ? 'Close menu' : 'Open menu'}
                        aria-expanded={open}
                        className="lg:hidden w-10 h-10 flex items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                        <span className="material-symbols-outlined text-2xl">
                            {open ? 'close' : 'menu'}
                        </span>
                    </button>
                </nav>
            </header>

            {/* Mobile menu sheet */}
            <div
                className={`lg:hidden fixed inset-0 z-40 transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={!open}
            >
                {/* Backdrop */}
                <div
                    onClick={() => setOpen(false)}
                    className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                />
                {/* Panel */}
                <div
                    className={`absolute top-16 left-3 right-3 rounded-2xl bg-white shadow-2xl border border-slate-200 p-4 transition-transform duration-200 ${open ? 'translate-y-0' : '-translate-y-2'}`}
                >
                    <div className="flex flex-col">
                        {navLinks.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                onClick={() => setOpen(false)}
                                className="flex items-center justify-between px-3 py-3.5 rounded-xl text-base font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
                            >
                                {l.label}
                                <span className="material-symbols-outlined text-slate-400 text-lg">chevron_right</span>
                            </Link>
                        ))}
                        <div className="h-px bg-slate-100 my-2" />
                        <Link
                            href="/login"
                            onClick={() => setOpen(false)}
                            className="px-3 py-3.5 rounded-xl text-base font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            Log in
                        </Link>
                        <Link
                            href="/signup"
                            onClick={() => setOpen(false)}
                            className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3.5 text-base font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-dark transition-colors"
                        >
                            Start Free Trial
                            <span className="material-symbols-outlined text-lg">arrow_forward</span>
                        </Link>
                        <p className="text-center text-xs text-slate-400 mt-2">14 days free · No credit card needed</p>
                    </div>
                </div>
            </div>
            <MobileScrollNav menuOpen={open} />
        </>
    );
}
