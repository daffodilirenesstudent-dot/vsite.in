import { describe, it, expect } from 'vitest';
import { decideOnboardingGate } from '@/lib/auth/onboardingGate';

/**
 * Who gets sent to onboarding.
 *
 * The reported bug: an owner with several live stores signed in and was pushed
 * into onboarding as a brand-new user, with no way out except creating yet
 * another store. Root cause: `ManageLayoutClient` gated the dashboard on
 * `profiles.onboarding_completed` alone and never asked whether the account
 * already owned any sites.
 *
 * Two independent ways that flag lies about an existing user:
 *
 *   1. The profiles row is MISSING. Provisioning used to be gated on Firebase's
 *      `isNewUser`, so accounts whose first sign-in failed after the Firebase
 *      account was created never got a row — while still going on to create
 *      stores, which do not require one. Production currently has 2 such
 *      owners. The heal path then INSERTS `onboarding_completed: false`,
 *      which is what pins them inside onboarding.
 *   2. The row EXISTS but the SELECT returns nothing, because `profiles` RLS is
 *      select-own against the Firebase uid and the token was briefly wrong.
 *      Indistinguishable from case 1 at the call site.
 *
 * So the flag cannot be the source of truth. Owning a site is what makes
 * someone an existing user, and it is the thing the old gate never checked.
 */

describe('an account that owns sites is never treated as new', () => {
    it('lets them in when the profile row is missing entirely', () => {
        // The exact production shape: sites exist, no profiles row.
        const d = decideOnboardingGate({ profile: null, profileError: false, siteCount: 4 });
        expect(d.action).toBe('allow');
    });

    it('lets them in when the flag says not-onboarded', () => {
        const d = decideOnboardingGate({
            profile: { onboarding_completed: false },
            profileError: false,
            siteCount: 4,
        });
        expect(d.action).toBe('allow');
    });

    it('repairs the flag rather than leaving them to hit this again tomorrow', () => {
        const missing = decideOnboardingGate({ profile: null, profileError: false, siteCount: 4 });
        const stale = decideOnboardingGate({
            profile: { onboarding_completed: false },
            profileError: false,
            siteCount: 1,
        });
        expect(missing.repair).toBe(true);
        expect(stale.repair).toBe(true);
    });

    it('does not rewrite a profile that is already correct', () => {
        const d = decideOnboardingGate({
            profile: { onboarding_completed: true },
            profileError: false,
            siteCount: 4,
        });
        expect(d.action).toBe('allow');
        expect(d.repair).toBe(false);
    });
});

describe('a genuinely new account still goes to onboarding', () => {
    it('no sites and no profile', () => {
        expect(decideOnboardingGate({ profile: null, profileError: false, siteCount: 0 }).action)
            .toBe('onboard');
    });

    it('no sites, profile not yet completed', () => {
        expect(
            decideOnboardingGate({
                profile: { onboarding_completed: false },
                profileError: false,
                siteCount: 0,
            }).action,
        ).toBe('onboard');
    });

    it('completed onboarding but deleted every store', () => {
        // Pre-existing behaviour worth keeping: there is nothing to show them.
        expect(
            decideOnboardingGate({
                profile: { onboarding_completed: true },
                profileError: false,
                siteCount: 0,
            }).action,
        ).toBe('onboard');
    });
});

describe('a transient Supabase failure never locks anyone out', () => {
    it('fails open, as the old gate did', () => {
        const d = decideOnboardingGate({ profile: null, profileError: true, siteCount: 0 });
        expect(d.action).toBe('allow');
        expect(d.repair, 'must not write on an errored read').toBe(false);
    });
});
