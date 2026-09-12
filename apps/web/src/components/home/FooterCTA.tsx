'use client';

import Link from 'next/link';
import { ArrowRight, Instagram, Mail, MessageCircle, Sparkles } from 'lucide-react';
import Reveal from './Reveal';
import Logo from '@/components/Logo';
import { SUPPORT_EMAIL, whatsappUrl } from '@/lib/platform/brand';
import { PROOF_STATS } from './Proof';

const COLUMNS = [
    {
        heading: 'Product',
        links: [
            { label: 'Features', href: '/features' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Book a demo', href: '/demo' },
            { label: '7-day free trial', href: '/signup' },
            { label: 'Log in', href: '/login' },
        ],
    },
    {
        heading: 'For your shop',
        links: [
            { label: 'Restaurants', href: '/restaurant-menu-software' },
            { label: 'Cafés', href: '/cafe-menu-software' },
            { label: 'Bakeries', href: '/bakery-menu-software' },
            { label: 'Cloud kitchens', href: '/cloud-kitchen-software' },
            { label: 'Sweet shops', href: '/sweet-shop-menu' },
            { label: 'Bars & pubs', href: '/bar-pub-menu' },
        ],
    },
    {
        heading: 'Learn',
        links: [
            { label: 'QR code menu', href: '/qr-menu' },
            { label: 'AI menu builder', href: '/ai-menu-builder' },
            { label: 'AI food photos', href: '/ai-food-photo-generator' },
            { label: 'Digital menu in India', href: '/digital-menu-india' },
            { label: 'Blog', href: '/blog' },
        ],
    },
    {
        heading: 'Company',
        links: [
            { label: 'About vsite', href: '/about' },
            { label: 'Support centre', href: '/support' },
            { label: 'Contact us', href: '/contact' },
            { label: 'Privacy policy', href: '/privacy' },
            { label: 'Terms of service', href: '/terms' },
        ],
    },
];

export default function FooterCTA() {
    return (
        <>
            {/* ── Final CTA ───────────────────────────────────────────────
                Bookends the hero on purpose: same mesh, same promise, closing
                the loop rather than opening a new argument. */}
            <section className="hero-mesh relative overflow-hidden px-5 py-section text-center lg:py-section-lg">
                <div aria-hidden className="hero-grid pointer-events-none absolute inset-0" />
                <div
                    aria-hidden
                    className="hero-ember pointer-events-none absolute -bottom-40 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-orange-500/20 blur-[120px]"
                />

                <Reveal className="relative mx-auto max-w-3xl">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.07] px-4 py-2 text-caption font-medium text-[#E7E4F5] backdrop-blur-sm">
                        <Sparkles className="h-3.5 w-3.5 text-amber-300" strokeWidth={2} aria-hidden />
                        Seven days free · No card
                    </span>

                    <h2 className="mt-7 font-display text-h2 font-bold text-on-night">
                        Your menu is already written.{' '}
                        <span className="bg-gradient-to-r from-[#C7C4FF] to-[#F0A868] bg-clip-text text-transparent">
                            It just needs a photograph.
                        </span>
                    </h2>

                    <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                        <Link
                            href="/signup"
                            className="press inline-flex h-14 items-center justify-center gap-2.5 rounded-full bg-white px-8 text-[17px] font-semibold text-ink shadow-[0_10px_40px_-8px_rgba(255,255,255,0.35)] transition-shadow hover:shadow-[0_14px_50px_-8px_rgba(255,255,255,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-night"
                        >
                            Build my menu free
                            <ArrowRight className="cta-arrow h-5 w-5" strokeWidth={2} aria-hidden />
                        </Link>
                        <a
                            href={whatsappUrl('Hi vsite, I have a question about the Smart QR Menu for my shop.')}
                            className="press inline-flex h-14 items-center justify-center gap-2.5 rounded-full border border-white/25 bg-white/[0.06] px-8 text-[17px] font-semibold text-on-night backdrop-blur-sm transition-colors hover:border-white/40 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                            <MessageCircle className="h-5 w-5" strokeWidth={1.7} aria-hidden />
                            Ask us on WhatsApp
                        </a>
                    </div>

                    <p className="mt-6 text-[15px] text-on-night-45">
                        Serving Tamil Nadu since {PROOF_STATS.liveSince}. Menus in {PROOF_STATS.languages},
                        live in {PROOF_STATS.setupMinutes} minutes.
                    </p>
                </Reveal>
            </section>

            {/* ── Footer ──────────────────────────────────────────────── */}
            <footer className="relative overflow-hidden border-t border-white/[0.08] bg-night-deep px-5 pt-16">
                <div className="relative mx-auto max-w-6xl">
                    <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2.6fr)] lg:gap-16">
                        {/* Brand + contact */}
                        <div>
                            <Link href="/" aria-label="vsite home" className="inline-flex">
                                <Logo size={38} tone="light" />
                            </Link>

                            <p className="mt-5 max-w-xs text-body leading-relaxed text-white/65">
                                Digital menus for India’s food businesses. Photograph your paper menu, get a QR
                                code for your tables, change a price in ten seconds.
                            </p>

                            <div className="mt-7 flex flex-col gap-2.5">
                                <a
                                    href={whatsappUrl('Hi vsite, I would like to know more.')}
                                    className="press inline-flex w-fit items-center gap-2.5 rounded-full bg-white/[0.08] px-4 py-2.5 text-[15px] font-medium text-white/85 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.14] hover:text-white"
                                >
                                    <MessageCircle className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden />
                                    WhatsApp us — Tamil or English
                                </a>
                                <a
                                    href={`mailto:${SUPPORT_EMAIL}`}
                                    className="press inline-flex w-fit items-center gap-2.5 rounded-full bg-white/[0.08] px-4 py-2.5 text-[15px] font-medium text-white/85 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.14] hover:text-white"
                                >
                                    <Mail className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden />
                                    {SUPPORT_EMAIL}
                                </a>
                                <a
                                    href="https://www.instagram.com/vsite.in"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="vsite on Instagram"
                                    className="press inline-flex w-fit items-center gap-2.5 rounded-full bg-white/[0.08] px-4 py-2.5 text-[15px] font-medium text-white/85 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.14] hover:text-white"
                                >
                                    <Instagram className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden />
                                    @vsite.in on Instagram
                                </a>
                            </div>
                        </div>

                        {/* Links */}
                        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
                            {COLUMNS.map((col) => (
                                <nav key={col.heading} aria-label={col.heading} className="flex flex-col gap-3.5">
                                    <h3 className="text-caption font-bold uppercase tracking-[0.1em] text-white/45">
                                        {col.heading}
                                    </h3>
                                    {col.links.map((l) => (
                                        <Link
                                            key={l.href}
                                            href={l.href}
                                            className="inline-flex w-fit items-center py-1 text-[15px] leading-normal text-white/75 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-none"
                                        >
                                            {l.label}
                                        </Link>
                                    ))}
                                </nav>
                            ))}
                        </div>
                    </div>

                    {/* Bottom bar */}
                    <div className="mt-14 flex flex-col gap-4 border-t border-white/[0.08] py-7 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-white/55">
                            © {new Date().getFullYear()} vsite · Made in Tamil Nadu
                            <span aria-hidden className="mx-2 text-white/25">·</span>
                            <span className="text-white/70">தமிழ் / English</span>
                        </p>
                        <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/55">
                            <span>No commission</span>
                            <span aria-hidden className="text-white/25">·</span>
                            <span>No per-scan fee</span>
                            <span aria-hidden className="text-white/25">·</span>
                            {/* Was "Cancel anytime from your dashboard". There is no
                                card mandate, so there is nothing to cancel — the
                                period just ends. See @/content/policy. */}
                            <span>No auto-renewal</span>
                        </p>
                    </div>
                </div>

                {/* Oversized wordmark, clipped by the viewport edge. The one piece
                    of pure typography on the page — it is what stops the footer
                    reading like every other SaaS link farm. */}
                <p
                    aria-hidden
                    className="pointer-events-none select-none text-center font-display text-[22vw] font-extrabold leading-[0.72] tracking-[-0.06em] text-white/[0.045] lg:text-[16rem]"
                >
                    vsite
                </p>
            </footer>
        </>
    );
}
