import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    GUIDE,
    GUIDE_PAGES,
    GUIDE_UPDATED,
    HUB_PATH,
    CORE_STEP_MINUTES,
    TYPICAL_TOTAL_MINUTES,
    guideSchema,
    wordCount,
} from '@/content/guide';
import { PRICE_INR_PER_MONTH, TRIAL_DAYS } from '@/content/facts';

/**
 * The setup guide is what ChatGPT, Perplexity and voice assistants quote when
 * someone asks "how do I set up a digital menu, how long does it take, what
 * does it cost". It has to be correct, consistent and extractable.
 */

const WEB = join(__dirname, '..', '..');
const APP = join(WEB, 'src', 'app');
const CONTENT = join(WEB, 'src', 'content', 'guide');
const read = (p: string) => readFileSync(join(WEB, p), 'utf8');

const SLUGS = [
    'digital-menu-setup',
    'sign-up',
    'add-menu',
    'menu-design',
    'banners',
    'configuration',
    'qr-code',
    'cost-and-time',
] as const;

describe('routes', () => {
    it('serves the hub at exactly /guide/digital-menu-setup', () => {
        expect(HUB_PATH).toBe('/guide/digital-menu-setup');
        expect(existsSync(join(APP, 'guide', 'digital-menu-setup', 'page.tsx'))).toBe(true);
    });

    it('serves every other guide page through a static [slug] route', () => {
        const src = read('src/app/guide/[slug]/page.tsx');
        expect(src).toMatch(/generateStaticParams/);
    });

    it('has all eight pages, with GUIDE_PAGES listing each for the sitemap', () => {
        expect(GUIDE_PAGES.map((p) => p.path).sort()).toEqual(SLUGS.map((s) => `/guide/${s}`).sort());
        for (const p of GUIDE_PAGES) {
            expect(p.title.length).toBeGreaterThan(5);
            expect(p.description.length).toBeGreaterThan(20);
            expect(p.updated).toBe(GUIDE_UPDATED);
        }
        expect(GUIDE_UPDATED).toBe('2026-09-30');
    });
});

describe.each(SLUGS)('page %s', (slug) => {
    const page = GUIDE[slug];

    it('opens with a 40-60 word direct answer', () => {
        const n = wordCount(page.en.answer);
        expect(n).toBeGreaterThanOrEqual(40);
        expect(n).toBeLessThanOrEqual(60);
    });

    it('asks its H1 as a question and lists what you need and the steps with a time each', () => {
        expect(page.en.h1.endsWith('?')).toBe(true);
        expect(page.en.needs.length).toBeGreaterThan(0);
        expect(page.en.steps.length).toBeGreaterThanOrEqual(3);
        for (const s of page.en.steps) {
            expect(s.name.length).toBeGreaterThan(2);
            expect(s.text.length).toBeGreaterThan(10);
            expect(s.time.length).toBeGreaterThan(0);
        }
    });

    it('has 3-6 FAQ questions', () => {
        expect(page.en.faqs.length).toBeGreaterThanOrEqual(3);
        expect(page.en.faqs.length).toBeLessThanOrEqual(6);
    });

    it('emits HowTo, FAQPage and BreadcrumbList JSON-LD that parse and state price and trial', () => {
        const graph = guideSchema(slug, 'en');
        const parsed = JSON.parse(JSON.stringify(graph)) as Record<string, unknown>[];
        const types = parsed.map((n) => n['@type']);
        expect(types).toEqual(expect.arrayContaining(['HowTo', 'FAQPage', 'BreadcrumbList']));
        const howTo = parsed.find((n) => n['@type'] === 'HowTo') as Record<string, unknown>;
        expect(howTo.totalTime).toMatch(/^PT\d+M$/);
        const cost = howTo.estimatedCost as { currency: string; value: string };
        expect(cost.currency).toBe('INR');
        expect(cost.value).toBe(String(PRICE_INR_PER_MONTH));
        expect(String(howTo.description)).toContain(`${TRIAL_DAYS}-day free trial`);
        expect((howTo.step as unknown[]).length).toBe(page.en.steps.length);
        const json = JSON.stringify(parsed);
        expect(json).toContain('"@id":"https://vsite.in/#org"');
        expect(json).not.toMatch(/aggregateRating|screenshot|"image"/);
    });

    it('links onward to pricing', () => {
        expect(JSON.stringify(page.en.links)).toContain('/pricing');
    });
});

