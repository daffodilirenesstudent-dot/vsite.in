import { GUIDE } from './pages';
import type { GuideSlug } from './types';

export { GUIDE } from './pages';
export { guideSchema, guidePath, guideUrl, wordCount, ORG_ID } from './schema';
export type { GuideCopy, GuidePage, GuideSlug, GuideLang, GuideStep, GuideFaq, GuideSection, GuideLink } from './types';
export { CORE_STEP_MINUTES, TYPICAL_TOTAL_MINUTES, LIVE_MENU_MINUTES, COMPLETE_SETUP_MINUTES } from '@/content/facts';

/** Shown on every guide page and used as `updated` in GUIDE_PAGES. */
export const GUIDE_UPDATED = '2026-09-30';

export const HUB_SLUG: GuideSlug = 'digital-menu-setup';
export const HUB_PATH = `/guide/${HUB_SLUG}`;

/** Reading order: hub first, then the seven topics. Drives prev/next. */
export const GUIDE_ORDER: readonly GuideSlug[] = [
    'digital-menu-setup',
    'sign-up',
    'add-menu',
    'menu-design',
    'banners',
    'configuration',
    'qr-code',
    'cost-and-time',
];

/** Pages that also exist in Tamil. */
export const GUIDE_TA_SLUGS: readonly GuideSlug[] = GUIDE_ORDER.filter((s) => GUIDE[s].ta);

/** For the sitemap and llms-full to import. English URLs; Tamil pages are alternates. */
export const GUIDE_PAGES: { path: string; title: string; description: string; updated: string }[] =
    GUIDE_ORDER.map((slug) => ({
        path: `/guide/${slug}`,
        title: GUIDE[slug].title,
        description: GUIDE[slug].description,
        updated: GUIDE_UPDATED,
    }));
