import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Acceptance criteria for the marketing pages pass.
 *
 * Two reported defects and one systemic one:
 *
 *   1. The nav rendered white-on-light on every page except the homepage,
 *      because its light-on-dark treatment was unconditional while only the
 *      homepage has a dark hero. Fixed with an explicit `overDark` opt-in.
 *   2. The pricing page carried a "Ready to Go Digital?" CTA band directly
 *      above FooterCTA, which is itself a full closing CTA.
 *   3. The five inner pages were built on a different visual system than the
 *      homepage (slate ramp, Material Symbols, violet gradient heroes), which
 *      is what made them read as templated.
 *
 * Plus the content mismatches: the features page advertised the ordering and
 * payment products that `productFlags.ORDERING_FROZEN` makes unbuyable.
 */

const WEB = join(__dirname, '..', '..');
const APP = join(WEB, 'src', 'app');

const read = (p: string) => readFileSync(join(APP, p), 'utf8');

/**
 * Source with block comments stripped.
 *
 * The content assertions below are about what the page *ships*. Several of
 * these files carry a comment explaining which claim was removed and why —
 * naming the removed string — so matching raw source would fail on the note
 * documenting the fix rather than on the fix itself.
 */
const readShipped = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '');

/** The five pages the owner asked for, plus the shared nav. */
const PAGES = {
    features: 'features/page.tsx',
    pricing: 'pricing/page.tsx',
    demo: 'demo/page.tsx',
    blog: 'blog/page.tsx',
    support: 'support/page.tsx',
} as const;

const NAVBAR = join(WEB, 'src', 'components', 'home', 'Navbar.tsx');

describe('navbar visibility on light pages', () => {
    const navbar = readFileSync(NAVBAR, 'utf8');

    it('only uses its light-on-dark treatment when a page opts in', () => {
        // `onDark` must be gated on a prop, not just scroll position.
        expect(navbar).toMatch(/overDark/);
        expect(navbar).toMatch(/const onDark = overDark && !scrolled && !open/);
    });

    it('is opted in by the homepage, which is the only dark hero', () => {
        const home = readFileSync(join(APP, 'page.tsx'), 'utf8');
        expect(home).toMatch(/<Navbar overDark \/>/);
    });

    it.each(Object.entries(PAGES))('%s does not opt into the dark treatment', (_name, file) => {
        expect(read(file)).toMatch(/<Navbar \/>/);
    });
});

describe('pricing page', () => {
    const pricing = read(PAGES.pricing);

    it('no longer carries the "Ready to Go Digital?" band', () => {
        expect(pricing).not.toMatch(/Ready to Go Digital/i);
    });

    it('still closes with the shared FooterCTA', () => {
        expect(pricing).toMatch(/<FooterCTA \/>/);
    });
});

describe('content matches what is actually sellable', () => {
    it('features does not advertise the frozen ordering products', () => {
        const features = readShipped(PAGES.features);
        for (const claim of [
            'Table Ordering',
            'Live Kitchen Dashboard',
            'Order Status Flow',
            'Orders & Payments',
        ]) {
            expect(features, `features page still advertises "${claim}"`).not.toContain(claim);
        }
    });

    it('states one support SLA across every page that quotes one', () => {
        // Demo said "within 2 hours on business days", support said "within 30
        // minutes during business hours", features said "within 2 hours" — one
        // promise, two numbers. They must now agree.
        for (const page of [PAGES.features, PAGES.demo, PAGES.support]) {
            expect(readShipped(page), `${page} quotes a different SLA`).toMatch(/within 2 hours/);
        }
        for (const page of Object.values(PAGES)) {
            expect(readShipped(page)).not.toMatch(/within 30 minutes/);
        }
    });

    it('demo does not list the same capability twice', () => {
        // "Real-time menu updates" and "Live menu updates" were two entries
        // describing one thing, back to back.
        expect(readShipped(PAGES.demo)).not.toMatch(/Live menu updates/);
    });

    it('features does not repeat "Zero Commission" in two groups', () => {
        const hits = readShipped(PAGES.features).match(/title: 'Zero [Cc]ommission/g) ?? [];
        expect(hits.length).toBeLessThanOrEqual(1);
    });

    it('support labels its FAQ group to match its own answers', () => {
        // Every answer in the group says vsite does not handle ordering or
        // payments; the label said "Orders & Payments".
        const faqData = readShipped('support/faqData.ts');
        expect(faqData).not.toMatch(/label: 'Orders & Payments'/);
    });
});

describe('the inner pages use the homepage design system', () => {
    it.each(Object.entries(PAGES))('%s uses lucide icons, not Material Symbols', (_name, file) => {
        expect(read(file)).not.toMatch(/material-symbols-outlined/);
    });

    it.each(Object.entries(PAGES))('%s uses the warm ink/paper ramp, not slate', (_name, file) => {
        const src = read(file);
        const slate = src.match(/\b(?:text|bg|border|from|via|to)-slate-\d{2,3}/g) ?? [];
        expect(slate, `still on the cold slate ramp: ${slate.join(', ')}`).toHaveLength(0);
    });

    it.each(Object.entries(PAGES))('%s drops the generic violet gradient hero', (_name, file) => {
        expect(read(file)).not.toMatch(/from-violet-50/);
    });

    it.each(Object.entries(PAGES))('%s clears the fixed navbar', (_name, file) => {
        // The bar is 4.5rem tall and fixed. A hero starting at pt-16 (4rem)
        // tucks its eyebrow underneath it.
        const src = read(file);
        const firstSection = src.slice(src.indexOf('<Navbar />'));
        expect(firstSection).toMatch(/pt-(?:28|32|36|40)\b/);
    });

    it.each(Object.entries(PAGES))('%s uses the shared section rhythm', (_name, file) => {
        expect(read(file)).toMatch(/py-section/);
    });
});
