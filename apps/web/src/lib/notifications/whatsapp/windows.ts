/**
 * Time windows for the daily sweep. Pure: every rule about "who is due" lives
 * here, so it is tested without a database.
 *
 * The cron runs once a day. Each window is a little wider than 24h (the slack)
 * so a late or skipped run still catches a store; overlap between runs is safe
 * because the outbox idempotency key dedupes. Windows are BOUNDED on both
 * sides, so switching the layer on does not message every historical store.
 */

const HOUR = 60 * 60 * 1000;

/** Trial-ending notice goes out when the trial has at most this long left. */
export const TRIAL_ENDING_LEAD_MS = 48 * HOUR;
/** Look-back for "it just ended" messages: one day plus slack. */
export const ENDED_LOOKBACK_MS = 30 * HOUR;
/** Plan T-3 reminder horizon: three days plus slack. */
export const PLAN_EXPIRING_LEAD_MS = 78 * HOUR;
/** "Expires today" is anything inside the next 24h. */
export const PLAN_TODAY_MS = 24 * HOUR;

export type TrialEvent = 'trial_ending' | 'trial_ended';
export type PlanEvent = 'plan_expiring' | 'plan_expires_today' | 'plan_expired';

export interface Range { gt: string; lte: string }

export function sweepWindows(nowMs: number, trialMs: number): { trialCreated: Range; planExpires: Range } {
    return {
        // Trial ends at created_at + trialMs. "Ends within the next 48h" and
        // "ended within the last 30h", rewritten as bounds on created_at.
        trialCreated: {
            gt:  new Date(nowMs - trialMs - ENDED_LOOKBACK_MS).toISOString(),
            lte: new Date(nowMs - trialMs + TRIAL_ENDING_LEAD_MS).toISOString(),
        },
        planExpires: {
            gt:  new Date(nowMs - ENDED_LOOKBACK_MS).toISOString(),
            lte: new Date(nowMs + PLAN_EXPIRING_LEAD_MS).toISOString(),
        },
    };
}

export function classifyTrialEvent(createdAtMs: number, nowMs: number, trialMs: number): TrialEvent | null {
    const endsAt = createdAtMs + trialMs;
    if (endsAt > nowMs && endsAt <= nowMs + TRIAL_ENDING_LEAD_MS) return 'trial_ending';
    if (endsAt <= nowMs && endsAt > nowMs - ENDED_LOOKBACK_MS) return 'trial_ended';
    return null;
}

export function classifyPlanEvent(expiresAtMs: number, nowMs: number): PlanEvent | null {
    if (expiresAtMs > nowMs + PLAN_TODAY_MS && expiresAtMs <= nowMs + PLAN_EXPIRING_LEAD_MS) return 'plan_expiring';
    if (expiresAtMs > nowMs && expiresAtMs <= nowMs + PLAN_TODAY_MS) return 'plan_expires_today';
    if (expiresAtMs <= nowMs && expiresAtMs > nowMs - ENDED_LOOKBACK_MS) return 'plan_expired';
    return null;
}

/**
 * A store is paid when `store_expires_at` is in the future. That column is
 * NULL by default and written only once money is captured. `razorpay_status`
 * is NOT a paid flag — see AGENTS.md, "razorpay_status is the replay guard".
 */
export function isPaid(storeExpiresAt: string | null | undefined, nowMs: number): boolean {
    if (!storeExpiresAt) return false;
    const t = Date.parse(storeExpiresAt);
    return Number.isFinite(t) && t > nowMs;
}
