import type { Metadata } from 'next';
import Link from 'next/link';
import {
    ArrowRight,
    BarChart3,
    MessageCircle,
    Pencil,
    QrCode,
    ScanLine,
    type LucideIcon,
} from 'lucide-react';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
import Reveal from '@/components/home/Reveal';
import { SMART_QR_MENU_LIVE_SINCE } from '@/content/roadmap';

const BASE_URL = 'https://vsite.in';
const TITLE = "Features — India's Fastest-Growing Digital Menu Software | vsite";
const DESCRIPTION =
    "Explore every feature of vsite — India's fastest-growing digital menu software. AI menu builder, QR code menu, real-time updates, Tamil support, and more.";

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/features` },
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        url: `${BASE_URL}/features`,
        type: 'website',
    },
};

type FeatureGroup = {
    title: string;
    /** What this group is for, in the owner's terms — not a restatement of the title. */
    blurb: string;
    icon: LucideIcon;
    items: { title: string; description: string }[];
};

/**
 * Feature groups, scoped to the product that is actually sellable.
 *
 * This page used to carry an "Orders & Payments" group — table ordering, a
 * live kitchen dashboard, an order status flow, UPI payments. None of it can
 * be bought: `@/lib/platform/productFlags` has ORDERING_FROZEN = true, only
 * `qr_menu` is in SELLABLE_PLANS, and every store normalises to it. The
 * homepage FAQ and the support FAQ both already say ordering is not part of
 * vsite today, so this page was the last one selling it.
 *
 * The groups now follow the owner's actual sequence — get the menu in, put it
 * on the table, keep it current, see what it did, get help — rather than a
 * feature taxonomy. When ordering unfreezes, add the group back here.
 */
const featureGroups: FeatureGroup[] = [
    {
        title: 'Getting your menu in',
        blurb: 'The part everyone assumes will take a week.',
        icon: ScanLine,
        items: [
            { title: 'AI menu extraction', description: 'Photograph your paper menu — the AI reads every item, price, and category, Tamil script included.' },
            { title: 'AI food photos', description: 'Every dish is matched to a professional food photo automatically. No photographer, no shoot day.' },
            { title: 'Three-minute setup', description: 'Signup to a live QR code, end to end, in under three minutes.' },
            { title: 'Tamil and English', description: 'Both languages on one menu, switched with a tap. Still unusual in India.' },
        ],
    },
    {
        title: 'On the table',
        blurb: 'What your customer meets when they sit down.',
        icon: QrCode,
        items: [
            { title: 'QR code menu', description: 'A QR code per table. Customers scan and the menu opens in about two seconds. No app to install.' },
            { title: 'NFC tap-to-open', description: 'A physical NFC card ships to you. Customers tap their phone to it and the menu opens.' },
            { title: 'Built for the phone first', description: 'Designed for a phone, not shrunk down from a desktop page. Works on basic 4G and older Android.' },
            { title: 'Pay at the counter, as always', description: 'vsite shows the menu; your staff take the order and the payment exactly as they do today.' },
        ],
    },
    {
        title: 'Keeping it current',
        blurb: 'A price change should not cost a trip to the press.',
        icon: Pencil,
        items: [
            { title: 'Real-time updates', description: 'Change a price, rename a dish, add today’s special. It is live on the table immediately.' },
            { title: 'Sold-out toggle', description: 'One tap marks an item unavailable, so nobody orders the fish you ran out of at noon.' },
            { title: 'Categories, reordered', description: 'Group into Breakfast, Lunch, Beverages — drag to put your bestsellers first.' },
            { title: 'Swap any photo', description: 'Prefer your own shot of the biryani? Replace any AI image from the dashboard.' },
        ],
    },
    {
        title: 'Seeing what it did',
        blurb: 'Which dishes get looked at, and which get skipped.',
        icon: BarChart3,
        items: [
            { title: 'Item view analytics', description: 'See which dishes customers open most — and which ones nobody scrolls to.' },
            { title: 'Menu reports', description: 'Track scans and viewing patterns by day and hour. Review it in the dashboard or export it.' },
            { title: 'Multiple outlets', description: 'Run several branches from one login and switch between them in seconds.' },
            { title: 'A page Google can find', description: 'Your shop gets a public page at vsite.in/shop/your-name, indexable like any other page.' },
        ],
    },
    {
        title: 'When you need us',
        blurb: 'A person, on the app you already have open.',
        icon: MessageCircle,
        items: [
            { title: 'WhatsApp support', description: 'Real people reply within 2 hours on business days. No chatbot, no ticket number.' },
            { title: 'Support in Tamil', description: 'Ask in Tamil, get answered in Tamil. Most of our customers do.' },
            { title: 'No POS hardware', description: 'No card machine, no billing terminal. It runs on the phone or tablet behind your counter.' },
            { title: 'Zero commission, ever', description: 'Unlike the aggregators, vsite never sits between you and your customer’s money. ₹299 a month is the whole relationship.' },
        ],
    },
];

const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'vsite',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: DESCRIPTION,
    offers: {
        '@type': 'Offer',
        price: '299',
        priceCurrency: 'INR',
    },
    url: `${BASE_URL}/features`,
};

const relatedLinks = [
    { label: 'QR code menu', href: '/qr-menu' },
    { label: 'Digital menu in India', href: '/digital-menu-india' },
    { label: 'AI menu builder', href: '/ai-menu-builder' },
    { label: 'Restaurant menu software', href: '/restaurant-menu-software' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Blog', href: '/blog' },
    { label: 'Support', href: '/support' },
    { label: 'Book a demo', href: '/demo' },
];

export default function FeaturesPage() {
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
                        Features
                    </p>
                    <h1 className="mt-5 font-display text-h2 font-bold text-ink">
                        Everything vsite does. And what it doesn’t.
                    </h1>
                    <p className="mx-auto mt-6 max-w-2xl text-body text-ink-70">
                        One product, ₹299 a month: a digital menu your customers scan at the table.
                        Live since {SMART_QR_MENU_LIVE_SINCE}, and in daily use across Tamil Nadu. Ordering with UPI
                        payment is coming next — today your staff take the order, commission-free.
                    </p>
                    <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                        <Link
                            href="/signup"
                            className="press group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 font-semibold text-white shadow-md shadow-primary/25 transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            Start free — 7 days
                            <ArrowRight className="cta-arrow h-5 w-5" strokeWidth={2.2} aria-hidden />
                        </Link>
                        <Link
                            href="/demo"
                            className="press inline-flex items-center justify-center rounded-full border border-line bg-paper px-7 py-3.5 font-semibold text-ink transition-colors hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            Book a demo
                        </Link>
                    </div>
                </div>
            </section>

            {/* Feature groups.
                Alternating paper / paper-2 bands so five long groups read as
                five things rather than one scroll. */}
            {featureGroups.map((group, i) => {
                const Icon = group.icon;
                return (
                    <section
                        key={group.title}
                        className={`px-5 py-section lg:py-section-lg ${i % 2 === 0 ? 'bg-paper' : 'bg-paper-2'}`}
                    >
                        <div className="mx-auto max-w-5xl">
                            <Reveal className="flex items-start gap-4">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                                    <Icon className="h-5 w-5 text-primary" strokeWidth={2} aria-hidden />
                                </div>
                                <div>
                                    <h2 className="font-display text-h3 font-bold text-ink">{group.title}</h2>
                                    <p className="mt-1 text-caption text-ink-45">{group.blurb}</p>
                                </div>
                            </Reveal>

                            <Reveal stagger={70} className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                {group.items.map((item) => (
                                    <div
                                        key={item.title}
                                        data-reveal="up"
                                        className={`lift rounded-2xl border border-line p-5 ${i % 2 === 0 ? 'bg-paper-2' : 'bg-paper'}`}
                                    >
                                        <h3 className="font-semibold text-ink">{item.title}</h3>
                                        <p className="mt-2 text-caption leading-relaxed text-ink-70">
                                            {item.description}
                                        </p>
                                    </div>
                                ))}
                            </Reveal>
                        </div>
                    </section>
                );
            })}

            {/* What is coming.
                Stated on the page that lists what you get, because the honest
                answer to "can customers order?" is "not yet" and burying that
                is what sold a frozen feature last time. */}
            <section className="border-t border-line bg-paper-2 px-5 py-section lg:py-section-lg">
                <div className="mx-auto max-w-3xl">
                    <Reveal>
                        <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                            Coming soon
                        </p>
                        <h2 className="mt-5 font-display text-h3 font-bold text-ink">
                            Ordering, with UPI payment.
                        </h2>
                        <p className="mt-4 text-body text-ink-70">
                            Customers will add items on their phone, pay by UPI, and the order will
                            land on a screen behind your counter. It is not live yet, and we would
                            rather say so than sell it to you twice. When it ships it arrives inside
                            the same ₹299 — no upgrade, and still no commission.
                        </p>
                    </Reveal>

                    <Reveal stagger={70} className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {[
                            { title: 'Order from the table', description: 'Add items on the phone and send the order without flagging anyone down.' },
                            { title: 'UPI payment in the menu', description: 'PhonePe, GPay or Paytm at the end of the meal. Money still goes straight to you.' },
                            { title: 'Live kitchen screen', description: 'Orders on a phone or tablet behind the counter: Preparing → Ready → Done.' },
                            { title: 'Sold-out that stops orders', description: 'Marking an item out will stop it being ordered, not just grey it out.' },
                        ].map((item) => (
                            <div
                                key={item.title}
                                data-reveal="up"
                                className="rounded-2xl border border-dashed border-line bg-paper p-5"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <h3 className="font-semibold text-ink">{item.title}</h3>
                                    <span className="shrink-0 rounded-full bg-paper-2 px-2.5 py-1 text-caption font-semibold text-ink-45">
                                        Soon
                                    </span>
                                </div>
                                <p className="mt-2 text-caption leading-relaxed text-ink-70">
                                    {item.description}
                                </p>
                            </div>
                        ))}
                    </Reveal>
                </div>
            </section>

            {/* Internal link cluster */}
            <section className="border-t border-line bg-paper px-5 py-section lg:py-section-lg">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                        Keep reading
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
