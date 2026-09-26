import { STORE_LIMIT } from './trialRules';

/**
 * Whether an owner may add another store — the header's store menu and the You
 * page ask the same question here.
 *
 * Since "one free trial per account" (2026-09-25) the only count that matters
 * is the number of stores: 2 per account, trial or paid. Whether the next store
 * gets a trial is the server's answer (/api/onboarding/eligibility), because a
 * deleted trial store still used the trial and the app cannot see it.
 */

export { STORE_LIMIT };

interface SiteLike {
    created_at: string;
    site_subscriptions?: { store_expires_at?: string | null } | null;
}

export function storeCreation(sites: readonly SiteLike[]) {
    const storeCount = sites.length;
    const atLimit = storeCount >= STORE_LIMIT;
    return { storeCount, atLimit, canCreate: !atLimit };
}

/**
 * "1 of 2 stores" — or just "4 stores" for an account that had more before the
 * limit existed (beta), where "4 of 2" would read as a bug.
 */
export function storeCountLabel(storeCount: number): string {
    return storeCount <= STORE_LIMIT ? `${storeCount} of ${STORE_LIMIT} stores` : `${storeCount} stores`;
}
