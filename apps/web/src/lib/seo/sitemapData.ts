import type { MetadataRoute } from 'next';
import { trialEndsMs } from '@/lib/store/trialRules';
import { SITE_ORIGIN } from '@/lib/seo/entity';

type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface StaticPage {
    path: string;
    label: string;
    /** Date the page's source last changed (git log), not the request time. */
    lastModified: string;
    changeFrequency: Freq;
    priority: number;
}

/**
 * Every static marketing page, in priority order. `lastModified` is the date
 * of the last commit that touched the page source, so a crawler sees a date
 * that moves only when the page does. `now` made every URL look changed on
 * every request, which teaches a crawler to ignore the field.
 *
 * Update the date when you change a page's copy.
 */
export const STATIC_PAGES: StaticPage[] = [
    { path: '', label: 'Home', lastModified: '2026-09-12', changeFrequency: 'weekly', priority: 1.0 },
    { path: '/features', label: 'Features', lastModified: '2026-08-30', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/pricing', label: 'Pricing', lastModified: '2026-08-30', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/demo', label: 'Live demo', lastModified: '2026-08-30', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/qr-menu', label: 'QR code menu', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/digital-menu-india', label: 'Digital menu in India', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/digital-menu', label: 'Digital menu by city (Tamil Nadu)', lastModified: '2026-09-30', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/ai-menu-builder', label: 'AI menu builder', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/restaurant-menu-software', label: 'Restaurant menu software', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/cafe-menu-software', label: 'Café menu software', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/bakery-menu-software', label: 'Bakery menu software', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/cloud-kitchen-software', label: 'Cloud kitchen software', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/ice-cream-shop-menu', label: 'Ice cream shop menu', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/sweet-shop-menu', label: 'Sweet shop menu', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/bar-pub-menu', label: 'Bar and pub menu', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/online-menu-maker', label: 'Online menu maker', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/contactless-menu', label: 'Contactless menu', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/ai-food-photo-generator', label: 'AI food photos', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/best-digital-menu-software-india', label: 'Best digital menu software in India', lastModified: '2026-09-12', changeFrequency: 'monthly', priority: 0.9 },
    // Built by another workstream; paths are listed here so the sitemap is
    // complete the moment those pages exist.
    { path: '/guide/digital-menu-setup', label: 'Digital menu setup guide', lastModified: '2026-09-30', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/ta/guide/digital-menu-setup', label: 'Digital menu setup guide (Tamil)', lastModified: '2026-09-30', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/blog', label: 'Blog', lastModified: '2026-08-30', changeFrequency: 'daily', priority: 0.9 },
    { path: '/support', label: 'Support centre', lastModified: '2026-08-30', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/about', label: 'About vsite', lastModified: '2026-08-30', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/contact', label: 'Contact', lastModified: '2026-08-27', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/privacy', label: 'Privacy policy', lastModified: '2026-08-30', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/terms', label: 'Terms of service', lastModified: '2026-09-26', changeFrequency: 'yearly', priority: 0.3 },
];

export function buildStaticEntries(): MetadataRoute.Sitemap {
    return STATIC_PAGES.map((p) => ({
        url: `${SITE_ORIGIN}${p.path}`,
        lastModified: new Date(p.lastModified),
        changeFrequency: p.changeFrequency,
        priority: p.priority,
    }));
}

/** Date of the last change to the cluster-page templates (cities, /vs). */
export const CLUSTER_LAST_MODIFIED = new Date('2026-09-12');

interface SubRow {
    store_expires_at?: string | null;
    trial_ends_at?: string | null;
}

export interface SitemapSiteRow {
    slug: string;
    updated_at: string | null;
    site_subscriptions: SubRow | SubRow[] | null;
    products: { id: string }[] | null;
}

/**
 * Only shops a diner can actually use belong in the sitemap: paid up or in
 * trial, and with at least one dish. An empty or lapsed shop renders a
 * "currently unavailable" page, which would be a soft-404 submitted to Google.
 */
export function isSitemapShop(row: SitemapSiteRow, nowMs: number = Date.now()): boolean {
    const sub = Array.isArray(row.site_subscriptions) ? row.site_subscriptions[0] : row.site_subscriptions;
    if (!sub) return false;
    const paidUntil = sub.store_expires_at ? new Date(sub.store_expires_at).getTime() : 0;
    const active = paidUntil > nowMs || trialEndsMs(sub) > nowMs;
    return active && (row.products?.length ?? 0) > 0;
}
