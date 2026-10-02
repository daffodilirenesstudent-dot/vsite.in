import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { logger } from '@/lib/platform/logger';
import { alert } from './alerts';
import { beat, claimAlert } from './healthStore';
import { whatsappConfig } from './client';

/**
 * Daily duties after the sweep: drop message history older than 90 days (it
 * holds phone numbers - DPDP Act; one delete by cutoff, volume is small), record the daily heartbeat the watchdog
 * checks, and warn if production has no WhatsApp config. Never throws.
 */

export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export async function runHousekeeping(nowMs: number): Promise<{ purged: number }> {
    let purged = 0;
    try {
        const cutoff = new Date(nowMs - RETENTION_MS).toISOString();
        const { data, error } = await supabaseServer.from('notification_outbox').delete().lt('created_at', cutoff).select('id');
        if (error) throw new Error(error.message);
        purged = (data ?? []).length;
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
