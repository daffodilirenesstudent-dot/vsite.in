import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import GuideArticle from '@/components/guide/GuideArticle';
import { GUIDE, GUIDE_ORDER, HUB_SLUG, guideUrl, type GuideSlug } from '@/content/guide';

/**
 * Every guide page except the hub, which has its own folder so its URL is
 * exactly /guide/digital-menu-setup.
 */
export const dynamicParams = false;

export function generateStaticParams(): { slug: string }[] {
    return GUIDE_ORDER.filter((s) => s !== HUB_SLUG).map((slug) => ({ slug }));
}

function resolve(slug: string): GuideSlug | null {
    return GUIDE_ORDER.includes(slug as GuideSlug) && slug !== HUB_SLUG ? (slug as GuideSlug) : null;
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
    const slug = resolve(params.slug);
    if (!slug) return {};
    const page = GUIDE[slug];
    const url = guideUrl(slug);
    return {
        title: page.title,
        description: page.description,
        alternates: {
            canonical: url,
            // Only pages with Tamil copy advertise an alternate.
            ...(page.ta
                ? { languages: { en: url, ta: guideUrl(slug, 'ta'), 'x-default': url } }
                : {}),
        },
        openGraph: { url, title: page.title, description: page.description },
    };
}

export default function GuidePage({ params }: { params: { slug: string } }) {
    const slug = resolve(params.slug);
    if (!slug) notFound();
    return <GuideArticle slug={slug} />;
}
