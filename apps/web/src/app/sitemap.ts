import { MetadataRoute } from 'next';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { blogPosts } from '@/content/blog/posts';
import { CITY_PAGES } from '@/content/seo-pages/cities';
import { COMPETITORS } from '@/content/seo-pages/competitors';
import {
    buildStaticEntries,
    isSitemapShop,
    CLUSTER_LAST_MODIFIED,
    type SitemapSiteRow,
} from '@/lib/seo/sitemapData';

const BASE_URL = 'https://vsite.in';

async function loadShops(): Promise<SitemapSiteRow[]> {
    // One round trip: each site with its subscription and (at most) one dish.
    // The subscription embed is already used elsewhere (SiteContext, aiPageLedger).
    const full = await supabaseServer
        .from('sites')
        .select('slug, updated_at, site_subscriptions(store_expires_at, trial_ends_at), products(id)')
        .eq('is_live', true)
        .limit(1, { foreignTable: 'products' });
    if (!full.error && full.data) return full.data as unknown as SitemapSiteRow[];

    // If the products embed is not available, fall back to subscription-only
    // filtering rather than dropping every shop from the sitemap.
    const basic = await supabaseServer
        .from('sites')
        .select('slug, updated_at, site_subscriptions(store_expires_at, trial_ends_at)')
        .eq('is_live', true);
    return ((basic.data ?? []) as unknown as Omit<SitemapSiteRow, 'products'>[]).map((r) => ({
        ...r,
        products: [{ id: 'unchecked' }],
    }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const staticPages = buildStaticEntries();

    // City landing pages: the Tamil Nadu coverage layer.
    const cityPages: MetadataRoute.Sitemap = CITY_PAGES.map((c) => ({
        url: `${BASE_URL}/digital-menu/${c.slug}`,
        lastModified: CLUSTER_LAST_MODIFIED,
        changeFrequency: 'monthly' as const,
        priority: 0.9,
    }));

    // Comparison pages: the highest-value GEO surface.
    const comparisonPages: MetadataRoute.Sitemap = COMPETITORS.map((c) => ({
        url: `${BASE_URL}/vs/${c.slug}`,
        lastModified: CLUSTER_LAST_MODIFIED,
        changeFrequency: 'monthly' as const,
        priority: 0.9,
    }));

    const blogPages: MetadataRoute.Sitemap = blogPosts.map((post) => ({
        url: `${BASE_URL}/blog/${post.slug}`,
        lastModified: new Date(post.updatedAt),
        changeFrequency: 'monthly' as const,
        priority: 0.8,
    }));

    // Live shops a diner can use: paid or in trial, with at least one dish.
    const sites = await loadShops();
    const shopPages: MetadataRoute.Sitemap = sites.filter((s) => isSitemapShop(s)).map((site) => ({
        url: `${BASE_URL}/shop/${site.slug}`,
        // A shop without a timestamp is left undated rather than stamped "now".
        ...(site.updated_at ? { lastModified: new Date(site.updated_at) } : {}),
        changeFrequency: 'daily' as const,
        priority: 0.7,
    }));

    return [...staticPages, ...cityPages, ...comparisonPages, ...blogPages, ...shopPages];
}
