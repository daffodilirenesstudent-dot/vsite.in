'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { ArrowRight, ChevronRight, Menu, X } from 'lucide-react';
import Logo from '@/components/Logo';

const NAV_LINKS = [
    { href: '/features', label: 'Features' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/demo', label: 'Demo' },
    { href: '/blog', label: 'Blog' },
    { href: '/support', label: 'Support' },
];

/**
 * Scroll-aware navigation.
 *
 * The old bar was an opaque white strip sitting on top of a dark hero, which
 * cut the hero off at the top and made the page start with a seam. This one
 * rides transparent over the hero and only materialises — background, border,
 * shadow — once you have scrolled past it. Two states, one component:
 *
 *   over the hero  → light-on-dark, no chrome
 *   scrolled       → paper background, ink text, hairline + reading progress
 *
 * The progress bar under the border uses the scroll-driven CSS from
 * globals.css, so it costs no JS and simply does not appear where the browser
 * lacks support.
 */

export default function Navbar() {
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // While the sheet is open the bar always uses its solid treatment.
    const onDark = !scrolled && !open;

    return (
        <>
            <header
                className={`fixed top-0 z-50 w-full transition-[background-color,border-color,box-shadow] duration-300 ease-out-expo ${
                    onDark
                        ? 'border-b border-transparent bg-transparent'
                        : 'border-b border-line bg-paper/90 shadow-[0_1px_20px_rgba(18,16,14,0.05)] backdrop-blur-xl'
                }`}
            >
                <nav className="mx-auto flex h-[4.5rem] max-w-6xl items-center justify-between gap-6 px-5">
                    <Link
                        href="/"
                        aria-label="vsite home"
                        className="press rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                        <Logo size={34} tone={onDark ? 'light' : 'brand'} tagline />
                    </Link>

                    {/* Desktop links — a grouped pill rather than five loose words,
                        so the nav reads as one object and the links get real
                        vertical hit area (they were 20px tall). */}
                    <div
                        className={`hidden items-center gap-1 rounded-full p-1 transition-colors duration-300 lg:flex ${
                            onDark ? 'bg-white/[0.07] ring-1 ring-inset ring-white/10' : 'bg-paper-2'
                        }`}
                    >
                        {NAV_LINKS.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                className={`rounded-full px-4 py-2.5 text-[15px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                    onDark
                                        ? 'text-white/75 hover:bg-white/10 hover:text-white'
                                        : 'text-ink-70 hover:bg-white hover:text-ink'
                                }`}
                            >
                                {l.label}
                            </Link>
                        ))}
                    </div>

                    <div className="hidden items-center gap-2 lg:flex">
                        <Link
                            href="/login"
                            className={`rounded-full px-4 py-2.5 text-[15px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                onDark ? 'text-white/80 hover:text-white' : 'text-ink-70 hover:text-ink'
                            }`}
                        >
                            Log in
                        </Link>
                        <Link
                            href="/signup"
                            className={`press group inline-flex items-center gap-2 rounded-full py-2.5 pl-5 pr-2.5 text-[15px] font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                onDark
                                    ? 'bg-white text-ink hover:bg-paper-2'
                                    : 'bg-primary text-white shadow-md shadow-primary/25 hover:bg-primary-dark'
                            }`}
                        >
                            Start free
                            {/* The arrow lives in its own disc so the button has a
                                visible "go" target and the nudge has somewhere to
                                nudge into. */}
                            <span
                                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-300 ${
                                    onDark ? 'bg-ink/10' : 'bg-white/20'
                                }`}
                            >
                                <ArrowRight className="cta-arrow h-4 w-4" strokeWidth={2.2} aria-hidden />
                            </span>
                        </Link>
                    </div>

                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-label={open ? 'Close menu' : 'Open menu'}
                        aria-expanded={open}
                        className={`press flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden ${
                            onDark ? 'bg-white/10 text-white' : 'bg-paper-2 text-ink'
                        }`}
                    >
                        {open ? <X className="h-5 w-5" strokeWidth={2} aria-hidden /> : <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />}
                    </button>
                </nav>

                {/* Reading progress — only paints once the bar is solid. */}
                {!onDark && (
                    <div aria-hidden className="absolute inset-x-0 bottom-0 h-px overflow-hidden">
                        <div className="scroll-progress h-full w-full bg-primary" />
                    </div>
                )}
            </header>

            {/* Mobile sheet */}
            <div
                className={`fixed inset-0 z-40 transition-opacity duration-200 lg:hidden ${
                    open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                }`}
                aria-hidden={!open}
            >
                <div onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/45 backdrop-blur-sm" />
                <div
                    className={`absolute inset-x-3 top-[4.75rem] rounded-3xl border border-line bg-paper p-3 shadow-2xl transition-transform duration-300 ease-out-expo ${
                        open ? 'translate-y-0' : '-translate-y-3'
                    }`}
                >
                    <div className="flex flex-col">
                        {NAV_LINKS.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                onClick={() => setOpen(false)}
                                className="flex items-center justify-between rounded-2xl px-4 py-4 text-[17px] font-semibold text-ink transition-colors hover:bg-paper-2"
                            >
                                {l.label}
                                <ChevronRight className="h-5 w-5 text-ink-45" strokeWidth={2} aria-hidden />
                            </Link>
                        ))}
                        <div className="my-2 h-px bg-line" />
                        <Link
                            href="/login"
                            onClick={() => setOpen(false)}
                            className="rounded-2xl px-4 py-4 text-[17px] font-semibold text-ink-70 transition-colors hover:bg-paper-2"
                        >
                            Log in
                        </Link>
                        <Link
                            href="/signup"
                            onClick={() => setOpen(false)}
                            className="press mt-1 inline-flex h-14 items-center justify-center gap-2.5 rounded-2xl bg-primary text-[17px] font-bold text-white shadow-md shadow-primary/25"
                        >
                            Start free — 7 days
                            <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />
                        </Link>
                        <p className="mt-3 pb-1 text-center text-caption text-ink-45">
                            No card today · Cancel from your dashboard
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
