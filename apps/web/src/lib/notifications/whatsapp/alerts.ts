import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/platform/logger';

/**
 * WhatsApp alerts → Sentry (free plan: email on new/regressed issues).
 * One fingerprint per kind (+ key), so repeats group into one issue and one
 * email. Callers de-dup further (healthStore.claimAlert / newlyOpened) to stay
 * inside the 5k events/month budget. Never pass a phone number, token or
 * message text in `detail`. Never throws.
 */

export type AlertKind =
    | 'breaker_open' | 'template_status' | 'quality_drop' | 'account_update'
    | 'backlog' | 'dead_spike' | 'not_configured' | 'daily_missed';

export type AlertDetail = Record<string, string | number | null>;

export function alert(kind: AlertKind, detail: AlertDetail, level: 'error' | 'warning' = 'error'): void {
    logger.error('[whatsapp-alert]', kind, JSON.stringify(detail));
    try {
        Sentry.captureMessage(`WhatsApp: ${kind}`, {
            level,
            fingerprint: ['whatsapp', kind, String(detail.key ?? '')],
            tags: { area: 'whatsapp', kind },
            extra: detail,
        });
    } catch {
        // Sentry being down must never break a send or a webhook.
    }
}
