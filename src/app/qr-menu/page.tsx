import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { qrMenuPage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'QR Code Menu for Restaurants in India 2026 | vsite';
const DESCRIPTION =
    'Create a QR code menu for your restaurant in 3 minutes. AI food photos, Tamil support, zero commission. ₹299/month with a 14-day free trial.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/qr-menu` },
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        url: `${BASE_URL}/qr-menu`,
        type: 'website',
    },
};

export default function QrMenuLandingPage() {
    const schemas = buildLandingSchemas({
        slug: 'qr-menu',
        title: TITLE,
        description: DESCRIPTION,
        faqs: qrMenuPage.faqs,
        breadcrumbLabel: 'QR Code Menu',
    });

    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={qrMenuPage} />
        </>
    );
}
