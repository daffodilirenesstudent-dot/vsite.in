import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { seoPosts } from '@/content/blog/posts-seo';
import { blogPosts } from '@/content/blog/posts';
import { CITY_PAGES } from '@/content/seo-pages/cities';
import { buildCityPage } from '@/content/seo-pages/buildCityPage';
import type { ContentBlock } from '@/content/blog/types';

const APP = join(__dirname, '..', '..', 'src', 'app');
/** Routes that exist via dynamic segments or sibling workstreams. */
const KNOWN_DYNAMIC_ROOTS = new Set(['guide', 'vs', 'blog', 'digital-menu']);

const BANNED =
    /fastest[- ]growing|most affordable|hundreds of (restaurants|caf[eé]s|stores|shops|menus|owners)|thousands of (restaurants|caf[eé]s)|ai[- ]generated|generates? (a |an |the |your )?(food |ai )?(photo|image)|generated (food )?(photo|image)|testimonial|case study|live in 3 minutes|about 3 minutes|3 minutes/i;

function blockText(b: ContentBlock): string {
    switch (b.type) {
        case 'ul':
        case 'ol':
            return b.items.join(' ');
        case 'table':
            return [...b.headers, ...b.rows.flat()].join(' ');
        case 'faq':
            return `${b.q} ${b.a}`;
        case 'image':
            return `${b.alt} ${b.caption ?? ''}`;
        default:
            return b.text;
    }
}

function allText(p: { title: string; description: string; content: ContentBlock[]; faqSchema?: { q: string; a: string }[] }) {
    return [p.title, p.description, ...p.content.map(blockText), ...(p.faqSchema ?? []).map((f) => `${f.q} ${f.a}`)].join('\n');
}

function linkPaths(text: string): string[] {
    return [...text.matchAll(/\]\((\/[^)#?\s]*)/g)].map((m) => m[1]);
}

function pathExists(path: string): boolean {
    const seg = path.split('/').filter(Boolean);
    if (seg.length === 0) return true;
    if (seg[0] === 'digital-menu' && seg[1]) return CITY_PAGES.some((c) => c.slug === seg[1]);
    if (existsSync(join(APP, seg[0]))) return true;
    return KNOWN_DYNAMIC_ROOTS.has(seg[0]);
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

describe('flagship SEO posts', () => {
    it('ships six posts', () => {
        expect(seoPosts).toHaveLength(6);
    });

    it('slugs are unique and do not collide with existing posts', () => {
        const slugs = seoPosts.map((p) => p.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
        const existing = new Set(blogPosts.map((p) => p.slug));
        expect(slugs.filter((s) => existing.has(s))).toEqual([]);
    });

    for (const p of seoPosts) {
        describe(p.slug, () => {
            it('opens with a 30-70 word direct answer', () => {
                const first = p.content[0];
                expect(first.type).toBe('p');
                expect(words(blockText(first))).toBeGreaterThanOrEqual(30);
                expect(words(blockText(first))).toBeLessThanOrEqual(70);
            });
            it('has a valid ISO publishedAt and updatedAt', () => {
                for (const d of [p.publishedAt, p.updatedAt]) {
                    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
                    expect(Number.isNaN(Date.parse(d))).toBe(false);
                }
            });
            it('has at least 3 FAQ entries (4 is the target)', () => {
                expect((p.faqSchema ?? []).length).toBeGreaterThanOrEqual(3);
            });
            it('has at least 2 internal links that resolve', () => {
                const links = linkPaths(allText(p));
                expect(links.length).toBeGreaterThanOrEqual(2);
                expect(links.filter((l) => !pathExists(l))).toEqual([]);
            });
            it('is long enough to be useful', () => {
                expect(words(allText(p))).toBeGreaterThanOrEqual(800);
            });
            it('carries a last-verified line', () => {
                expect(allText(p)).toMatch(/last verified/i);
            });
            it('contains no banned claims', () => {
                expect(allText(p).match(BANNED)).toBeNull();
            });
        });
    }
});

describe('city pages', () => {
    const pages = CITY_PAGES.map((c) => ({ c, data: buildCityPage(c) }));

    it('covers at least the thirteen original cities with unique slugs', () => {
        expect(CITY_PAGES.length).toBeGreaterThanOrEqual(13);
        expect(new Set(CITY_PAGES.map((c) => c.slug)).size).toBe(CITY_PAGES.length);
    });

    it('each city has its own intro answer of 40-60 words, all distinct', () => {
        const intros = CITY_PAGES.map((c) => c.intro);
        for (const i of intros) {
            expect(words(i)).toBeGreaterThanOrEqual(40);
            expect(words(i)).toBeLessThanOrEqual(60);
        }
        expect(new Set(intros).size).toBe(intros.length);
    });

    it('each page has at least 5 FAQs and no answer repeats across cities', () => {
        const seen = new Map<string, string>();
        for (const { c, data } of pages) {
            expect(data.faqs.length).toBeGreaterThanOrEqual(5);
            expect(data.faqs.length).toBeLessThanOrEqual(6);
            for (const f of data.faqs) {
                const prior = seen.get(f.a);
                expect(prior, `${c.slug} repeats an answer from ${prior}`).toBeUndefined();
                seen.set(f.a, c.slug);
            }
        }
    });

    it('per-city scenario, business and language text is distinct', () => {
        for (const key of ['scenario', 'businesses', 'languageNote', 'localTruth'] as const) {
            const vals = CITY_PAGES.map((c) => c[key]);
            expect(new Set(vals).size, key).toBe(vals.length);
        }
    });

    it('keeps the Tamil city name in the page', () => {
        for (const { c, data } of pages) {
            expect(JSON.stringify(data)).toContain(c.tamil);
        }
    });

    it('links to the guide, pricing and demo', () => {
        for (const { c, data } of pages) {
            const text = JSON.stringify(data);
            for (const href of ['/guide/digital-menu-setup', '/pricing', '/demo']) {
                expect(text, `${c.slug} missing ${href}`).toContain(href);
            }
        }
    });

    it('contains no banned claims', () => {
        for (const { c, data } of pages) {
            expect(JSON.stringify(data).match(BANNED), c.slug).toBeNull();
        }
    });

    it('every internal link resolves', () => {
        for (const { c, data } of pages) {
            const hrefs = (data.relatedLinks ?? []).map((l) => l.href);
            hrefs.push(...linkPaths(JSON.stringify(data)));
            expect(hrefs.filter((h) => !pathExists(h)), c.slug).toEqual([]);
        }
    });
});
