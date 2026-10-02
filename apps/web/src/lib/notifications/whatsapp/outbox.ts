import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { logger } from '@/lib/platform/logger';
import { buildComponents, DEFAULT_TEMPLATE_LANGUAGE, TEMPLATES, type TemplateParams, type WhatsAppEvent } from './templates';
import { sendTemplate, whatsappConfig } from './client';
import { toWhatsAppNumber } from './phone';
import { isPaid } from './windows';
import { BREAKER_MS, breakerKeyFor, isOpen, type ErrorClass } from './health';
import { readBreakers, openBreaker, closeBreaker } from './healthStore';
import { alert } from './alerts';
import { isStale, nextDeliveryStatus, planFailure, STUCK_SENDING_MS, type OutboxStatus } from './state';

/**
 * The WhatsApp outbox — a durable, idempotent queue in `notification_outbox`.
 *
 * Detection and sending are separate steps (the transactional-outbox pattern):
 * a trigger or the daily sweep calls `enqueue()`, which only writes a row; the
 * row is then sent by `dispatchRow()`, either straight away (`enqueueAndSend`)
 * or by the cron's `dispatchDue()`. So a Meta outage, an expired token or a
 * container restart delays a message instead of losing it.
 *
 * Guarantees:
 *   - One idempotency key → at most one row → at most one send. The key is
 *     UNIQUE and the insert is ON CONFLICT DO NOTHING.
 *   - One dispatcher per row: the claim is a conditional UPDATE, atomic in
 *     Postgres, so racing dispatchers cannot both send.
 *   - The state the message is about is re-checked just before sending.
 *   - A crash between Meta accepting a message and us recording it can send
 *     that one message twice (the row is reclaimed after STUCK_SENDING_MS).
 *     The Cloud API has no idempotency key; this is the accepted trade-off.
 *
 * Never logs a phone number or token — ids, events and Meta error codes only.
 */

const TABLE = 'notification_outbox';

export interface EnqueueInput {
    event: WhatsAppEvent;
    /** Unique per real-world occurrence, e.g. `welcome:<siteId>`. */
    key: string;
    userId: string;
    siteId: string | null;
    params: TemplateParams;
    /**
     * The owner's stored number. Omit to look it up from `profiles`; pass null
     * when the caller already knows there is none.
     */
    phone?: string | null;
}

interface OutboxRow {
    id: string;
    event: WhatsAppEvent;
    site_id: string | null;
    to_phone: string | null;
    template: string;
    language: string;
    params: TemplateParams;
    status: OutboxStatus;
    attempts: number;
    created_at: string;
}

async function lookupPhone(userId: string): Promise<string | null> {
    const { data, error } = await supabaseServer
        .from('profiles')
        .select('phone_number')
        .eq('id', userId)
        .maybeSingle();
    if (error) throw new Error(`profiles lookup failed: ${error.message}`);
    return (data as { phone_number?: string | null } | null)?.phone_number ?? null;
}

/**
 * Record a message to send. Returns the new row id, or null when this key was
 * already enqueued (nothing is written). Throws on invalid params or a
 * database error — callers on a hot path use `enqueueAndSend` instead.
 */
export async function enqueue(input: EnqueueInput): Promise<string | null> {
    // Validate before storing: a row that can never render would only go dead later.
    buildComponents(input.event, input.params);

    const rawPhone = input.phone !== undefined ? input.phone : await lookupPhone(input.userId);
    const to = toWhatsAppNumber(rawPhone);
    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseServer
        .from(TABLE)
        .upsert(
            {
                idempotency_key: input.key,
                event: input.event,
                user_id: input.userId,
                site_id: input.siteId,
                to_phone: to,
                template: TEMPLATES[input.event].name,
                language: DEFAULT_TEMPLATE_LANGUAGE,
                params: input.params,
                status: to ? 'queued' : 'skipped',
                last_error: to ? null : 'no_phone',
                attempts: 0,
                next_attempt_at: nowIso,
                updated_at: nowIso,
            },
            { onConflict: 'idempotency_key', ignoreDuplicates: true },
        )
        .select('id');

    if (error) throw new Error(`outbox insert failed: ${error.message}`);
    const rows = (data ?? []) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
}

