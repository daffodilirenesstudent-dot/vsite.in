import type { Metadata } from 'next';
import Link from 'next/link';
import {
    ArrowRight,
    ExternalLink,
    ImageIcon,
    MessageCircle,
    Pencil,
    QrCode,
    Rocket,
    ScanLine,
    type LucideIcon,
} from 'lucide-react';
import { whatsappUrl } from '@/lib/platform/brand';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
import Reveal from '@/components/home/Reveal';

const BASE_URL = 'https://vsite.in';
const TITLE = 'Book a Free Demo — vsite Digital Menu for Restaurants';
const DESCRIPTION =
    'Book a free 15-minute demo of vsite. We walk you through setting up your restaurant\'s digital menu, showing you exactly how it works before you commit.';
const WHATSAPP_URL =
    whatsappUrl("Hi vsite team, I'd like to book a demo for my restaurant.");

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/demo` },
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        url: `${BASE_URL}/demo`,
        type: 'website',
    },
};

const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: TITLE,
    description: DESCRIPTION,
    url: `${BASE_URL}/demo`,
    publisher: { '@type': 'Organization', name: 'vsite', url: BASE_URL },
};

/**
 * The fifteen minutes, minute by minute.
 *
 * This was a five-item list in which items 4 and 5 — "Real-time menu updates"
 * and "Live menu updates" — described the same thing twice, back to back. It
 * is now four beats with the time each one takes, which is the actual promise
 * the headline makes: the demo is short, and here is where the time goes.
 */
const walkthrough: { minutes: string; title: string; desc: string; icon: LucideIcon }[] = [
    {
        minutes: '0–4 min',
        title: 'Your menu, photographed and read',
        desc: 'We use your actual paper menu, not a sample. The AI reads it on the call so you see exactly what your setup produces.',
        icon: ScanLine,
    },
    {
        minutes: '4–8 min',
        title: 'Photos appear on every dish',
        desc: 'Watch each item get matched to a food photo automatically — and see how to swap one when you would rather use your own.',
        icon: ImageIcon,
    },
    {
        minutes: '8–12 min',
        title: 'The QR code, scanned on a real phone',
        desc: 'We put the code on screen, scan it, and walk your customer’s side of it end to end — including the Tamil toggle.',
        icon: QrCode,
    },
    {
        minutes: '12–15 min',
        title: 'A price change, live',
        desc: 'You change a price or mark a dish sold out in the dashboard and watch the table menu update while you are still looking at it.',
        icon: Pencil,
    },
];

const relatedLinks = [
    { label: 'Features', href: '/features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'QR code menu', href: '/qr-menu' },
    { label: 'Digital menu in India', href: '/digital-menu-india' },
    { label: 'AI menu builder', href: '/ai-menu-builder' },
    { label: 'Restaurant menu software', href: '/restaurant-menu-software' },
    { label: 'Blog', href: '/blog' },
    { label: 'Support', href: '/support' },
];

export default function DemoPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <Navbar />

            {/* Hero */}
            <section className="border-b border-line bg-paper-2 px-5 pt-32 pb-section lg:pb-section-lg">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                        Book a demo
                    </p>
                    <h1 className="mt-5 font-display text-h2 font-bold text-ink">
                        Fifteen minutes, with your own menu.
                    </h1>
                    <p className="mx-auto mt-6 max-w-2xl text-body text-ink-70">
                        Message us on WhatsApp and we’ll set up a short live walkthrough using your
                        actual menu — questions answered, and you can be live the same day.
                    </p>
                </div>
            </section>

            {/* The two ways in */}
            <section className="bg-paper px-5 py-section lg:py-section-lg">
                <div className="mx-auto max-w-3xl">
                    <Reveal stagger={90} className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        {/* WhatsApp demo */}
                        <div data-reveal="up" className="flex flex-col rounded-2xl border border-line bg-paper-2 p-7">
                            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#25D366]/10">
                                <MessageCircle className="h-5 w-5 text-[#1EA952]" strokeWidth={2} aria-hidden />
                            </div>
                            <h2 className="font-display text-h3 font-bold text-ink">Walk me through it</h2>
                            <p className="mt-2 flex-1 text-caption leading-relaxed text-ink-70">
                                The fastest way in. Message the team and we’ll book a 15-minute
                                walkthrough when it suits you — usually the same day.
                            </p>
                            <a
                                href={WHATSAPP_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="press mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1EA952] px-5 py-3.5 font-semibold text-white transition-colors hover:bg-[#178943] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            >
                                Message on WhatsApp
                                <ExternalLink className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                            </a>
                            <p className="mt-3 text-center text-caption text-ink-45">
                                Reply within 2 hours on business days
                            </p>
                        </div>

                        {/* Try it yourself */}
                        <div data-reveal="up" className="flex flex-col rounded-2xl border border-line bg-paper-2 p-7">
                            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                                <Rocket className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden />
                            </div>
                            <h2 className="font-display text-h3 font-bold text-ink">I’d rather just try it</h2>
                            <p className="mt-2 flex-1 text-caption leading-relaxed text-ink-70">
                                Skip the call. Start the 7-day trial and have your menu live in
                                three minutes. No card, no pressure, no salesperson.
                            </p>
                            <Link
                                href="/signup"
                                className="press group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 font-semibold text-white shadow-md shadow-primary/25 transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                            >
                                Start free — 7 days
                                <ArrowRight className="cta-arrow h-5 w-5" strokeWidth={2.2} aria-hidden />
                            </Link>
                            <p className="mt-3 text-center text-caption text-ink-45">
                                No card today · Cancel from your dashboard
                            </p>
                        </div>
                    </Reveal>

                    {/* Email/phone fallback */}
                    <Reveal delay={160}>
                        <p className="mt-8 rounded-2xl border border-line bg-paper-2 px-6 py-5 text-center text-caption text-ink-70">
                            Prefer email or phone?{' '}
                            <a href="mailto:official@vsite.in" className="font-semibold text-accent-text hover:underline">
                                official@vsite.in
                            </a>
                            {' '}· Every other way to reach us is on the{' '}
                            <Link href="/contact" className="font-semibold text-accent-text hover:underline">
                                contact page
                            </Link>
                            .
                        </p>
                    </Reveal>
                </div>
            </section>

            {/* What the fifteen minutes are spent on.
                A timed agenda rather than a feature list: the headline promises
                a short call, so the section shows where the time actually goes. */}
            <section className="bg-paper-2 px-5 py-section lg:py-section-lg">
                <div className="mx-auto max-w-3xl">
                    <Reveal>
                        <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                            The agenda
                        </p>
                        <h2 className="mt-5 font-display text-h2 font-bold text-ink">
                            Where the fifteen minutes go.
                        </h2>
                    </Reveal>

                    <Reveal stagger={80} className="mt-10 flex flex-col">
                        {walkthrough.map((item, i) => {
                            const Icon = item.icon;
                            return (
                                <div
                                    key={item.title}
                                    data-reveal="up"
                                    className={`flex gap-5 border-t border-[#D9D3C8] py-6 ${
                                        i === walkthrough.length - 1 ? 'border-b' : ''
                                    }`}
                                >
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-paper">
                                        <Icon className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-caption font-semibold uppercase tracking-[0.08em] tabular-nums text-ink-45">
                                            {item.minutes}
                                        </p>
                                        <h3 className="mt-1.5 font-semibold text-ink">{item.title}</h3>
                                        <p className="mt-1.5 text-caption leading-relaxed text-ink-70">
                                            {item.desc}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </Reveal>
                </div>
            </section>

            {/* Internal links */}
            <section className="bg-paper px-5 py-section lg:py-section-lg">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                        Or read first
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                        {relatedLinks.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                className="rounded-full border border-line bg-paper-2 px-4 py-2 text-caption font-medium text-ink-70 transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-ink"
                            >
                                {l.label}
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            <FooterCTA />
        </>
    );
}
