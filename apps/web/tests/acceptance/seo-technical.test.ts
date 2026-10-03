import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Workstream B: technical SEO, schema and linking.
 *
 * Pure helpers are tested directly; route files that cannot be imported
 * without a browser or a database are checked by reading their source.
 */

vi.mock('@/lib/platform/db/supabase-server', () => ({
    supabaseServer: { from: vi.fn() },
}));

import { ORG_ID, SAME_AS, INSTAGRAM_URL, orgRef, organizationSchema } from '@/lib/seo/entity';
import { faqPageSchema, breadcrumbSchema, serializeJsonLd } from '@/lib/seo/jsonld';
import { HOME_FAQS, PRICING_FAQS, CONTACT_FAQS } from '@/content/faqs';
import {
    STATIC_PAGES,
    buildStaticEntries,
    isSitemapShop,
    type SitemapSiteRow,
} from '@/lib/seo/sitemapData';
import { parseInline, newestPost, relatedPosts, buildArticleSchema } from '@/lib/seo/blog';
import { InlineText } from '@/components/blog/InlineText';
import { buildShopSchema } from '@/lib/seo/shopSchema';
import { buildLlmsFull } from '@/lib/seo/llmsFull';
import robots from '@/app/robots';
import { blogPosts } from '@/content/blog/posts';
import { CITY_PAGES } from '@/content/seo-pages/cities';
import type { BlogPost } from '@/content/blog/types';

const WEB = join(__dirname, '..', '..');
const src = (p: string) => readFileSync(join(WEB, 'src', p), 'utf8');

const DAY = 24 * 60 * 60 * 1000;

describe('1. one Organization entity', () => {
    it('defines the org once with a stable @id', () => {
        const org = organizationSchema();
        expect(org['@id']).toBe(ORG_ID);
        expect(ORG_ID).toBe('https://vsite.in/#org');
        expect(org['@type']).toBe('Organization');
        expect(orgRef()).toEqual({ '@id': ORG_ID });
    });

    it('uses one sameAs list, matching the footer instagram link', () => {
        expect(organizationSchema().sameAs).toEqual(SAME_AS);
        expect(SAME_AS).toContain(INSTAGRAM_URL);
        expect(INSTAGRAM_URL).toBe('https://www.instagram.com/vsite.in');
        expect(src('app/layout.tsx')).not.toContain('instagram.com/vsitein');
        expect(src('components/home/FooterCTA.tsx')).toContain('INSTAGRAM_URL');
        expect(src('components/home/FooterCTA.tsx')).not.toContain('"https://www.instagram.com');
    });

    it('layout emits the org; other pages only reference it', () => {
        expect(src('app/layout.tsx')).toMatch(/organizationSchema\(\)/);
        for (const f of ['app/about/page.tsx', 'app/contact/page.tsx', 'app/page.tsx', 'app/blog/page.tsx']) {
            const s = src(f);
            expect(s, `${f} redefines the Organization`).not.toMatch(/'@type':\s*'(Organization|LocalBusiness)'/);
            expect(s, `${f} should reference the org`).toMatch(/orgRef\(\)|ORG_ID/);
        }
    });
});

