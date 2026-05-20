// Admin audit logger — fire-and-forget inserts into public.admin_audit_log.
//
// USE FROM EVERY MONEY-TOUCHING ADMIN ROUTE so the owner has a forensic trail
// when investigating skimming, disputes, or sabotage.
//
// CONTRACT:
//   1. Never throws. If logging fails, the business operation must still succeed.
//      A failed log is a soft alert (console.error), not a 500.
//   2. Never blocks. Returns immediately; the insert runs in the background.
//   3. Never trusts client time. Server clock via DB default.
//
// USAGE:
//   await audit({
//     userId,                       // from verifyFirebaseToken()
//     siteId,                       // the site this action affects
//     action: 'confirm_counter_payment',
//     targetId: orderId,
//     details: { amount: 250, payment_method: 'cash', before: 'pending', after: 'paid' },
//     request,                      // optional — derives ip_hash
//   });

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { supabaseServer } from './supabase-server';

export type AuditAction =
    | 'confirm_counter_payment'
    | 'order_status_change'
    | 'table_checkout'
    | 'order_kot_sent'
    | 'bill_request_ack'
    | 'kot_mode_change'
    | 'qr_mode_change'
    | 'printer_settings_change'
    | 'kot_device_assign';

export interface AuditEntry {
    userId: string;
    siteId: string;
    action: AuditAction;
    targetId?: string | null;
    details?: Record<string, unknown> | null;
    request?: NextRequest;
}

function ipHashOf(req?: NextRequest): string | null {
    if (!req) return null;
    const raw = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '')
        .split(',')[0]
        .trim();
    if (!raw) return null;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/**
 * Fire-and-forget audit log insert. Returns a void promise that always resolves;
 * callers MAY await it but should not depend on it for correctness.
 */
export function audit(entry: AuditEntry): Promise<void> {
    // Defensive — strip oversized details so a runaway caller can't bloat the table.
    let details = entry.details ?? null;
    if (details) {
        try {
            const s = JSON.stringify(details);
            if (s.length > 2000) details = { _truncated: true, _len: s.length };
        } catch {
            details = { _serializeError: true };
        }
    }

    const row = {
        user_id:   entry.userId,
        site_id:   entry.siteId,
        action:    entry.action,
        target_id: entry.targetId ?? null,
        details,
        ip_hash:   ipHashOf(entry.request),
    };

    // Fire-and-forget. Wrap Supabase's PromiseLike in a real Promise so callers
    // can `await` it in tests without strict-mode TypeScript complaining. In
    // production this is invoked without `await` so it never blocks the request.
    return Promise.resolve(
        supabaseServer.from('admin_audit_log').insert(row),
    ).then(({ error }) => {
        if (error) {
            console.error('[audit] insert failed:', error.message, 'row:', { ...row, details: undefined });
        }
    });
}
