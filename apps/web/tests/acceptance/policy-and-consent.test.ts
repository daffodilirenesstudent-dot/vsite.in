import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Acceptance criteria for the policy pass.
 *
 * The billing model is unusual and every public claim has to match it:
 * vsite sells ONE 30-day prepaid period at a time through the Razorpay Orders
 * API. There is no card mandate, no autopay, and therefore no recurring charge
 * to cancel. When `store_expires_at` passes, the public menu goes dark and the
 * owner is asked to pay again.
 *
 * Three defects this pass fixes:
 *
 *   1. `/terms` promised "cancel your subscription at any time from the
 *      Settings page". No such control exists, and none is needed — not
 *      renewing IS the cancellation. The copy invented a button.
 *   2. `/pricing` and the footer sold "Cancel anytime from your dashboard",
 *      the same invented button in the two places a buyer actually reads.
 *   3. `/privacy` named Stripe as a payment processor. Razorpay is the only
 *      one wired up; naming a processor that never sees your data is a
 *      privacy policy that is wrong in the direction that matters.
 *
 * Plus: signup collected no agreement to either document, and both pages were
 * left on the pre-redesign slate ramp when the other marketing pages moved to
 * the ink/paper system.
 */

const WEB = join(__dirname, '..', '..');
const APP = join(WEB, 'src', 'app');

const read = (p: string) => readFileSync(join(APP, p), 'utf8');

/**
 * Source with block comments stripped — same reasoning as
 * marketing-pages.test.ts: these files carry comments naming the claim that
 * was removed, and matching raw source would fail on the note documenting the
 * fix rather than on the fix itself.
 */
const readShipped = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '');

const POLICY_PAGES = {
    terms: 'terms/page.tsx',
    privacy: 'privacy/page.tsx',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 1. The policy pages state the real billing model
// ─────────────────────────────────────────────────────────────────────────────

describe('terms states the actual billing model', () => {
    const terms = () => readShipped(POLICY_PAGES.terms);

    it('does not promise a cancel control that does not exist', () => {
        // There is no cancel button anywhere in /manage. Searched: settings,
        // subscription, transactions — the only "Cancel" buttons close modals.
        expect(terms()).not.toMatch(/cancel your subscription at any time/i);
        expect(terms()).not.toMatch(/cancel[^.]{0,40}from the Settings page/i);
    });

    it('explains that not renewing is how you stop', () => {
        expect(terms()).toMatch(/no automatic charge|not.{0,20}charged automatically/i);
        expect(terms()).toMatch(/stop paying|simply do not renew|do not renew/i);
    });

    it('states the no-refund policy plainly', () => {
        expect(terms()).toMatch(/non-refundable|no refunds/i);
    });

    it('states the 30-day prepaid period and what expiry does', () => {
        expect(terms()).toMatch(/30 days/);
        expect(terms(), 'terms must say the menu goes offline at expiry')
            .toMatch(/offline|stops being visible|no longer visible/i);
    });
});

describe('privacy names only the processors actually wired up', () => {
    it('does not name Stripe', () => {
        // Razorpay is the only payment processor in the codebase.
        expect(readShipped(POLICY_PAGES.privacy)).not.toMatch(/Stripe/i);
    });

    it('still names Razorpay', () => {
        expect(readShipped(POLICY_PAGES.privacy)).toMatch(/Razorpay/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. No page sells the button that isn't there
// ─────────────────────────────────────────────────────────────────────────────

describe('no surface advertises "cancel from your dashboard"', () => {
    const SURFACES: Array<[string, string]> = [
        ['pricing', join(APP, 'pricing', 'page.tsx')],
        ['footer', join(WEB, 'src', 'components', 'home', 'FooterCTA.tsx')],
    ];

    it.each(SURFACES)('%s does not promise dashboard cancellation', (_name, path) => {
        const src = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        expect(src).not.toMatch(/Cancel (?:anytime )?from your dashboard/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Signup takes agreement before it takes an account
// ─────────────────────────────────────────────────────────────────────────────

describe('signup consent', () => {
    const signup = () => read('signup/page.tsx');

    it('links to both policy documents', () => {
        expect(signup()).toMatch(/href="\/terms"/);
        expect(signup()).toMatch(/href="\/privacy"/);
    });

    it('renders a real checkbox, not just a passive line of small print', () => {
        expect(signup()).toMatch(/type="checkbox"/);
    });

    it('blocks the OTP send until the box is ticked', () => {
        const src = signup();
        // The guard has to be in the submit handler, not only a disabled prop —
        // the form also submits on Enter from both inputs.
        expect(src).toMatch(/agreed/);
        expect(src, 'handleSendOTP must refuse when consent is missing')
            .toMatch(/if \(!agreed\)/);
    });

    it('disables the submit button until the box is ticked', () => {
        expect(signup()).toMatch(/disabled=\{[^}]*!agreed[^}]*\}/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. The policy pages use the same design system as the rest of the site
// ─────────────────────────────────────────────────────────────────────────────

describe('policy pages use the homepage design system', () => {
    it.each(Object.entries(POLICY_PAGES))('%s uses lucide icons, not Material Symbols', (_name, file) => {
        expect(read(file)).not.toMatch(/material-symbols-outlined/);
    });

    it.each(Object.entries(POLICY_PAGES))('%s uses the warm ink/paper ramp, not slate', (_name, file) => {
        const src = read(file);
        const slate = src.match(/\b(?:text|bg|border|from|via|to)-slate-\d{2,3}/g) ?? [];
        expect(slate, `still on the cold slate ramp: ${slate.join(', ')}`).toHaveLength(0);
    });

    it.each(Object.entries(POLICY_PAGES))('%s clears the fixed navbar', (_name, file) => {
        // The bar is 4.5rem tall and fixed. A hero starting at pt-16 (4rem)
        // tucks its heading underneath it — which both pages did.
        const src = read(file);
        const firstSection = src.slice(src.indexOf('<Navbar />'));
        expect(firstSection).toMatch(/pt-(?:28|32|36|40)\b/);
    });

    it.each(Object.entries(POLICY_PAGES))('%s uses the shared section rhythm', (_name, file) => {
        expect(read(file)).toMatch(/py-section/);
    });

    it.each(Object.entries(POLICY_PAGES))('%s states when it was last reviewed', (_name, file) => {
        // A legal page with a stale date is worse than one with no date.
        expect(read(file)).toMatch(/POLICY_LAST_UPDATED/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. One source of truth for the billing sentence
// ─────────────────────────────────────────────────────────────────────────────

describe('billing policy strings are centralised', () => {
    const POLICY = join(WEB, 'src', 'content', 'policy.ts');

    it('exports the canonical strings', () => {
        const src = readFileSync(POLICY, 'utf8');
        for (const name of [
            'POLICY_LAST_UPDATED',
            'BILLING_CYCLE_DAYS',
            'NO_REFUND_POLICY',
            'HOW_TO_STOP',
        ]) {
            expect(src, `policy.ts must export ${name}`).toMatch(new RegExp(`export const ${name}`));
        }
    });

    it('is what the policy pages and the pricing page read from', () => {
        expect(read(POLICY_PAGES.terms)).toMatch(/@\/content\/policy/);
        expect(read('pricing/page.tsx')).toMatch(/@\/content\/policy/);
    });
});
