import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { cloudKitchenPage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'Cloud Kitchen Software with QR Menu & UPI Ordering | vsite';
const DESCRIPTION =
    'Cloud kitchen software for India — branded direct-order link, QR codes for packaging, zero commission. Skip aggregator fees with vsite.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/cloud-kitchen-software` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${BASE_URL}/cloud-kitchen-software`, type: 'website' },
};

export default function CloudKitchenSoftwarePage() {
    const schemas = buildLandingSchemas({
        slug: 'cloud-kitchen-software',
        title: TITLE,
        description: DESCRIPTION,
        faqs: cloudKitchenPage.faqs,
        breadcrumbLabel: 'Cloud Kitchen Software',
    });
    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={cloudKitchenPage} />
        </>
    );
}
