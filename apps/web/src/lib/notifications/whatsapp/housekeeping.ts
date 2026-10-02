import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { logger } from '@/lib/platform/logger';
import { alert } from './alerts';
import { beat, claimAlert } from './healthStore';
import { whatsappConfig } from './client';

/**
 * Daily duties after the sweep: drop message history older than 90 days (it
 * holds phone numbers - DPDP Act), record the daily heartbeat the watchdog
 * checks, and warn if production has no WhatsApp config. Never throws.
 */

export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const BATCH = 1000;
const MAX_BATCHES = 10;

export async function runHousekeeping(nowMs: number): Promise<{ purged: number }> {
    let purged = 0;
    try {
        const cutoff = new Date(nowMs - RETENTION_MS).toISOString();
        for (let i = 0; i < MAX_BATCHES; i++) {
            const { data, error } = await supabaseServer.from('notification_outbox').select('id').lt('created_at', cutoff).limit(BATCH);
            if (error) throw new Error(error.message);
            const ids = ((data ?? []) as Array<{ id: string }>).map(r => r.id);
            if (ids.length === 0) break;
            const { error: delErr } = await supabaseServer.from('notification_outbox').delete().in('id', ids);
            if (delErr) throw new Error(delErr.message);
            purged += ids.length;
            if (ids.length < BATCH) break;
        }
    } catch (err) {
        logger.error('[whatsapp] retention purge failed:', err instanceof Error ? err.message : 'unknown');
    }
    try {
        await beat('heartbeat:daily', nowMs);
        if (process.env.NODE_ENV === 'production' && !whatsappConfig() && await claimAlert('not_configured', 24 * 60 * 60 * 1000, nowMs)) {
            alert('not_configured', {}, 'warning');
        }
    } catch (err) {
        logger.error('[whatsapp] heartbeat failed:', err instanceof Error ? err.message : 'unknown');
    }
    return { purged };
}
