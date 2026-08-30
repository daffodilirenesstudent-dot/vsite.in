import { describe, it, expect } from 'vitest';
import { resolvePostAuthDestination, safeInternalPath } from '@/lib/auth/postAuthDestination';

/**
 * Where a session goes after OTP.
 *
 * One decision, made on the server, for both /login and /signup. Previously
 * each page branched on Firebase's `isNewUser` — which answers "was this
 * Firebase account created just now?", not "does this person have stores?".
 * Those two diverge, and the divergence is what pushed owners of live stores
 * into onboarding as new users.
 *
 * Site count is the deciding fact here for the same reason it is in
 * `onboardingGate`: it is the durable, user-visible thing that makes someone
 * an existing customer.
 */

describe('an account that owns stores goes to the dashboard', () => {
    it('lands on the dashboard by default', () => {
        expect(resolvePostAuthDestination({ siteCount: 3 })).toBe('/manage/dashboard');
    });

    it('honours where they were originally headed', () => {
        // Deep link: middleware bounced them to /login?redirectTo=/manage/orders.
        expect(resolvePostAuthDestination({ siteCount: 3, next: '/manage/orders' }))
            .toBe('/manage/orders');
    });

    it('ignores a next that points off-site', () => {
        // `next` arrives from a query string, so it is attacker-controlled.
        for (const evil of [
            'https://evil.example/steal',
            '//evil.example/steal',
            'javascript:alert(1)',
            'http://evil.example',
        ]) {
            expect(resolvePostAuthDestination({ siteCount: 3, next: evil }))
                .toBe('/manage/dashboard');
        }
    });
});

describe('an account with no stores goes to onboarding', () => {
    it('with the first-store intent', () => {
        expect(resolvePostAuthDestination({ siteCount: 0 }))
            .toBe('/onboarding?intent=first-store');
    });

    it('even when a next was requested — there is no dashboard to show yet', () => {
        expect(resolvePostAuthDestination({ siteCount: 0, next: '/manage/orders' }))
            .toBe('/onboarding?intent=first-store');
    });
});

describe('safeInternalPath', () => {
    it('accepts ordinary in-app paths', () => {
        expect(safeInternalPath('/manage/dashboard')).toBe('/manage/dashboard');
        expect(safeInternalPath('/manage/orders?tab=live')).toBe('/manage/orders?tab=live');
    });

    it('rejects anything that could leave the site', () => {
        expect(safeInternalPath('//evil.example')).toBeNull();
        expect(safeInternalPath('https://evil.example')).toBeNull();
        expect(safeInternalPath('javascript:alert(1)')).toBeNull();
        expect(safeInternalPath('')).toBeNull();
        expect(safeInternalPath(null)).toBeNull();
        expect(safeInternalPath('manage/dashboard')).toBeNull();
    });

    it('rejects a backslash-prefixed path', () => {
        // Some browsers normalise \\ to // — treat it as protocol-relative.
        expect(safeInternalPath('/\\evil.example')).toBeNull();
        expect(safeInternalPath('\\\\evil.example')).toBeNull();
    });
});
