/**
 * Decides whether a signed-in account belongs in the dashboard or in onboarding.
 *
 * Extracted from `ManageLayoutClient` so the rule is one testable function
 * rather than a branch inside a React effect, because the branch it replaces
 * locked real customers out of their own stores.
 *
 * ── The bug this fixes ─────────────────────────────────────────────────────
 * The old gate asked only `profiles.onboarding_completed`. An owner with four
 * live stores signed in, was told they were new, and could only escape by
 * creating a fifth. Two things make that flag lie about an existing user:
 *
 *   1. The profiles row is MISSING. Provisioning was once gated on Firebase's
 *      `isNewUser` — true exactly once per account — so any account whose first
 *      sign-in failed after Firebase created the account never got a row. Those
 *      users went on to create sites regardless, since `sites` has no
 *      dependency on `profiles`. The heal path then inserts
 *      `onboarding_completed: false`, which is what pins them in onboarding.
 *   2. The row EXISTS but the read returns nothing, because `profiles` RLS is
 *      select-own against the Firebase uid (migration 002) and the token was
 *      momentarily wrong. Identical symptom, different cause.
 *
 * Either way the flag is unreliable. Owning a site is not: it is the durable,
 * user-visible fact that makes someone an existing customer, and it was the one
 * thing the old gate never consulted. So sites decide, and the flag is demoted
 * to a cache that this function repairs when it disagrees with reality.
 */

export interface OnboardingGateInput {
    /** The profiles row, or null when missing OR hidden by RLS — indistinguishable here. */
    profile: { onboarding_completed: boolean } | null;
    /** True when the profile read itself failed (network/RLS error), as opposed to returning no row. */
    profileError: boolean;
    /** How many sites this account owns. */
    siteCount: number;
}

export interface OnboardingGateDecision {
    /** `allow` renders the dashboard; `onboard` redirects to /onboarding?intent=first-store. */
    action: 'allow' | 'onboard';
    /**
     * True when the stored profile contradicts reality and should be written
     * back as onboarded. Never set on an errored read — we did not learn
     * anything we should act on.
     */
    repair: boolean;
}

export function decideOnboardingGate({
    profile,
    profileError,
    siteCount,
}: OnboardingGateInput): OnboardingGateDecision {
    // A Supabase blip must not lock everyone out. Fail open and write nothing;
    // middleware still gates authentication. This preserves the previous
    // behaviour deliberately.
    if (profileError) {
        return { action: 'allow', repair: false };
    }

    // The account owns stores, so it is not new — whatever the flag says, and
    // whether or not we could read the row at all.
    if (siteCount > 0) {
        const flagIsWrong = profile === null || !profile.onboarding_completed;
        return { action: 'allow', repair: flagIsWrong };
    }

    // No sites: onboarding is genuinely the right destination. That covers a
    // brand-new account and an existing one that deleted its last store, which
    // is the pre-existing behaviour for that case.
    return { action: 'onboard', repair: false };
}
