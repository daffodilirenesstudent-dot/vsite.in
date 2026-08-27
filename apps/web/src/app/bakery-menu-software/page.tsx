import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { bakeryMenuPage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'Digital Menu Software for Bakeries in India | vsite';
const DESCRIPTION =
    'QR menu software for bakeries — AI photos for cakes, breads, pastries; custom-order requests; UPI checkout. Live in 3 minutes. ₹299/month with vsite.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/bakery-menu-software` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${BASE_URL}/bakery-menu-software`, type: 'website' },
};

export default function BakeryMenuSoftwarePage() {
    const schemas = buildLandingSchemas({
        slug: 'bakery-menu-software',
        title: TITLE,
        description: DESCRIPTION,
        faqs: bakeryMenuPage.faqs,
        breadcrumbLabel: 'Bakery Menu Software',
    });
    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={bakeryMenuPage} />
        </>
    );
}
