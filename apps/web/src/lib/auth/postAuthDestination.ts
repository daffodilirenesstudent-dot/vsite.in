/**
 * Where a session goes once OTP has been verified.
 *
 * One decision for both /login and /signup, resolved on the server by
 * `/auth/continue`. The pages used to branch on Firebase's `isNewUser`, which
 * answers "was this Firebase account created just now?" — not "does this person
 * have stores?". Those diverge, and the divergence is what routed owners of
 * live stores into onboarding as brand-new users.
 *
 * Site count decides, for the same reason it does in `./onboardingGate`: it is
 * the durable, user-visible fact that makes someone an existing customer.
 * `profiles.onboarding_completed` is a cache that can be missing or hidden by
 * RLS, so it is not consulted here at all.
 */

/** Onboarding is entered for two quite different reasons. Say which. */
export type OnboardingIntent = 'first-store' | 'add-store';

export const DASHBOARD = '/manage/dashboard';

/**
 * Returns `path` when it is a same-origin path we are willing to navigate to,
 * otherwise null.
 *
 * `next` reaches us through a query string, so it is attacker-controlled: a
 * bare "starts with /" check still admits `//evil.example`, which browsers read
 * as protocol-relative and follow off-site. Backslashes are rejected too, since
 * some browsers normalise `\\` to `//`.
 */
export function safeInternalPath(path: string | null | undefined): string | null {
    if (!path) return null;
    if (!path.startsWith('/')) return null;
    if (path.startsWith('//')) return null;
    if (path.includes('\\')) return null;
    return path;
}

export interface PostAuthInput {
    /** How many sites this account owns. */
    siteCount: number;
    /** Where the user was heading before being bounced to login, if anywhere. */
    next?: string | null;
}

export function resolvePostAuthDestination({ siteCount, next }: PostAuthInput): string {
    // No stores means there is no dashboard worth showing, whatever they asked
    // for. This is the only case that belongs in onboarding.
    if (siteCount <= 0) {
        return onboardingPath('first-store');
    }
    return safeInternalPath(next) ?? DASHBOARD;
}

/** The canonical onboarding URL for an intent. */
export function onboardingPath(intent: OnboardingIntent): string {
    return `/onboarding?intent=${intent}`;
}