/**
 * Enqueue and try to send immediately, without the caller waiting on either.
 * For request paths (onboarding, payment): a WhatsApp problem must never slow
 * or fail them. Every rejection is handled here — an unhandled one would exit
 * the single-instance Node process (see tests/unit/fireAndForget.test.ts).
 * If the immediate send fails, the cron's dispatcher retries the row.
 */
export function enqueueAndSend(input: EnqueueInput): void {
    enqueue(input)
        .then(id => (id ? dispatchRow(id) : undefined))
        .then(undefined, (err: unknown) => {
            logger.error('[whatsapp] enqueueAndSend failed:', input.event, err instanceof Error ? err.message : 'unknown');
        });
}

async function recheck(row: OutboxRow, nowMs: number): Promise<boolean> {
    switch (row.event) {
        case 'payment_receipt':
            return true;
        case 'welcome': {
            if (!row.site_id) return false;
            const { data, error } = await supabaseServer.from('sites').select('id').eq('id', row.site_id).maybeSingle();
            if (error) throw new Error(`recheck sites failed: ${error.message}`);
            return !!data;
        }
        default: {
            if (!row.site_id) return false;
            const { data, error } = await supabaseServer
                .from('site_subscriptions')
                .select('store_expires_at')
                .eq('site_id', row.site_id)
                .maybeSingle();
            if (error) throw new Error(`recheck subscription failed: ${error.message}`);
            if (!data) return false; // store deleted
            const expiresAt = (data as { store_expires_at: string | null }).store_expires_at;

            if (row.event === 'trial_ending' || row.event === 'trial_ended') return !isPaid(expiresAt, nowMs);

            // Plan reminders are about one specific expiry. If it moved, the owner
            // renewed (or support extended them) and this message is now wrong.
            const expected = Date.parse(row.params.expiresAt ?? '');
            const actual = expiresAt ? Date.parse(expiresAt) : NaN;
            if (!Number.isFinite(expected) || actual !== expected) return false;
            return row.event === 'plan_expired' ? actual <= nowMs : actual > nowMs;
        }
    }
}

async function finish(id: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await supabaseServer
        .from(TABLE)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'sending');
    if (error) logger.error('[whatsapp] could not record outcome for row', id, error.message);
}

export type DispatchOutcome = 'sent' | 'failed' | 'dead' | 'skipped' | 'paused' | 'not_claimed' | 'not_configured';

/** Breakers for this run. Fails OPEN: a health-table outage must not stop sending. */
async function loadBreakers(): Promise<Map<string, number>> {
    try {
        return await readBreakers();
    } catch (err) {
        logger.error('[whatsapp] breaker read failed � sending without breakers:', err instanceof Error ? err.message : 'unknown');
        return new Map();
    }
}

const BREAKER_DURATION: Record<'system' | 'template' | 'throttle', number> = BREAKER_MS;

/** Open the breaker for an account-level error. Returns open_until, or null if the store failed. */
async function trip(breakers: Map<string, number>, cls: ErrorClass, template: string, code: number | null, reason: string, nowMs: number): Promise<string | null> {
    const key = breakerKeyFor(cls, template);
    if (!key || (cls !== 'system' && cls !== 'template' && cls !== 'throttle')) return null;
    try {
        const r = await openBreaker(key, { code, reason, untilMs: nowMs + BREAKER_DURATION[cls], nowMs });
        breakers.set(key, Date.parse(r.openUntil));
        if (r.newlyOpened && cls !== 'throttle') alert('breaker_open', { key, code });
        return r.openUntil;
    } catch (err) {
        logger.error('[whatsapp] breaker write failed:', err instanceof Error ? err.message : 'unknown');
        return null;
    }
}

/** A send succeeded: any expired breaker this row was gated by has recovered. */
async function recover(breakers: Map<string, number>, template: string, nowMs: number): Promise<void> {
    for (const key of ['system', `template:${template}`]) {
        if (!breakers.has(key)) continue;
        breakers.delete(key);
        try {
            await closeBreaker(key, nowMs);
            logger.info('[whatsapp] recovered:', key);
        } catch (err) {
            logger.error('[whatsapp] breaker close failed:', err instanceof Error ? err.message : 'unknown');
        }
    }
}

