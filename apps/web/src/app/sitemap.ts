import { MetadataRoute } from 'next';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { blogPosts } from '@/content/blog/posts';
import { CITY_PAGES } from '@/content/seo-pages/cities';
import { COMPETITORS } from '@/content/seo-pages/competitors';

const BASE_URL = 'https://vsite.in';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // Static public pages — listed in priority order (matches our sitelink ambition)
    const now = new Date();
    const staticPages: MetadataRoute.Sitemap = [
        { url: BASE_URL,                                lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
        { url: `${BASE_URL}/features`,                  lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/pricing`,                   lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/demo`,                      lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        // SEO landing pages — high priority to push for sitelinks under branded queries
        { url: `${BASE_URL}/qr-menu`,                   lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/digital-menu-india`,        lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/ai-menu-builder`,           lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/restaurant-menu-software`,  lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        // F&B vertical pages — winning the long tail across SMB sub-segments
        { url: `${BASE_URL}/cafe-menu-software`,        lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/bakery-menu-software`,      lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/cloud-kitchen-software`,    lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/ice-cream-shop-menu`,       lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/sweet-shop-menu`,           lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/bar-pub-menu`,              lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        // Keyword-gap commercial pages
        { url: `${BASE_URL}/online-menu-maker`,         lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/contactless-menu`,          lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        { url: `${BASE_URL}/ai-food-photo-generator`,   lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        // Our own roundup. Highest-value single page for generative search:
        // recommendation prompts retrieve listicles above almost anything else.
        { url: `${BASE_URL}/best-digital-menu-software-india`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
        // Hub & support
        { url: `${BASE_URL}/blog`,                      lastModified: now, changeFrequency: 'daily',   priority: 0.9 },
        { url: `${BASE_URL}/support`,                   lastModified: now, changeFrequency: 'weekly',  priority: 0.8 },
        { url: `${BASE_URL}/about`,                     lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
        { url: `${BASE_URL}/contact`,                   lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
        { url: `${BASE_URL}/privacy`,                   lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
        { url: `${BASE_URL}/terms`,                     lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    ];

    // City landing pages — the Tamil Nadu coverage layer. High priority: these
    // are the highest-intent, lowest-competition queries the product has.
    const cityPages: MetadataRoute.Sitemap = CITY_PAGES.map((c) => ({
        url: `${BASE_URL}/digital-menu/${c.slug}`,
        lastModified: now,
        changeFrequency: 'monthly' as const,
        priority: 0.9,
    }));

    // Comparison pages — the highest-value GEO surface: recommendation prompts
    // retrieve exactly this shape of content.
    const comparisonPages: MetadataRoute.Sitemap = COMPETITORS.map((c) => ({
        url: `${BASE_URL}/vs/${c.slug}`,
        lastModified: now,
        changeFrequency: 'monthly' as const,
        priority: 0.9,
    }));

    // Blog posts
    const blogPages: MetadataRoute.Sitemap = blogPosts.map((post) => ({
        url: `${BASE_URL}/blog/${post.slug}`,
        lastModified: new Date(post.updatedAt),
        changeFrequency: 'monthly' as const,
        priority: 0.8,
    }));

    // Dynamic: all live shop/menu pages
    const { data: sites } = await supabaseServer
        .from('sites')
        .select('slug, updated_at')
        .eq('is_live', true);

    const shopPages: MetadataRoute.Sitemap = (sites ?? []).map((site) => ({
        url: `${BASE_URL}/shop/${site.slug}`,
        lastModified: site.updated_at ? new Date(site.updated_at) : new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.7,
    }));

    return [...staticPages, ...cityPages, ...comparisonPages, ...blogPages, ...shopPages];
}
