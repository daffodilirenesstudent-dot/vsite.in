import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { onlineMenuMakerPage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'Online Menu Maker for Restaurants & Cafés in India | vsite';
const DESCRIPTION =
    'Build your full digital menu online in 3 minutes. AI extracts items from your paper menu photo and generates food photos. Free 7-day trial.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/online-menu-maker` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${BASE_URL}/online-menu-maker`, type: 'website' },
};

export default function OnlineMenuMakerPage() {
    const schemas = buildLandingSchemas({
        slug: 'online-menu-maker',
        title: TITLE,
        description: DESCRIPTION,
        faqs: onlineMenuMakerPage.faqs,
        breadcrumbLabel: 'Online Menu Maker',
    });
    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={onlineMenuMakerPage} />
        </>
    );
}
