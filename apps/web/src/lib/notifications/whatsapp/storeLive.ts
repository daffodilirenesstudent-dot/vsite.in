import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { logger } from '@/lib/platform/logger';
import { dispatchRow, enqueue } from './outbox';
import { formatDateIST, storeLinks } from './templates';
import { isPaid } from './windows';

/**
 * The QR for a store that went live by PAYING, never having had a trial.
 *
 * One free trial per account (migration 058) means an owner's second store
 * opens with no trial and waits for payment, so it never gets the onboarding
 * welcome — the message that carries the QR. This sends that QR on activation,
 * through the same approved template (`vsite_welcome_qr`), with {{3}} "Live
 * until" set to the paid plan's end.
 *
 * Exactly the right QR to exactly the right owner:
 *   - the store is read by id and must belong to `userId` (else nothing);
 *   - its links come from its own slug via `storeLinks`, the same function the
 *     send-time check uses (outbox.ts `qrStillBelongs`), which re-reads the
 *     store and fails closed on any mismatch;
 *   - the number is the owner's own `profiles.phone_number`, looked up by
 *     `userId` inside `enqueue`.
 * One per store, ever: the key is the welcome's (`welcome:<siteId>`), so a
 * store that had its trial welcome, or a renewal, enqueues nothing.
 */

interface StoreLiveInput {
    userId: string;
    siteId: string;
}

/** Enqueue the QR message. Returns the new row id, or null when nothing is due. */
export async function enqueueStoreLiveQr({ userId, siteId }: StoreLiveInput): Promise<string | null> {
    const [siteRes, subRes] = await Promise.all([
        supabaseServer.from('sites').select('id, user_id, name, slug').eq('id', siteId).maybeSingle(),
        supabaseServer.from('site_subscriptions').select('trial_ends_at, store_expires_at').eq('site_id', siteId).maybeSingle(),
    ]);
    if (siteRes.error) throw new Error(`store_live sites lookup failed: ${siteRes.error.message}`);
    if (subRes.error) throw new Error(`store_live subscription lookup failed: ${subRes.error.message}`);

    const site = siteRes.data as { id: string; user_id: string | null; name: string | null; slug: string | null } | null;
    if (!site?.slug || site.user_id !== userId) return null;

    // A store that had a trial got its QR in the welcome when it opened live.
    const sub = subRes.data as { trial_ends_at: string | null; store_expires_at: string | null } | null;
    if (sub?.trial_ends_at) return null;
    // Called after activation, so the paid end is set; if not, there is nothing true to say.
    if (!sub?.store_expires_at || !isPaid(sub.store_expires_at, Date.now())) return null;

    return enqueue({
        event: 'store_live',
        key: `welcome:${siteId}`,
        userId,
        siteId,
        params: {
            shopName: site.name?.trim() || 'your store',
            ...storeLinks(site.slug),
            liveUntil: formatDateIST(sub.store_expires_at),
        },
    });
}

/**
 * Fire-and-forget for the activation paths (verify-payment, Razorpay webhook):
 * a WhatsApp problem must never slow or fail a payment. Every rejection is
 * handled here; if the immediate send fails, the cron's dispatcher retries.
 */
export function sendStoreLiveQr(input: StoreLiveInput): void {
    enqueueStoreLiveQr(input)
        .then(id => (id ? dispatchRow(id) : undefined))
        .then(undefined, (err: unknown) => {
            logger.error('[whatsapp] sendStoreLiveQr failed:', err instanceof Error ? err.message : 'unknown');
        });
}