/** Claim one row and send it. Safe to call concurrently for the same id. */
export async function dispatchRow(id: string, nowMs: number = Date.now(), breakers?: Map<string, number>): Promise<DispatchOutcome> {
    const config = whatsappConfig();
    if (!config) return 'not_configured';
    const gates = breakers ?? await loadBreakers();
    if (isOpen(gates, 'system', nowMs)) return 'paused';

    const { data: claimed, error: claimError } = await supabaseServer
        .from(TABLE)
        .update({ status: 'sending', updated_at: new Date(nowMs).toISOString() })
        .eq('id', id)
        .in('status', ['queued', 'failed'])
        .select('id, event, site_id, to_phone, template, language, params, status, attempts, created_at');
    if (claimError) throw new Error(`outbox claim failed: ${claimError.message}`);
    const row = ((claimed ?? []) as OutboxRow[])[0];
    if (!row) return 'not_claimed';

    const templateKey = `template:${row.template}`;
    if (isOpen(gates, templateKey, nowMs)) {
        await finish(id, { status: 'failed', next_attempt_at: new Date(gates.get(templateKey) as number).toISOString(), last_error: 'paused' });
        return 'paused';
    }

    const attempts = (row.attempts ?? 0) + 1;

    if (isStale(row.created_at, nowMs)) {
        await finish(id, { status: 'skipped', last_error: 'stale' });
        return 'skipped';
    }

    try {
        if (!(await recheck(row, nowMs))) {
            await finish(id, { status: 'skipped', last_error: 'precondition' });
            return 'skipped';
        }
    } catch (err) {
        const plan = planFailure(attempts, true, nowMs);
        await finish(id, { status: plan.status, attempts, next_attempt_at: plan.nextAttemptAt, last_error: err instanceof Error ? err.message.slice(0, 200) : 'recheck failed' });
        return plan.status;
    }

    let components;
    try {
        components = buildComponents(row.event, row.params ?? {});
    } catch (err) {
        await finish(id, { status: 'dead', attempts, last_error: err instanceof Error ? err.message.slice(0, 200) : 'bad params' });
        return 'dead';
    }

    if (!row.to_phone) {
        await finish(id, { status: 'skipped', last_error: 'no_phone' });
        return 'skipped';
    }

    const result = await sendTemplate(config, row.to_phone, row.template, row.language, components);

    if (result.ok) {
        await finish(id, {
            status: 'sent', wamid: result.wamid, attempts,
            sent_at: new Date().toISOString(), last_error: null, error_code: null, next_attempt_at: null,
        });
        await recover(gates, row.template, nowMs);
        return 'sent';
    }

    if (result.cls === 'system' || result.cls === 'template' || result.cls === 'throttle') {
        const until = await trip(gates, result.cls, row.template, result.code, result.message, nowMs);
        if (until) {
            // Not this row's fault: keep its attempts, retry when the breaker closes.
            await finish(id, { status: 'failed', next_attempt_at: until, last_error: result.message, error_code: result.code });
            return 'failed';
        }
    }
    const plan = planFailure(attempts, result.cls !== 'message', nowMs);
    await finish(id, {
        status: plan.status, attempts, next_attempt_at: plan.nextAttemptAt,
        last_error: result.message, error_code: result.code,
    });
    if (plan.status === 'dead') {
        logger.warn('[whatsapp] message dead:', row.event, 'row', id, 'code', result.code);
    }
    return plan.status;
}

export interface DispatchSummary {
    configured: boolean;
    attempted: number;
    sent: number;
    failed: number;
    dead: number;
    skipped: number;
    paused: number;
    reclaimed: number;
}

/**
 * Send everything that is due: all `queued` rows, `failed` rows whose backoff
 * has elapsed, and rows stuck in `sending` from a worker that died. Stops at
 * `deadlineMs` so the cron route finishes inside its time limit; what is left
 * goes on the next run.
 */
