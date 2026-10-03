import type { Metadata } from 'next';
import GuideArticle from '@/components/guide/GuideArticle';
import { GUIDE, guideUrl } from '@/content/guide';

// Tamil copy: needs a native-speaker review before it is promoted or linked widely.
const ta = GUIDE['digital-menu-setup'].ta;

export const metadata: Metadata = {
    title: ta ? ta.h1 : GUIDE['digital-menu-setup'].title,
    description: ta ? ta.answer : GUIDE['digital-menu-setup'].description,
    alternates: {
        canonical: guideUrl('digital-menu-setup', 'ta'),
        languages: {
            en: guideUrl('digital-menu-setup'),
            ta: guideUrl('digital-menu-setup', 'ta'),
            'x-default': guideUrl('digital-menu-setup'),
        },
    },
    openGraph: { url: guideUrl('digital-menu-setup', 'ta'), locale: 'ta_IN' },
};

export default function TamilDigitalMenuSetupPage() {
    return <GuideArticle slug="digital-menu-setup" lang="ta" />;
}
