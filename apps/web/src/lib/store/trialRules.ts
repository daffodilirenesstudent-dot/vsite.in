/**
 * One free trial per account — the store-creation rule, in one place.
 *
 * Owner decision 2026-09-25: an account (one phone number) has at most 2
 * stores; the first gets the 7-day trial, once per account for good; any later
 * store is built free but goes live only after it is paid for, and the owner
 * agrees to that before it is created. The database enforces the same rule
 * (migrations 058/059) — this module is how the server and the app ask it
 * before doing any work, and read its answers.
 *
 * Pure and client-safe.
 */

export const STORE_LIMIT = 2;

/** Sent by the app once the owner has agreed to pay for a no-trial store. */
export const PAID_STORE_CONSENT_HEADER = 'x-paid-store-consent';
export const PAID_STORE_CONSENT_VALUE = 'yes';

export type StoreRefusal = 'PLAN_LIMIT' | 'CONSENT_REQUIRED';

export type StoreDecision =
    | { ok: true; trial: boolean }
    | { ok: false; code: StoreRefusal; error: string };

export function decideStoreCreation(input: { storeCount: number; trialUsed: boolean; paidConsent: boolean }): StoreDecision {
    if (input.storeCount >= STORE_LIMIT) {
        return { ok: false, code: 'PLAN_LIMIT', error: `An account can have at most ${STORE_LIMIT} stores.` };
    }
    if (input.trialUsed && !input.paidConsent) {
        return {
            ok: false,
            code: 'CONSENT_REQUIRED',
            error: 'The free trial for this phone number is already used. This store goes live only after you pay for it.',
        };
    }
    return { ok: true, trial: !input.trialUsed };
}

/** The owner's consent, read from a request: only the exact value counts. */
export function hasPaidConsent(headers: { get(name: string): string | null }): boolean {
    return headers.get(PAID_STORE_CONSENT_HEADER) === PAID_STORE_CONSENT_VALUE;
}

/**
 * The store-limit trigger's refusals ("PLAN_LIMIT: …", "CONSENT_REQUIRED: …",
 * raised as P0001) — told apart from every other insert failure so the server
 * answers 403 at once instead of retrying a decision that will not change.
 */
export function refusalFromDbError(err: unknown): StoreRefusal | null {
    if (!err || typeof err !== 'object') return null;
    const { code, message } = err as { code?: unknown; message?: unknown };
    if (code !== 'P0001' || typeof message !== 'string') return null;
    if (message.startsWith('CONSENT_REQUIRED')) return 'CONSENT_REQUIRED';
    if (message.startsWith('PLAN_LIMIT')) return 'PLAN_LIMIT';
    return null;
}

/** A store's trial end in ms, or 0 when it has none. */
export function trialEndsMs(sub: { trial_ends_at?: string | null } | null | undefined): number {
    const at = sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0;
    return Number.isFinite(at) ? at : 0;
}
