import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { digitalMenuIndiaPage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'Digital Menu for Restaurants in India | ₹299/mo | vsite';
const DESCRIPTION =
    'Digital menu for Indian restaurants — Tamil language, AI food photos, UPI payment, zero commission. ₹299/month. Live in 3 minutes with vsite.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/digital-menu-india` },
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        url: `${BASE_URL}/digital-menu-india`,
        type: 'website',
    },
};

export default function DigitalMenuIndiaPage() {
    const schemas = buildLandingSchemas({
        slug: 'digital-menu-india',
        title: TITLE,
        description: DESCRIPTION,
        faqs: digitalMenuIndiaPage.faqs,
        breadcrumbLabel: 'Digital Menu India',
    });

    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={digitalMenuIndiaPage} />
        </>
    );
}
