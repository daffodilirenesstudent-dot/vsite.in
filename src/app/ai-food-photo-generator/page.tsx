import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { aiFoodPhotoPage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'AI Food Photo Generator for Restaurant Menus | Free with vsite';
const DESCRIPTION =
    'Generate professional food photos for every menu item automatically. AI-trained on Indian cuisine — biryani, dosa, mithai, cocktails. Free with vsite at ₹299/month.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/ai-food-photo-generator` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${BASE_URL}/ai-food-photo-generator`, type: 'website' },
};

export default function AiFoodPhotoGeneratorPage() {
    const schemas = buildLandingSchemas({
        slug: 'ai-food-photo-generator',
        title: TITLE,
        description: DESCRIPTION,
        faqs: aiFoodPhotoPage.faqs,
        breadcrumbLabel: 'AI Food Photo Generator',
    });
    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={aiFoodPhotoPage} />
        </>
    );
}
