import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Moving between the menu-engineering questions.
 *
 * Each question is a scrollable grid of the owner's own dishes. A real menu is
 * 40+ items, so answering question 1 means scrolling to the bottom to reach
 * Continue. Three defects follow from that one fact:
 *
 *   1. THE NEXT QUESTION OPENED HALFWAY DOWN. `transition()` swapped the step
 *      and never touched the scroll position, so the browser kept the offset
 *      from the question just answered. Question 2 appeared to start at item
 *      20 with its heading and instructions off-screen — the owner sees a wall
 *      of dishes and no question.
 *
 *   2. BACK WAS OFF-SCREEN AT THE MOMENT IT WAS NEEDED. A Back button exists in
 *      the header, but the header does not stick. At the bottom of a long
 *      grid — exactly where Continue is, and exactly where an owner realises
 *      they mis-tapped — it has scrolled out of view. It reads as missing.
 *      So every phase carries its own Back next to its own Continue.
 *
 *   3. THE PUBLISH SCREEN NEVER MENTIONED THE PHOTOS. Generating a food image
 *      per dish is the slowest part of the launch and the part the owner is
 *      paying for. A loader that says "Almost ready…" through it undersells
 *      the wait and makes it feel like a hang.
 *
 * Scroll reset is asserted on the PAGE rather than each phase because the
 * scrolling element is the window, not the grid: a phase that reset its own
 * container would fix nothing.
 */

const WEB = join(__dirname, '..', '..');
const SRC = join(WEB, 'src');

const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const shipped = (p: string) =>
    read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const PAGE = 'app/onboarding/page.tsx';
const LOADER = 'app/onboarding/components/LaunchLoadingScreen.tsx';

/** The three question phases. Summary is the review step, not a question. */
const QUESTION_PHASES = {
    bestsellers: 'app/onboarding/components/BestsellersPhase.tsx',
    profitable: 'app/onboarding/components/ProfitablePhase.tsx',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Every question starts at its own heading
// ─────────────────────────────────────────────────────────────────────────────

describe('step transitions', () => {
    it('returns the page to the top when the step changes', () => {
        const src = shipped(PAGE);
        expect(
            src,
            'transition() swaps the step but leaves the scroll offset from the previous question',
        ).toMatch(/scrollTo\(/);
    });

    it('resets the scroll inside the transition, not after it', () => {
        // The swap happens inside a 280ms timeout while the card is faded out.
        // Resetting anywhere else makes the jump visible.
        const src = shipped(PAGE);
        const start = src.indexOf('const transition');
        expect(start, 'transition() not found').toBeGreaterThan(-1);
        const body = src.slice(start, src.indexOf('};', start));
        expect(body).toMatch(/scrollTo\(/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Back is reachable from where the thumb already is
// ─────────────────────────────────────────────────────────────────────────────

describe.each(Object.entries(QUESTION_PHASES))('%s phase', (_name, file) => {
    const src = () => shipped(file);

    it('takes an onBack callback', () => {
        expect(src()).toMatch(/onBack/);
    });

    it('renders Back in the same row as Continue', () => {
        // Not merely present somewhere in the file — in the footer, beside the
        // primary action, which is the only part of a long page guaranteed to
        // be on screen when the owner is deciding.
        const footer = src().slice(src().lastIndexOf('Continue') - 900);
        expect(footer).toMatch(/Back/);
        expect(footer).toMatch(/Continue/);
    });

    it('offers no Skip', () => {
        // Continue with nothing selected already produces the same menu Skip
        // did, so Skip was a second button for one outcome — and on the
        // highest-abandonment screen in the product, a button labelled Skip
        // invites abandoning the step that makes the menu worth reading.
        expect(src()).not.toMatch(/Skip/);
    });
});

describe('the onboarding page', () => {
    it('wires onBack on both question phases', () => {
        const src = shipped(PAGE);
        expect(src).toMatch(/<BestsellersPhase[\s\S]{0,220}onBack=/);
        expect(src).toMatch(/<ProfitablePhase[\s\S]{0,220}onBack=/);
    });

    it('keeps the header Back as well', () => {
        // The footer Back is an addition, not a replacement — the header one
        // is what a desktop owner reaches for.
        expect(shipped(PAGE)).toMatch(/goBack\(prev\[step\]\)/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. The publish loader says what is actually taking the time
// ─────────────────────────────────────────────────────────────────────────────

describe('the launch loading screen', () => {
    const src = () => shipped(LOADER);

    it('tells the owner their dishes are being given photos', () => {
        // The words matter: this is the AI food photography the owner is
        // paying for, and the loader is the only place the product ever shows
        // it happening.
        expect(src()).toMatch(/[Aa]dding images/);
    });

    it('says it before claiming the menu is nearly built', () => {
        // Ordering is the message: photos come while the menu is still being
        // assembled, not after "Almost ready…".
        const s = src();
        expect(s.indexOf('Adding images')).toBeLessThan(s.indexOf('Almost ready'));
    });

    it('still steps through every message before it can finish', () => {
        // LAST_IDX gates the success reveal. A message added without that
        // gate still holding would let the screen skip ahead of its own copy.
        expect(src()).toMatch(/LAST_IDX\s*=\s*MESSAGES\.length\s*-\s*1/);
    });
});
