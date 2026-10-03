import type { Metadata } from 'next';
import GuideArticle from '@/components/guide/GuideArticle';
import { GUIDE, guideUrl } from '@/content/guide';

// Tamil copy: needs a native-speaker review before it is promoted or linked widely.
const ta = GUIDE['cost-and-time'].ta;

export const metadata: Metadata = {
    title: ta ? ta.h1 : GUIDE['cost-and-time'].title,
    description: ta ? ta.answer : GUIDE['cost-and-time'].description,
    alternates: {
        canonical: guideUrl('cost-and-time', 'ta'),
        languages: {
            en: guideUrl('cost-and-time'),
            ta: guideUrl('cost-and-time', 'ta'),
            'x-default': guideUrl('cost-and-time'),
        },
    },
    openGraph: { url: guideUrl('cost-and-time', 'ta'), locale: 'ta_IN' },
};

export default function TamilCostAndTimePage() {
    return <GuideArticle slug="cost-and-time" lang="ta" />;
}
