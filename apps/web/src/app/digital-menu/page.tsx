import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, MapPin } from 'lucide-react';
import Navbar from '@/components/home/Navbar';
import FooterCTA from '@/components/home/FooterCTA';
import JsonLd from '@/components/seo/JsonLd';
import { CITY_PAGES } from '@/content/seo-pages/cities';
import { PLAN_PRICES_INR } from '@/lib/platform/productFlags';
import { breadcrumbSchema, itemListSchema } from '@/lib/seo/jsonld';

const BASE_URL = 'https://vsite.in';
const HUB_URL = `${BASE_URL}/digital-menu`;

/**
 * The hub for the city pages. Every /digital-menu/<city> page already links
 * up to /digital-menu-india; this page is the missing path back down, so a
 * visitor (or a crawler) can see all thirteen cities in one place.
 */

const TITLE = 'Digital Menu Software in Tamil Nadu, by City';
const DESCRIPTION =
    `QR code menu software for restaurants, cafés and messes in ${CITY_PAGES.length} Tamil Nadu cities. ` +
    `Tamil and English menus, ₹${PLAN_PRICES_INR.qr_menu}/month, 7-day free trial. Pick your city.`;

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: HUB_URL },
    openGraph: { title: TITLE, description: DESCRIPTION, url: HUB_URL, type: 'website', locale: 'en_IN' },
};

export default function DigitalMenuHubPage() {
    const breadcrumbs = breadcrumbSchema([
        { name: 'Home', url: BASE_URL },
        { name: 'Digital menu by city', url: HUB_URL },
    ]);
    const list = itemListSchema(
        'Digital menu software by Tamil Nadu city',
        CITY_PAGES.map((c) => ({ name: `Digital menu in ${c.city}`, url: `${HUB_URL}/${c.slug}` })),
    );

    return (
        <>
            <JsonLd data={breadcrumbs} />
            <JsonLd data={list} />
            <Navbar />

            <section className="border-b border-line bg-paper-2 px-5 pt-32 pb-section lg:pb-section-lg">
                <div className="mx-auto max-w-3xl text-center">
                    <p className="text-caption font-semibold uppercase tracking-[0.1em] text-ink-45">
                        Tamil Nadu, city by city
                    </p>
                    <h1 className="mt-5 font-display text-h2 font-bold text-ink">
                        A digital menu for the way your city eats.
                    </h1>
                    <p className="mx-auto mt-6 max-w-2xl text-body text-ink-70">
                        A Coimbatore café that changes its menu every few weeks and a Chennai
                        restaurant with four cuisines on one page do not need the same menu. Each page below is written
                        for one city: what people eat there, where the restaurants are, and what
                        owners there ask before they switch.
                    </p>
                    <p className="mx-auto mt-4 max-w-2xl text-body text-ink-70">
                        The product is the same everywhere: photograph your paper menu, get a QR
                        code, edit prices from your phone. ₹{PLAN_PRICES_INR.qr_menu} a month, seven
                        days free, in Tamil and English.
                    </p>
                </div>
            </section>

            <section className="bg-paper px-5 py-section lg:py-section-lg">
                <div className="mx-auto max-w-6xl">
                    <h2 className="font-display text-h3 font-bold text-ink">
                        Choose your city
                    </h2>
                    <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {CITY_PAGES.map((c) => (
                            <li key={c.slug}>
                                <Link
                                    href={`/digital-menu/${c.slug}`}
                                    className="lift group flex h-full flex-col rounded-2xl border border-line bg-paper-2 p-6 transition-colors hover:border-primary/30"
                                >
                                    <span className="flex items-center gap-2 text-caption font-semibold text-ink-45">
                                        <MapPin className="h-4 w-4" strokeWidth={2} aria-hidden />
                                        {c.tamil}
                                    </span>
                                    <h3 className="mt-3 font-semibold leading-snug text-ink transition-colors group-hover:text-accent-text">
                                        Digital menu in {c.city}
                                    </h3>
                                    <p className="mt-2 flex-1 text-caption leading-relaxed text-ink-70">
                                        Known for {c.knownFor}. Restaurants in {c.areas.join(', ')}.
                                    </p>
                                    <span className="mt-5 inline-flex items-center gap-2 text-caption font-semibold text-primary">
                                        See the {c.city} page
                                        <ArrowRight className="cta-arrow h-4 w-4" strokeWidth={2.2} aria-hidden />
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>

                    <p className="mt-10 text-body text-ink-70">
                        Not in this list? The{' '}
                        <Link href="/digital-menu-india" className="font-medium text-accent-text underline underline-offset-2">
                            digital menu for India page
                        </Link>{' '}
                        covers the rest of the country, and{' '}
                        <Link href="/pricing" className="font-medium text-accent-text underline underline-offset-2">
                            the pricing page
                        </Link>{' '}
                        has the full ₹{PLAN_PRICES_INR.qr_menu} breakdown.
                    </p>
                </div>
            </section>

            <FooterCTA />
        </>
    );
}
