import type { Metadata } from 'next';
import { whatsappUrl } from '@/lib/brand';
import Link from 'next/link';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';

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

export default function DemoPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <Navbar />

            {/* Hero */}
            <section className="bg-gradient-to-br from-violet-50 via-purple-50 to-slate-50 pt-24 pb-16">
                <div className="max-w-3xl mx-auto px-4 text-center">
                    <p className="text-primary text-xs font-bold uppercase tracking-widest">Book a Demo</p>
                    <h1 className="text-4xl sm:text-5xl font-extrabold font-display text-slate-900 mt-4 leading-tight">
                        See vsite in 15 Minutes
                    </h1>
                    <p className="text-slate-600 mt-5 text-lg leading-relaxed">
                        Message us on WhatsApp — we&apos;ll set up a short live walkthrough of your digital menu,
                        answer any questions, and help you get live on vsite the same day.
                    </p>
                </div>
            </section>

            {/* Primary CTAs */}
            <section className="bg-white py-16">
                <div className="max-w-3xl mx-auto px-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* WhatsApp demo */}
                        <div className="rounded-2xl border border-slate-200 p-7 bg-white">
                            <div className="h-12 w-12 rounded-xl bg-[#25D366]/10 flex items-center justify-center mb-4">
                                <span className="material-symbols-outlined text-[#25D366] text-2xl">chat</span>
                            </div>
                            <h2 className="text-xl font-bold text-slate-900">WhatsApp Demo</h2>
                            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                                Fastest option. Message our team and we&apos;ll schedule a 15-minute
                                walkthrough at your convenience — usually the same day.
                            </p>
                            <a
                                href={WHATSAPP_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-5 inline-flex items-center justify-center gap-1.5 w-full rounded-[10px] bg-[#25D366] px-5 py-3 text-sm font-bold text-white hover:bg-[#20b858] transition-colors"
                            >
                                Message on WhatsApp
                                <span className="material-symbols-outlined text-base">open_in_new</span>
                            </a>
                            <p className="text-xs text-slate-400 mt-2 text-center">
                                Reply within 2 hours on business days
                            </p>
                        </div>

                        {/* Try it yourself */}
                        <div className="rounded-2xl border border-slate-200 p-7 bg-white">
                            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                                <span className="material-symbols-outlined text-primary text-2xl">play_arrow</span>
                            </div>
                            <h2 className="text-xl font-bold text-slate-900">Try It Yourself</h2>
                            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                                Prefer to explore first? Start the 7-day free trial and have your
                                menu live in 3 minutes. No credit card required, no pressure.
                            </p>
                            <Link
                                href="/signup"
                                className="mt-5 inline-flex items-center justify-center gap-1.5 w-full rounded-[10px] bg-primary px-5 py-3 text-sm font-bold text-white shadow-md shadow-primary/25 hover:bg-primary-dark transition-colors"
                            >
                                Start Free Trial
                                <span className="material-symbols-outlined text-base">arrow_forward</span>
                            </Link>
                            <p className="text-xs text-slate-400 mt-2 text-center">
                                7-day trial · No credit card
                            </p>
                        </div>
                    </div>

                    {/* Email/phone fallback */}
                    <div className="mt-8 rounded-2xl bg-background-light border border-slate-200 p-6">
                        <p className="text-sm text-slate-700 text-center">
                            Prefer email or phone?{' '}
                            <a href="mailto:official@vsite.in" className="font-semibold text-primary hover:underline">
                                official@vsite.in
                            </a>
                            {' '}· Visit our{' '}
                            <Link href="/contact" className="font-semibold text-primary hover:underline">
                                contact page
                            </Link>
                            {' '}for all options.
                        </p>
                    </div>
                </div>
            </section>

            {/* What you'll see */}
            <section className="bg-background-light py-16">
                <div className="max-w-3xl mx-auto px-4">
                    <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">
                        What We&apos;ll Show You
                    </h2>
                    <div className="space-y-3">
                        {[
                            { icon: 'upload', title: 'Upload a paper menu — watch AI read it', desc: 'We use your actual menu so you see exactly what your setup will look like.' },
                            { icon: 'image', title: 'AI food photo generation', desc: 'See how every dish gets a professional food image automatically.' },
                            { icon: 'qr_code_2', title: 'QR code + NFC card in action', desc: 'We scan your live menu on a phone and walk through the customer experience.' },
                            { icon: 'edit', title: 'Real-time menu updates', desc: 'Change a price in the dashboard — watch it reflect instantly on the customer menu.' },
                            { icon: 'receipt', title: 'Live menu updates', desc: 'Change a price or mark an item sold out and watch the menu update instantly.' },
                        ].map((item) => (
                            <div key={item.title} className="flex gap-4 rounded-2xl bg-white border border-slate-200 p-5">
                                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-primary">{item.icon}</span>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-slate-900 text-sm">{item.title}</h3>
                                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Internal links */}
            <section className="bg-white py-12">
                <div className="max-w-3xl mx-auto px-4 text-center">
                    <h2 className="text-lg font-bold text-slate-900 mb-4">Or Read First</h2>
                    <div className="flex flex-wrap gap-2 justify-center">
                        {[
                            { label: 'Features', href: '/features' },
                            { label: 'Pricing', href: '/pricing' },
                            { label: 'QR Code Menu', href: '/qr-menu' },
                            { label: 'Digital Menu India', href: '/digital-menu-india' },
                            { label: 'AI Menu Builder', href: '/ai-menu-builder' },
                            { label: 'Restaurant Menu Software', href: '/restaurant-menu-software' },
                            { label: 'Blog', href: '/blog' },
                            { label: 'Support', href: '/support' },
                        ].map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                className="text-sm bg-slate-100 hover:bg-primary/10 hover:text-primary text-slate-700 px-4 py-2 rounded-full transition-colors"
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
