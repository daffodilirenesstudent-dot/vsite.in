import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { CITY_PAGES, getCityPage } from '@/content/seo-pages/cities';
import { buildCityPage } from '@/content/seo-pages/buildCityPage';
import { PLAN_PRICES_INR } from '@/lib/platform/productFlags';

const BASE_URL = 'https://vsite.in';

/**
 * /digital-menu/<city> — the Tamil Nadu coverage layer.
 *
 * Statically generated for the cities we can write honestly about, and 404 for
 * anything else. Deliberately NOT a catch-all that renders a page for any city
 * name someone types: an infinite surface of thin pages is the doorway-page
 * pattern Google penalises, and it would let a stray link mint a page nobody
 * wrote.
 *
 * The route is `/digital-menu/<city>` rather than `/digital-menu-<city>`
 * because Next.js dynamic segments must occupy a whole path segment. It also
 * gives the cluster a natural hub at `/digital-menu-india`, which links here.
 */

export function generateStaticParams() {
    return CITY_PAGES.map((c) => ({ city: c.slug }));
}

export const dynamicParams = false;

export async function generateMetadata(
    { params }: { params: { city: string } },
): Promise<Metadata> {
    const c = getCityPage(params.city);
    if (!c) return {};

    const title = `Digital Menu for Restaurants in ${c.city} | QR Menu ₹${PLAN_PRICES_INR.qr_menu}/mo — vsite`;
    const description =
        `QR code menu software for ${c.city} restaurants, cafés and messes. Tamil and English, ` +
        `AI food photos, live in 3 minutes. ₹${PLAN_PRICES_INR.qr_menu}/month, no commission. 7-day free trial.`;
    const url = `${BASE_URL}/digital-menu/${c.slug}`;

    return {
        title,
        description,
        keywords: [
            `digital menu ${c.city}`,
            `QR code menu ${c.city}`,
            `restaurant menu software ${c.city}`,
            `digital menu ${c.tamil}`,
            `QR menu Tamil Nadu`,
        ],
        alternates: { canonical: url },
        openGraph: { title, description, url, type: 'website', locale: 'en_IN' },
    };
}

export default function CityLandingPage({ params }: { params: { city: string } }) {
    const c = getCityPage(params.city);
    if (!c) notFound();

    const data = buildCityPage(c);

    const schemas = buildLandingSchemas({
        slug: `digital-menu/${c.slug}`,
        title: `Digital Menu for Restaurants in ${c.city}`,
        description: data.subtitle,
        faqs: data.faqs,
        breadcrumbLabel: `Digital Menu ${c.city}`,
    });

    /**
     * A local Service block on top of the shared schemas.
     *
     * `areaServed` names the city in English AND Tamil, which is the part that
     * matters here: vernacular and voice queries in Tamil are growing several
     * times faster than English ones in this market, and the Tamil name is the
     * form a spoken query actually takes.
     */
    const localSchema = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: `Digital Menu Software in ${c.city}`,
        serviceType: 'Digital menu and QR code menu software for restaurants',
        provider: {
            '@type': 'Organization',
            name: 'vsite',
            url: BASE_URL,
        },
        areaServed: [
            { '@type': 'City', name: c.city, alternateName: c.tamil },
            { '@type': 'AdministrativeArea', name: 'Tamil Nadu' },
        ],
        availableLanguage: ['Tamil', 'English'],
        offers: {
            '@type': 'Offer',
            price: String(PLAN_PRICES_INR.qr_menu),
            priceCurrency: 'INR',
            url: `${BASE_URL}/pricing`,
        },
    });

    return (
        <>
            {schemas.map((s, i) => (
                <script
                    key={i}
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: s }}
                />
            ))}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: localSchema }}
            />
            <SeoLanding data={data} />
        </>
    );
}