describe('2. FAQPage schema from the rendered data', () => {
    it('builds a FAQPage whose text equals the data', () => {
        const s = faqPageSchema(HOME_FAQS);
        expect(s['@type']).toBe('FAQPage');
        expect(s.mainEntity).toHaveLength(HOME_FAQS.length);
        expect(s.mainEntity[0].name).toBe(HOME_FAQS[0].q);
        expect(s.mainEntity[0].acceptedAnswer.text).toBe(HOME_FAQS[0].a);
    });

    it('the components render and emit from the exported arrays (no copy)', () => {
        expect(src('components/home/FAQ.tsx')).toMatch(/HOME_FAQS/);
        expect(src('components/home/FAQ.tsx')).toMatch(/faqPageSchema\(HOME_FAQS\)/);
        expect(src('app/pricing/PricingFAQ.tsx')).toMatch(/faqPageSchema\(PRICING_FAQS\)/);
        expect(src('app/contact/page.tsx')).toMatch(/faqPageSchema\(CONTACT_FAQS\)/);
        expect(src('components/home/FAQ.tsx')).not.toMatch(/q: 'Can customers order/);
    });

    it('every answer is non-empty and no schema carries a rating', () => {
        for (const f of [...HOME_FAQS, ...PRICING_FAQS, ...CONTACT_FAQS]) {
            expect(f.q.length).toBeGreaterThan(5);
            expect(f.a.length).toBeGreaterThan(10);
        }
        const all = JSON.stringify([
            organizationSchema(),
            faqPageSchema(HOME_FAQS),
            faqPageSchema(PRICING_FAQS),
            faqPageSchema(CONTACT_FAQS),
        ]);
        expect(all).not.toContain('aggregateRating');
    });

    it('serialises to parseable JSON with < escaped', () => {
        const out = serializeJsonLd({ a: '</script><b>' });
        expect(out).not.toContain('</script>');
        expect(JSON.parse(out).a).toBe('</script><b>');
    });
});

describe('3. canonicals', () => {
    it('root layout no longer hands every page the homepage canonical', () => {
        expect(src('app/layout.tsx')).not.toMatch(/alternates:\s*\{/);
    });

    it('homepage keeps its own canonical', () => {
        expect(src('app/page.tsx')).toMatch(/canonical:\s*BASE_URL/);
    });

    it.each([
        'features', 'pricing', 'demo', 'about', 'contact', 'support', 'blog', 'privacy', 'terms',
        'best-digital-menu-software-india', 'qr-menu', 'digital-menu-india', 'cafe-menu-software',
        'digital-menu', 'digital-menu/[city]', 'vs/[competitor]', 'blog/[slug]',
    ])('%s has a self-canonical in its own page metadata', (route) => {
        expect(src(`app/${route}/page.tsx`)).toMatch(/canonical/);
    });
});

describe('4. sitemap', () => {
    it('gives static pages real, fixed dates (not now)', () => {
        const entries = buildStaticEntries();
        for (const e of entries) {
            expect(e.lastModified).toBeInstanceOf(Date);
            expect(Number.isNaN((e.lastModified as Date).getTime())).toBe(false);
            expect((e.lastModified as Date).getTime()).toBeLessThan(Date.now() + DAY);
        }
        expect(src('app/sitemap.ts')).not.toMatch(/const now = new Date\(\)/);
    });

    it('lists the hub and the guide pages', () => {
        const urls = buildStaticEntries().map((e) => e.url);
        expect(urls).toContain('https://vsite.in/digital-menu');
        expect(urls).toContain('https://vsite.in/guide/digital-menu-setup');
        expect(urls).toContain('https://vsite.in/ta/guide/digital-menu-setup');
        expect(new Set(urls).size).toBe(urls.length);
        expect(STATIC_PAGES.length).toBe(urls.length);
    });

    const future = new Date(Date.now() + 5 * DAY).toISOString();
    const past = new Date(Date.now() - 5 * DAY).toISOString();
    const row = (over: Partial<SitemapSiteRow> = {}): SitemapSiteRow => ({
        slug: 'a',
        updated_at: '2026-09-01T00:00:00Z',
        site_subscriptions: { store_expires_at: null, trial_ends_at: future },
        products: [{ id: 'p1' }],
        ...over,
    });

    it('includes trial and paid shops with menu items', () => {
        expect(isSitemapShop(row())).toBe(true);
        expect(isSitemapShop(row({ site_subscriptions: { store_expires_at: future, trial_ends_at: null } }))).toBe(true);
        // PostgREST returns a to-one embed as an object, but tolerate an array.
        expect(isSitemapShop(row({ site_subscriptions: [{ store_expires_at: future, trial_ends_at: null }] }))).toBe(true);
    });

    it('excludes expired, subscription-less and empty shops', () => {
        expect(isSitemapShop(row({ site_subscriptions: { store_expires_at: past, trial_ends_at: past } }))).toBe(false);
        expect(isSitemapShop(row({ site_subscriptions: null }))).toBe(false);
        expect(isSitemapShop(row({ products: [] }))).toBe(false);
    });

    it('the sitemap route filters shops through the helper', async () => {
        const { supabaseServer } = await import('@/lib/platform/db/supabase-server');
        const order = {
            eq: () => ({
                limit: () =>
                    Promise.resolve({
                        data: [
                            row({ slug: 'live-shop' }),
                            row({ slug: 'empty-shop', products: [] }),
                            row({ slug: 'expired', site_subscriptions: { store_expires_at: past, trial_ends_at: past } }),
                        ],
                        error: null,
                    }),
            }),
        };
        (supabaseServer.from as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ select: () => order });
        const sitemap = (await import('@/app/sitemap')).default;
        const out = await sitemap();
        const urls = out.map((e) => e.url);
        expect(urls).toContain('https://vsite.in/shop/live-shop');
        expect(urls).not.toContain('https://vsite.in/shop/empty-shop');
        expect(urls).not.toContain('https://vsite.in/shop/expired');
        for (const p of blogPosts) {
            const e = out.find((x) => x.url === `https://vsite.in/blog/${p.slug}`);
            expect((e?.lastModified as Date).toISOString().slice(0, 10)).toBe(p.updatedAt);
        }
    });
});

describe('5. noindex on private surfaces', () => {
    it.each([
        'app/login/layout.tsx',
        'app/signup/layout.tsx',
        'app/auth/layout.tsx',
        'app/tmp-preview/layout.tsx',
        'app/shop/preview/layout.tsx',
    ])('%s sets robots noindex', (f) => {
        expect(existsSync(join(WEB, 'src', f))).toBe(true);
        expect(src(f)).toMatch(/robots:\s*\{\s*index:\s*false/);
    });
});

describe('6. city hub', () => {
    const hub = () => src('app/digital-menu/page.tsx');

    it('links all cities and uses the marketing design rules', () => {
        const s = hub();
        expect(s).toMatch(/CITY_PAGES/);
        expect(s).toMatch(/<Navbar \/>/);
        expect(s).toMatch(/<FooterCTA \/>/);
        expect(s).toMatch(/pt-(?:28|32|36|40)\b/);
        expect(s).toMatch(/py-section/);
        expect(s).toMatch(/canonical/);
        expect(s).toMatch(/BreadcrumbList|breadcrumbSchema/);
        expect(s).toMatch(/ItemList|itemListSchema/);
        expect(CITY_PAGES.length).toBeGreaterThanOrEqual(13);
    });

    it('is linked from the footer with the setup guide', () => {
        const f = src('components/home/FooterCTA.tsx');
        expect(f).toContain("href: '/digital-menu'");
        expect(f).toContain("href: '/guide/digital-menu-setup'");
    });
});

function post(over: Partial<BlogPost>): BlogPost {
    return {
        slug: 's', title: 'T', description: 'D', category: 'Guide', categoryClass: '', tags: [],
        publishedAt: '2026-01-01', updatedAt: '2026-01-01', author: 'vsite Team', authorTitle: '',
        readTime: 1, content: [], ...over,
    };
}

describe('7. blog renderer', () => {
    it('parses inline links, internal and external', () => {
        const parts = parseInline('See [pricing](/pricing) and [Google](https://google.com) now.');
        expect(parts).toEqual([
            { type: 'text', text: 'See ' },
            { type: 'link', text: 'pricing', href: '/pricing', external: false },
            { type: 'text', text: ' and ' },
            { type: 'link', text: 'Google', href: 'https://google.com', external: true },
            { type: 'text', text: ' now.' },
        ]);
    });

    it('leaves plain text, brackets and unsafe schemes alone', () => {
        expect(parseInline('no links [here]')).toEqual([{ type: 'text', text: 'no links [here]' }]);
        const bad = parseInline('[x](javascript:alert(1)) and [y](//evil.com)');
        expect(bad.every((p) => p.type === 'text')).toBe(true);
    });

    it('renders internal links as anchors and external with noopener, never raw HTML', () => {
        const html = renderToStaticMarkup(
            createElement(InlineText, { text: 'a [p](/pricing) b [g](https://g.co) <b>x</b>' }),
        );
        expect(html).toContain('href="/pricing"');
        expect(html).toMatch(/href="https:\/\/g\.co"[^>]*rel="noopener/);
        expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    });

    it('the post page renders inline links in p, lists, callouts and cells', () => {
        const s = src('app/blog/[slug]/page.tsx');
        expect((s.match(/<InlineText/g) ?? []).length).toBeGreaterThanOrEqual(6);
        expect(s).not.toMatch(/dangerouslySetInnerHTML=\{\{ __html: block/);
    });

    it('newest post is by publishedAt, not array order', () => {
        const a = post({ slug: 'a', publishedAt: '2026-01-01' });
        const b = post({ slug: 'b', publishedAt: '2026-06-01' });
        expect(newestPost([a, b]).slug).toBe('b');
        expect(src('app/blog/page.tsx')).toMatch(/newestPost/);
    });

    it('related posts prefer same category and tags over array order', () => {
        const cur = post({ slug: 'cur', category: 'Guide', tags: ['qr', 'menu'] });
        const far = post({ slug: 'far', category: 'News', tags: [], publishedAt: '2026-09-01' });
        const tagMatch = post({ slug: 'tag', category: 'News', tags: ['qr'], publishedAt: '2026-02-01' });
        const cat = post({ slug: 'cat', category: 'Guide', tags: [], publishedAt: '2026-01-01' });
        const both = post({ slug: 'both', category: 'Guide', tags: ['qr', 'menu'], publishedAt: '2026-01-01' });
        const out = relatedPosts([far, tagMatch, cat, both, cur], cur, 3).map((p) => p.slug);
        expect(out).toEqual(['both', 'cat', 'tag']);
    });

    it('Article schema: image, org author/publisher by @id, dateModified', () => {
        const p = post({ slug: 'x', updatedAt: '2026-03-03', publishedAt: '2026-02-02' });
        const s = buildArticleSchema(p);
        expect(s.image).toBe('https://vsite.in/og-image.png');
        expect(s.dateModified).toBe('2026-03-03');
        expect(s.datePublished).toBe('2026-02-02');
        expect(s.author).toEqual({ '@id': ORG_ID });
        expect(s.publisher).toEqual({ '@id': ORG_ID });
    });
});

describe('8. shop JSON-LD', () => {
    const products = [
        { id: '1', name: 'Masala Dosa', selling_price: 80, description: 'Crisp', category: 'Tiffin', is_live: true },
        { id: '2', name: 'Filter Coffee', selling_price: 30, description: null, category: 'Drinks', is_live: true },
        { id: '3', name: 'Idli', selling_price: 40, description: null, category: 'Tiffin', is_live: false },
    ];

    it('builds Restaurant + Menu from loaded data only', () => {
        const s = buildShopSchema({ slug: 'cafe-x', name: 'Cafe X', type: 'cafe', currency: 'INR', products });
        expect(s['@type']).toBe('CafeOrCoffeeShop');
        expect(s.url).toBe('https://vsite.in/shop/cafe-x');
        const sections = s.hasMenu.hasMenuSection;
        expect(sections.map((x) => x.name)).toEqual(['Tiffin', 'Drinks']);
        expect(sections[0].hasMenuItem.map((i) => i.name)).toEqual(['Masala Dosa', 'Idli']);
        expect(sections[0].hasMenuItem[0].offers).toEqual({ '@type': 'Offer', price: '80', priceCurrency: 'INR' });
        expect(sections[0].hasMenuItem[0].description).toBe('Crisp');
        expect(sections[1].hasMenuItem[0]).not.toHaveProperty('description');
        const json = JSON.stringify(s);
        for (const banned of ['aggregateRating', 'address', 'telephone', 'review']) {
            expect(json).not.toContain(banned);
        }
    });

    it('caps the payload', () => {
        const many = Array.from({ length: 500 }, (_, i) => ({
            id: String(i), name: `Dish ${i}`, selling_price: 10, description: null, category: 'C', is_live: true,
        }));
        const s = buildShopSchema({ slug: 'big', name: 'Big', type: null, currency: 'INR', products: many });
        const n = s.hasMenu.hasMenuSection.reduce((a, x) => a + x.hasMenuItem.length, 0);
        expect(n).toBeLessThanOrEqual(120);
        expect(s['@type']).toBe('Restaurant');
    });

    it('is wired into the shop page without touching ISR', () => {
        const s = src('app/shop/[slug]/page.tsx');
        expect(s).toMatch(/buildShopSchema/);
        expect(s).toMatch(/export const revalidate = 10;/);
    });
});

describe('9. llms-full.txt', () => {
    const text = buildLlmsFull();

    it('states the facts, the ordering boundary, every FAQ and every post', () => {
        expect(text).toContain('Rs 299');
        expect(text).toContain('Menu ordering with UPI payment is coming soon');
        for (const f of [...HOME_FAQS, ...PRICING_FAQS, ...CONTACT_FAQS]) {
            expect(text).toContain(f.q);
        }
        for (const p of blogPosts) {
            expect(text).toContain(`https://vsite.in/blog/${p.slug}`);
            expect(text).toContain(p.title);
        }
        for (const c of CITY_PAGES) expect(text).toContain(`https://vsite.in/digital-menu/${c.slug}`);
        for (const page of STATIC_PAGES) expect(text).toContain(`https://vsite.in${page.path}`);
    });

    it('does not claim ordering works', () => {
        expect(text).not.toMatch(/customers can order (from|in) the menu/i);
        expect(text).not.toContain('aggregateRating');
    });

    it('has a text/plain route with llms.txt-style caching', () => {
        const r = src('app/llms-full.txt/route.ts');
        expect(r).toMatch(/text\/plain; charset=utf-8/);
        expect(r).toMatch(/max-age=3600/);
        expect(r).toMatch(/buildLlmsFull/);
    });
});

describe('10. robots', () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const agents = rules.map((x) => x.userAgent);

    it('keeps existing allows and adds search + Apple/Amazon/Meta agents', () => {
        for (const a of ['*', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bingbot', 'Googlebot', 'Amazonbot', 'Applebot', 'Meta-ExternalAgent']) {
            expect(agents, a).toContain(a);
        }
        expect(agents).not.toContain('Bytespider');
    });

    it('keeps private areas disallowed for every agent, and the sitemap line', () => {
        for (const rule of rules) {
            expect(rule.disallow).toEqual(expect.arrayContaining(['/manage/', '/api/', '/onboarding/']));
        }
        expect(r.sitemap).toBe('https://vsite.in/sitemap.xml');
    });
});

describe('breadcrumb helper', () => {
    it('numbers items from 1', () => {
        const b = breadcrumbSchema([{ name: 'Home', url: 'https://vsite.in' }, { name: 'X', url: 'https://vsite.in/x' }]);
        expect(b.itemListElement[1]).toMatchObject({ position: 2, name: 'X' });
    });
});
