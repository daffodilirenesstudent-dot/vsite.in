import {
    SITE_URL,
    PRICE_INR_PER_MONTH,
    TRIAL_DAYS,
    BILLING_DAYS,
} from '@/content/facts';
import { GUIDE } from './pages';
import type { GuideLang, GuideSlug } from './types';

/** Workstream B defines the Organization node; this is only a reference to it. */
export const ORG_ID = `${SITE_URL}/#org`;

export function guidePath(slug: GuideSlug, lang: GuideLang = 'en'): string {
    return `${lang === 'ta' ? '/ta' : ''}/guide/${slug}`;
}

export function guideUrl(slug: GuideSlug, lang: GuideLang = 'en'): string {
    return `${SITE_URL}${guidePath(slug, lang)}`;
}

/** Words in a string, counting runs of non-space characters. */
export function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The three JSON-LD nodes for a guide page: HowTo, FAQPage, BreadcrumbList.
 *
 * Built from the same data the page renders, so the markup can never describe
 * steps or answers the reader cannot see. No rating, no image, no screenshot
 * node: none exists and none is claimed.
 */
export function guideSchema(slug: GuideSlug, lang: GuideLang = 'en'): Record<string, unknown>[] {
    const page = GUIDE[slug];
    const copy = lang === 'ta' && page.ta ? page.ta : page.en;
    const url = guideUrl(slug, lang);
    const inLanguage = lang === 'ta' && page.ta ? 'ta' : 'en';

    const howTo = {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        '@id': `${url}#howto`,
        name: copy.h1,
        description: `${copy.answer} Cost: ${PRICE_INR_PER_MONTH} INR per ${BILLING_DAYS}-day month after a ${TRIAL_DAYS}-day free trial.`,
        inLanguage,
        url,
        totalTime: `PT${page.totalMinutes}M`,
        estimatedCost: {
            '@type': 'MonetaryAmount',
            currency: 'INR',
            value: String(PRICE_INR_PER_MONTH),
        },
        step: copy.steps.map((s, i) => ({
            '@type': 'HowToStep',
            position: i + 1,
            name: s.name,
            text: s.text,
        })),
        publisher: { '@id': ORG_ID },
    };

    const faq = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        inLanguage,
        mainEntity: copy.faqs.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
        publisher: { '@id': ORG_ID },
    };

    const hubName = lang === 'ta' && GUIDE['digital-menu-setup'].ta ? GUIDE['digital-menu-setup'].ta.h1 : GUIDE['digital-menu-setup'].short;
    const crumbs: { name: string; item: string }[] = [
        { name: 'vsite', item: SITE_URL },
        { name: hubName, item: guideUrl('digital-menu-setup', lang) },
    ];
    if (slug !== 'digital-menu-setup') crumbs.push({ name: page.short, item: url });

    const breadcrumb = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: crumbs.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.name,
            item: c.item,
        })),
    };

    return [howTo, faq, breadcrumb];
}
