/**
 * The outbox state machine, as pure functions.
 *
 *   queued ─► sending ─► sent ─► delivered ─► read
 *     │          │
 *     │          └─► failed (retryable, backs off) ─► sending …
 *     │          └─► dead   (permanent, or attempts exhausted)
 *     └─► skipped (no phone / precondition false / stale)
 */

export type OutboxStatus =
    | 'queued' | 'sending' | 'sent' | 'delivered' | 'read'
    | 'failed' | 'dead' | 'skipped';

export const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 5 * 60_000;
/** A row older than this is never sent: the moment it was about has passed. */
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;
/** A row left in `sending` this long belongs to a worker that died mid-send. */
export const STUCK_SENDING_MS = 10 * 60_000;

const DELIVERY_RANK: Partial<Record<OutboxStatus, number>> = { sending: 0, sent: 1, delivered: 2, read: 3 };

/**
 * Apply a Meta status webhook to a row's current status. Returns the new
 * status, or null when the update must be ignored. Meta does not guarantee
 * order — a `delivered` can arrive after `read` — so status only moves forward.
 */
export function nextDeliveryStatus(current: string, incoming: string): OutboxStatus | null {
    const from = DELIVERY_RANK[current as OutboxStatus];
    if (from === undefined) return null;                // skipped/dead/queued/failed: not ours to move
    if (incoming === 'failed') return from < 3 ? 'dead' : null;
    const to = DELIVERY_RANK[incoming as OutboxStatus];
    if (to === undefined || to === 0) return null;      // 'deleted', 'warning', unknown
    return to > from ? (incoming as OutboxStatus) : null;
}

/** What to do after a failed attempt number `attempts` (1-based). */
export function planFailure(attempts: number, retryable: boolean, nowMs: number): { status: 'failed' | 'dead'; nextAttemptAt: string | null } {
    if (!retryable || attempts >= MAX_ATTEMPTS) return { status: 'dead', nextAttemptAt: null };
    const delay = BASE_BACKOFF_MS * 4 ** (attempts - 1);
    return { status: 'failed', nextAttemptAt: new Date(nowMs + delay).toISOString() };
}

export function isStale(createdAt: string, nowMs: number): boolean {
    const t = Date.parse(createdAt);
    return Number.isFinite(t) && nowMs - t > STALE_AFTER_MS;
}
