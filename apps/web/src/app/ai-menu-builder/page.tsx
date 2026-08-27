import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { aiMenuBuilderPage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'AI Menu Builder for Restaurants | Free Setup in 3 Min | vsite';
const DESCRIPTION =
    'AI menu builder that reads your paper menu and generates a professional digital menu with food photos in 3 minutes. Tamil supported. Free trial — no credit card.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/ai-menu-builder` },
    openGraph: {
        title: TITLE,
        description: DESCRIPTION,
        url: `${BASE_URL}/ai-menu-builder`,
        type: 'website',
    },
};

export default function AiMenuBuilderPage() {
    const schemas = buildLandingSchemas({
        slug: 'ai-menu-builder',
        title: TITLE,
        description: DESCRIPTION,
        faqs: aiMenuBuilderPage.faqs,
        breadcrumbLabel: 'AI Menu Builder',
    });

    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={aiMenuBuilderPage} />
        </>
    );
}