export async function dispatchDue(opts: { nowMs?: number; limit?: number; deadlineMs?: number } = {}): Promise<DispatchSummary> {
    const nowMs = opts.nowMs ?? Date.now();
    const limit = opts.limit ?? 50;
    const deadline = Date.now() + (opts.deadlineMs ?? 45_000);
    const nowIso = new Date(nowMs).toISOString();
    const summary: DispatchSummary = { configured: !!whatsappConfig(), attempted: 0, sent: 0, failed: 0, dead: 0, skipped: 0, paused: 0, reclaimed: 0 };
    if (!summary.configured) return summary;
    const breakers = await loadBreakers();

    const { data: reclaimed, error: reclaimError } = await supabaseServer
        .from(TABLE)
        .update({ status: 'failed', next_attempt_at: nowIso, last_error: 'stuck_sending', updated_at: nowIso })
        .eq('status', 'sending')
        .lt('updated_at', new Date(nowMs - STUCK_SENDING_MS).toISOString())
        .select('id');
    if (reclaimError) throw new Error(`outbox reclaim failed: ${reclaimError.message}`);
    summary.reclaimed = (reclaimed ?? []).length;

    const [queued, retry] = await Promise.all([
        supabaseServer.from(TABLE).select('id').eq('status', 'queued').order('created_at', { ascending: true }).limit(limit),
        supabaseServer.from(TABLE).select('id').eq('status', 'failed').lte('next_attempt_at', nowIso).order('next_attempt_at', { ascending: true }).limit(limit),
    ]);
    if (queued.error) throw new Error(`outbox select failed: ${queued.error.message}`);
    if (retry.error) throw new Error(`outbox select failed: ${retry.error.message}`);

    const ids = [...(queued.data ?? []), ...(retry.data ?? [])].map(r => (r as { id: string }).id).slice(0, limit);

    for (const id of ids) {
        if (Date.now() > deadline) break;
        summary.attempted++;
        let outcome: DispatchOutcome;
        try {
            outcome = await dispatchRow(id, nowMs, breakers);
        } catch (err) {
            logger.error('[whatsapp] dispatch error for row', id, err instanceof Error ? err.message : 'unknown');
            continue;
        }
        if (outcome === 'sent') summary.sent++;
        else if (outcome === 'failed') summary.failed++;
        else if (outcome === 'dead') summary.dead++;
        else if (outcome === 'skipped') summary.skipped++;
        else if (outcome === 'paused') summary.paused++;
    }
    return summary;
}

/** One entry of `value.statuses[]` in a Meta webhook. */
export interface MetaStatus {
    id: string;
    status: string;
    timestamp?: string;
    recipient_id?: string;
    errors?: Array<{ code?: number; title?: string; message?: string }>;
}

/**
 * Apply delivery statuses from the webhook. Returns how many rows changed.
 * Throws on a database error so the webhook answers 500 and Meta retries.
 * Unknown wamids (test sends from the dashboard, other apps) are ignored.
 */
export async function applyStatuses(statuses: MetaStatus[]): Promise<number> {
    let changed = 0;
    for (const s of statuses) {
        if (!s || typeof s.id !== 'string' || typeof s.status !== 'string') continue;

        const { data, error } = await supabaseServer.from(TABLE).select('id, status').eq('wamid', s.id).maybeSingle();
        if (error) throw new Error(`outbox status lookup failed: ${error.message}`);
        if (!data) continue;
        const row = data as { id: string; status: string };

        const next = nextDeliveryStatus(row.status, s.status);
        if (!next) continue;

        const nowIso = new Date().toISOString();
        const patch: Record<string, unknown> = { status: next, updated_at: nowIso };
        if (next === 'delivered') patch.delivered_at = nowIso;
        if (next === 'read') patch.read_at = nowIso;
        if (next === 'dead') {
            const e = s.errors?.[0];
            patch.error_code = typeof e?.code === 'number' ? e.code : null;
            patch.last_error = (e?.title ?? e?.message ?? 'delivery failed').slice(0, 200);
        }

        // Conditional on the status we read, so two webhook deliveries racing on
        // one row cannot move it backwards.
        const { error: upErr } = await supabaseServer.from(TABLE).update(patch).eq('id', row.id).eq('status', row.status);
        if (upErr) throw new Error(`outbox status update failed: ${upErr.message}`);
        changed++;
        if (next === 'dead') logger.warn('[whatsapp] delivery failed for row', row.id, 'code', patch.error_code);
    }
    return changed;
}
