import 'server-only';
import { alert } from './alerts';
import { closeBreaker, openBreaker } from './healthStore';

/**
 * Meta webhook fields about the account rather than one message. Subscribe
 * them in App Dashboard -> WhatsApp -> Configuration -> Webhook fields.
 * Never forwards a phone number (display_phone_number is dropped).
 */

export const TEMPLATE_HOLD_MS = 6 * 60 * 60 * 1000;
const BAD_TEMPLATE = new Set(['PAUSED', 'DISABLED', 'REJECTED', 'FLAGGED', 'PENDING_DELETION']);
const BAD_QUALITY = new Set(['FLAGGED', 'DOWNGRADE']);
const BAD_ACCOUNT = new Set(['DISABLED_UPDATE', 'ACCOUNT_RESTRICTION', 'ACCOUNT_VIOLATION', 'ACCOUNT_DELETED']);

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v.slice(0, 100) : null);

export async function applyAccountEvent(field: string, value: Record<string, unknown>, nowMs: number): Promise<void> {
    const event = str(value.event);
    if (!event) return;

    if (field === 'message_template_status_update') {
        const name = str(value.message_template_name);
        if (!name) return;
        const key = `template:${name}`;
        if (BAD_TEMPLATE.has(event)) {
            await openBreaker(key, { code: null, reason: `${event} ${str(value.reason) ?? ''}`.trim(), untilMs: nowMs + TEMPLATE_HOLD_MS, nowMs });
            alert('template_status', { key, event, reason: str(value.reason) });
        } else if (event === 'APPROVED' || event === 'REINSTATED') {
            await closeBreaker(key, nowMs);
        }
        return;
    }
    if (field === 'phone_number_quality_update') {
        if (BAD_QUALITY.has(event)) alert('quality_drop', { event, currentLimit: str(value.current_limit) }, 'warning');
        return;
    }
    if (field === 'account_update') {
        if (BAD_ACCOUNT.has(event)) alert('account_update', { event });
    }
}
