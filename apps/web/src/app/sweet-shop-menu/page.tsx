import type { Metadata } from 'next';
import SeoLanding, { buildLandingSchemas } from '@/components/home/SeoLanding';
import { sweetShopPage } from '@/content/seo-pages/data';

const BASE_URL = 'https://vsite.in';
const TITLE = 'Digital Menu for Sweet Shops & Mithai Shops in India | vsite';
const DESCRIPTION =
    'QR menu for sweet shops and mithai shops in India — AI photos, per-kg pricing, festival menus, gift-box ordering, Tamil naming. ₹299/month with vsite.';

export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${BASE_URL}/sweet-shop-menu` },
    openGraph: { title: TITLE, description: DESCRIPTION, url: `${BASE_URL}/sweet-shop-menu`, type: 'website' },
};

export default function SweetShopMenuPage() {
    const schemas = buildLandingSchemas({
        slug: 'sweet-shop-menu',
        title: TITLE,
        description: DESCRIPTION,
        faqs: sweetShopPage.faqs,
        breadcrumbLabel: 'Sweet Shop Menu',
    });
    return (
        <>
            {schemas.map((s, i) => (
                <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: s }} />
            ))}
            <SeoLanding data={sweetShopPage} />
        </>
    );
}
