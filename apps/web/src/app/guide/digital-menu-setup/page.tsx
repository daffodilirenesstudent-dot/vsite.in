import type { Metadata } from 'next';
import GuideArticle from '@/components/guide/GuideArticle';
import { GUIDE, guideUrl } from '@/content/guide';

const page = GUIDE['digital-menu-setup'];

export const metadata: Metadata = {
    title: page.title,
    description: page.description,
    alternates: {
        canonical: guideUrl('digital-menu-setup'),
        languages: {
            en: guideUrl('digital-menu-setup'),
            ta: guideUrl('digital-menu-setup', 'ta'),
            'x-default': guideUrl('digital-menu-setup'),
        },
    },
    openGraph: {
        url: guideUrl('digital-menu-setup'),
        title: page.title,
        description: page.description,
    },
};

export default function DigitalMenuSetupGuidePage() {
    return <GuideArticle slug="digital-menu-setup" />;
}
