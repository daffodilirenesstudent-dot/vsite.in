import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { barMenuPage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'Digital Bar & Pub Menu Software in India | QR Drinks Menu | vsite';
const DESCRIPTION =
    'QR drinks menu for bars and pubs in India — AI cocktail photos, happy-hour pricing toggles, Tamil + English. ₹299/month, no commission.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/bar-pub-menu` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${BASE_URL}/bar-pub-menu`, type: 'website' },
};

export default function BarPubMenuPage() {
    const schemas = buildLandingSchemas({
        slug: 'bar-pub-menu',
        title: TITLE,
        description: DESCRIPTION,
        faqs: barMenuPage.faqs,
        breadcrumbLabel: 'Bar & Pub Menu',
    });
    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={barMenuPage} />
        </>
    );
}
