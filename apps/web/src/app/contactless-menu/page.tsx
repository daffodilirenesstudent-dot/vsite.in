import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { contactlessMenuPage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'Contactless Menu for Restaurants — No App Download | vsite';
const DESCRIPTION =
    'Contactless QR menu for Indian F&B businesses — opens in any phone browser, no app download, 2-second load. Tamil + English. ₹299/month with vsite.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/contactless-menu` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${BASE_URL}/contactless-menu`, type: 'website' },
};

export default function ContactlessMenuPage() {
    const schemas = buildLandingSchemas({
        slug: 'contactless-menu',
        title: TITLE,
        description: DESCRIPTION,
        faqs: contactlessMenuPage.faqs,
        breadcrumbLabel: 'Contactless Menu',
    });
    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={contactlessMenuPage} />
        </>
    );
}