describe('the guide renders structurally', () => {
    const article = read('src/components/guide/GuideArticle.tsx');

    it('puts the direct answer before the steps, in an ordered list', () => {
        expect(article.indexOf('copy.answer')).toBeLessThan(article.indexOf('copy.steps'));
        expect(article).toMatch(/<ol/);
        expect(article).toMatch(/Updated:/);
        expect(article).toMatch(/<Navbar \/>/);
        expect(article).toMatch(/<FooterCTA \/>/);
        expect(article).toMatch(/pt-(28|32)/);
        expect(article).toMatch(/py-section/);
        expect(article).not.toMatch(/slate-|material-symbols/);
    });

    it('keeps FAQ answers in the DOM', () => {
        expect(article).toMatch(/<details/);
    });
});

describe('Tamil', () => {
    const TA_PAGES = ['digital-menu-setup', 'cost-and-time'] as const;

    it('has a Tamil copy for the hub and the cost page, from the same data file', () => {
        for (const slug of TA_PAGES) {
            const ta = GUIDE[slug].ta;
            expect(ta).toBeDefined();
            expect(ta!.steps.length).toBe(GUIDE[slug].en.steps.length);
            expect(ta!.faqs.length).toBeGreaterThanOrEqual(3);
            expect(/[஀-௿]/.test(ta!.answer)).toBe(true);
            // Same price and trial length as English: interpolated, not retyped.
            expect(ta!.answer).toContain(String(PRICE_INR_PER_MONTH));
            expect(ta!.answer).toContain(String(TRIAL_DAYS));
        }
    });

    it.each(TA_PAGES)('ta/%s declares lang and hreflang both ways', (slug) => {
        const src = read(`src/app/ta/guide/${slug}/page.tsx`);
        expect(src).toMatch(/languages/);
        expect(src).toMatch(/x-default/);
        const enPath =
            slug === 'digital-menu-setup'
                ? 'src/app/guide/digital-menu-setup/page.tsx'
                : 'src/app/guide/[slug]/page.tsx';
        const enSrc = read(enPath);
        expect(enSrc).toMatch(/x-default/);
        expect(enSrc).toMatch(/languages/);
        expect(JSON.stringify(guideSchema(slug, 'ta'))).toContain('"inLanguage":"ta"');
    });

    it('loads Tamil fonts only in the /ta layout, under a lang="ta" wrapper', () => {
        const layout = read('src/app/ta/layout.tsx');
        expect(layout).toMatch(/Noto_Sans_Tamil/);
        expect(layout).toMatch(/lang="ta"/);
        // One undefined var() voids a whole font-family: only name variables this file defines.
        const vars = [...layout.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]);
        for (const v of vars) expect(layout).toContain(`variable: '${v}'`);
        expect(read('src/app/layout.tsx')).not.toMatch(/Noto_Sans_Tamil|Anek_Tamil|Mukta_Malar/);
    });
});

describe('facts come from code, not from typed copies', () => {
    const files = readdirSync(CONTENT).filter((f) => f.endsWith('.ts'));
    const text = files.map((f) => readFileSync(join(CONTENT, f), 'utf8')).join('\n');
    const body = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    it('never types the price, the sticker price or the trial length', () => {
        expect(body).not.toMatch(/\b299\b/);
        expect(body).not.toMatch(/\b7[- ]day/i);
        expect(body).not.toMatch(/₹\s?30\b/);
    });

    it('imports them from facts.ts', () => {
        expect(body).toContain("from '@/content/facts'");
    });

    it('makes none of the banned claims', () => {
        expect(body).not.toMatch(/fastest[- ]growing|most affordable|aggregateRating/i);
        expect(body).not.toMatch(/ai[- ]generated|generates? (a |the |your )?(food )?(photo|image)|regenerat/i);
        expect(body).not.toMatch(/\b3[- ]minutes?\b/i);
    });

    it('states ordering only as coming soon, via roadmap.ts', () => {
        expect(body).toContain('ORDERING_COMING_SOON_SHORT');
    });
});

describe('time figures', () => {
    it('gives a total that covers the sum of the step estimates', () => {
        const lo = CORE_STEP_MINUTES.reduce((a, s) => a + s.min, 0);
        const hi = CORE_STEP_MINUTES.reduce((a, s) => a + s.max, 0);
        expect(TYPICAL_TOTAL_MINUTES.min).toBeGreaterThanOrEqual(lo);
        expect(TYPICAL_TOTAL_MINUTES.max).toBeGreaterThanOrEqual(hi);
    });
});
