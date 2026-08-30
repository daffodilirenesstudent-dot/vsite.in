import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Acceptance tests for the homepage redesign (GOAL.md).
 *
 * These are STATIC SOURCE assertions rather than rendered-DOM ones, matching
 * the convention already set by tests/acceptance/freeze-ordering.test.ts.
 * Vitest only picks up `tests/**\/*.test.ts`, so this file must stay `.test.ts`
 * — the Playwright half of the acceptance criteria lives in
 * tests/e2e/homepage-redesign.spec.ts. See PLAN.md.
 *
 * The rules encoded here are the ones that are expensive to catch by eye and
 * that regress silently: claims for frozen products, invented social proof,
 * contrast-failing tokens, and motion that ignores the user's OS setting.
 */

const ROOT = join(__dirname, '..', '..');
const PAGE = join(ROOT, 'src', 'app', 'page.tsx');
const HOME_DIR = join(ROOT, 'src', 'components', 'home');

const read = (p: string) => readFileSync(p, 'utf8');

/** The section components page.tsx actually renders — read from the imports so
 *  this stays honest when sections are added, renamed or deleted. */
function homepageSectionFiles(): string[] {
    const src = read(PAGE);
    // `matchAll` needs downlevelIteration under this tsconfig target — exec loop instead.
    const re = /from '@\/components\/home\/(\w+)'/g;
    const names: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) names.push(m[1]);
    expect(names.length).toBeGreaterThan(0);
    return names.map((n) => join(HOME_DIR, `${n}.tsx`));
}

function homepageSource(): string {
    return homepageSectionFiles()
        .filter((f) => existsSync(f))
        .map(read)
        .join('\n');
}

describe('homepage sells only what is actually sellable', () => {
    // vsite ships ONE product while ORDERING_FROZEN is true: the Smart QR Menu.
    // Copy promising ordering, payment or kitchen dispatch is a refund driver,
    // not a marketing choice.
    const FROZEN_CLAIMS: [RegExp, string][] = [
        [/place (an? )?order/i, 'in-menu ordering'],
        [/\border directly\b/i, 'in-menu ordering'],
        [/live orders?\b/i, 'live order feed'],
        [/\bUPI\b/, 'in-menu payment'],
        [/\bGPay\b/i, 'in-menu payment'],
        [/PhonePe/i, 'in-menu payment'],
        [/pay securely/i, 'in-menu payment'],
        [/automatic billing/i, 'billing'],
        [/in kitchen\b/i, 'kitchen dispatch'],
        [/table turnover/i, 'ordering-derived claim'],
    ];

    it.each(FROZEN_CLAIMS)('makes no %s claim (%s)', (pattern) => {
        expect(homepageSource()).not.toMatch(pattern as RegExp);
    });

    it('states plainly that ordering is not included yet', () => {
        expect(homepageSource()).toMatch(/does not do yet|not take orders|no ordering yet/i);
    });
});

describe('homepage social proof is not fabricated', () => {
    it('ships no placeholder-testimonial disclaimer', () => {
        expect(homepageSource()).not.toMatch(/to be replaced with real customer/i);
    });

    it('emits no aggregateRating in structured data', () => {
        // A ratingValue/reviewCount with no real reviews behind it is a Google
        // structured-data policy violation, not just a trust problem.
        expect(read(PAGE)).not.toMatch(/aggregateRating/);
    });

    it('sources every public count from one auditable constant', () => {
        // The counts are owner-confirmed (see PROGRESS.md), so they are no
        // longer placeholders — but they must stay in ONE place. A number
        // typed straight into markup is a number that silently goes stale and
        // starts contradicting the section above it.
        const proof = read(join(HOME_DIR, 'Proof.tsx'));
        expect(proof).toMatch(/export const PROOF_STATS/);

        for (const f of ['TrustBar.tsx', 'FooterCTA.tsx']) {
            const src = read(join(HOME_DIR, f));
            if (/menus/i.test(src)) {
                expect(src, `${f} must read counts from PROOF_STATS`).toMatch(/PROOF_STATS/);
                expect(src, `${f} must not hardcode a menu count`).not.toMatch(/[\d,]+\+?\s*menus/i);
            }
        }
    });
});

describe('homepage meets the contrast and icon budget', () => {
    it('uses no Material Symbols ligature icons', () => {
        // ~60 network-loaded ligatures, render-blocking, and the source of the
        // 1.67:1 non-text contrast failures. lucide-react is already a dep.
        expect(homepageSource()).not.toMatch(/material-symbols-outlined/);
    });

    it('uses no slate-400 as a text colour', () => {
        // #94A3B8 on white is 2.56:1 — fails AA for both normal and large text.
        expect(homepageSource()).not.toMatch(/text-slate-400/);
    });

    it('exposes the AA-checked warm neutral tokens', () => {
        const tw = read(join(ROOT, 'tailwind.config.ts'));
        for (const token of ['ink', 'ink-70', 'ink-45', 'paper', 'paper-2', 'night', 'line']) {
            expect(tw).toMatch(new RegExp(`["']${token}["']\\s*:`));
        }
    });
});

describe('homepage motion respects the OS setting', () => {
    it('globals.css disables motion under prefers-reduced-motion', () => {
        const css = read(join(ROOT, 'src', 'app', 'globals.css'));
        expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    });

    it('useInView reports visible immediately when motion is reduced', () => {
        const hook = read(join(ROOT, 'src', 'hooks', 'useInView.ts'));
        expect(hook).toMatch(/prefers-reduced-motion/);
    });
});
