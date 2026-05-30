import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { restaurantMenuSoftwarePage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'Restaurant Menu Software in India 2026 | ₹299/mo | vsite';
const DESCRIPTION =
    'Restaurant menu software for India — QR menus, AI food photos, Tamil support, UPI payment, zero commission. ₹299/month. Free 14-day trial.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/restaurant-menu-software` },
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        url: `${BASE_URL}/restaurant-menu-software`,
        type: 'website',
    },
};

export default function RestaurantMenuSoftwarePage() {
    const schemas = buildLandingSchemas({
        slug: 'restaurant-menu-software',
        title: TITLE,
        description: DESCRIPTION,
        faqs: restaurantMenuSoftwarePage.faqs,
        breadcrumbLabel: 'Restaurant Menu Software',
    });

    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={restaurantMenuSoftwarePage} />
        </>
    );
}
