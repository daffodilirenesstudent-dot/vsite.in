/**
 * The WhatsApp Cloud API call — and nothing else. No database, no retries:
 * the outbox decides what a failure means. This only reports it faithfully.
 */

import type { TemplateComponent } from './templates';

export interface WhatsAppConfig {
    token: string;
    phoneNumberId: string;
    graphVersion: string;
}

/** Null when the layer is not configured — callers leave rows queued. */
export function whatsappConfig(): WhatsAppConfig | null {
    const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    if (!token || !phoneNumberId) return null;
    const graphVersion = process.env.WHATSAPP_GRAPH_VERSION?.trim() || 'v25.0';
    return { token, phoneNumberId, graphVersion };
}

export type SendResult =
    | { ok: true; wamid: string }
    | { ok: false; retryable: boolean; code: number | null; message: string };

/**
 * Meta error codes worth another attempt: rate and throughput limits, the
 * explicit "unknown error", and pair-rate limiting. Everything else — expired
 * token (190), policy (368), template mismatch (132xxx), undeliverable (131026),
 * not on WhatsApp (133010) — fails the same way every time.
 * No code at all means network/timeout/5xx: retry.
 */
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 341, 80007, 130429, 131000, 131016, 131056, 133004]);

export function isRetryable(code: number | null, httpStatus: number): boolean {
    if (code !== null && code !== undefined) return RETRYABLE_CODES.has(code);
    return httpStatus === 0 || httpStatus === 429 || httpStatus >= 500;
}

const SEND_TIMEOUT_MS = 10_000;

export async function sendTemplate(
    config: WhatsAppConfig,
    to: string,
    templateName: string,
    language: string,
    components: TemplateComponent[],
): Promise<SendResult> {
    const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;
    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'template',
                template: { name: templateName, language: { code: language }, components },
            }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
    } catch (err) {
        return { ok: false, retryable: true, code: null, message: err instanceof Error ? err.name : 'network' };
    }

    let json: unknown = null;
    try { json = await res.json(); } catch { /* non-JSON body: handled below */ }

    if (res.ok) {
        const wamid = (json as { messages?: Array<{ id?: unknown }> } | null)?.messages?.[0]?.id;
        if (typeof wamid === 'string' && wamid) return { ok: true, wamid };
        // 200 without a message id: Meta accepted nothing we can track. Treat as
        // retryable-unknown rather than claiming a send we cannot prove.
        return { ok: false, retryable: true, code: null, message: 'missing message id' };
    }

    const err = (json as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const code = typeof err?.code === 'number' ? err.code : null;
    const message = typeof err?.message === 'string' ? err.message.slice(0, 200) : `HTTP ${res.status}`;
    return { ok: false, retryable: isRetryable(code, res.status), code, message };
}
