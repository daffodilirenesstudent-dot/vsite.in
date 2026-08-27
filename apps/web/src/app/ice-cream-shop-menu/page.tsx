import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { iceCreamShopPage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'Digital Menu for Ice Cream Shops & Parlours | vsite';
const DESCRIPTION =
    'QR menu software for ice cream parlours in India — AI photos for every flavour, sold-out toggling, flavour-of-the-day banners, UPI checkout. ₹299/month.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/ice-cream-shop-menu` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${BASE_URL}/ice-cream-shop-menu`, type: 'website' },
};

export default function IceCreamShopMenuPage() {
    const schemas = buildLandingSchemas({
        slug: 'ice-cream-shop-menu',
        title: TITLE,
        description: DESCRIPTION,
        faqs: iceCreamShopPage.faqs,
        breadcrumbLabel: 'Ice Cream Shop Menu',
    });
    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={iceCreamShopPage} />
        </>
    );
}
