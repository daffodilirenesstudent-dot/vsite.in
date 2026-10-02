import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { logger } from '@/lib/platform/logger';
import { alert, type AlertKind } from './alerts';
import { claimAlert, lastBeat } from './healthStore';
import { isOpen } from './health';

/**
 * Runs after every dispatch (every 10 min). Catches what no single send can
 * see: a queue that is not draining, a burst of permanent failures, a daily
 * job that stopped. Each alert kind fires at most once an hour.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
export const BACKLOG_MS = 30 * MIN;
export const DEAD_SPIKE = 5;
export const DAILY_MISSED_MS = 26 * HOUR;

export async function runWatchdog(nowMs: number, breakers: Map<string, number>): Promise<string[]> {
    const fired: string[] = [];
    const fire = async (kind: AlertKind, detail: Record<string, string | number | null>) => {
        if (await claimAlert(kind, HOUR, nowMs)) { alert(kind, detail); fired.push(kind); }
    };
    try {
        if (!isOpen(breakers, 'system', nowMs)) {
            const { data, error } = await supabaseServer
                .from('notification_outbox').select('id, next_attempt_at')
                .in('status', ['queued', 'failed'])
                .lt('next_attempt_at', new Date(nowMs - BACKLOG_MS).toISOString())
                .order('next_attempt_at', { ascending: true }).limit(1);
            if (error) throw new Error(error.message);
            const oldest = (data ?? [])[0] as { next_attempt_at: string } | undefined;
            if (oldest) await fire('backlog', { oldestMinutes: Math.round((nowMs - Date.parse(oldest.next_attempt_at)) / MIN) });
        }

        const { data: dead, error: deadErr } = await supabaseServer
            .from('notification_outbox').select('id')
            .eq('status', 'dead')
            .gt('updated_at', new Date(nowMs - HOUR).toISOString())
            .limit(DEAD_SPIKE);
        if (deadErr) throw new Error(deadErr.message);
        if ((dead ?? []).length >= DEAD_SPIKE) await fire('dead_spike', { deadLastHour: (dead ?? []).length });

        const daily = await lastBeat('heartbeat:daily');
        if (daily !== null && nowMs - daily > DAILY_MISSED_MS) {
            await fire('daily_missed', { hoursSinceDaily: Math.round((nowMs - daily) / HOUR) });
        }
    } catch (err) {
        logger.error('[whatsapp] watchdog failed:', err instanceof Error ? err.message : 'unknown');
    }
    return fired;
}
