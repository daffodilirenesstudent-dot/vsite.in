import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { cafeMenuPage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'Digital Menu Software for Cafés in India | QR Menu | vsite';
const DESCRIPTION =
    'QR menu software for cafés in India — AI food photos, real-time daily specials, Tamil + English. Live in 3 minutes. ₹299/month, no commission.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/cafe-menu-software` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${BASE_URL}/cafe-menu-software`, type: 'website' },
};

export default function CafeMenuSoftwarePage() {
    const schemas = buildLandingSchemas({
        slug: 'cafe-menu-software',
        title: TITLE,
        description: DESCRIPTION,
        faqs: cafeMenuPage.faqs,
        breadcrumbLabel: 'Café Menu Software',
    });
    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={cafeMenuPage} />
        </>
    );
}
