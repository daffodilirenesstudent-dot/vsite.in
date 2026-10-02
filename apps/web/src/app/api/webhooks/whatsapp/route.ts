// /api/webhooks/whatsapp
//
// Meta WhatsApp Cloud API webhook. Callback URL in the Meta App Dashboard:
//   https://vsite.in/api/webhooks/whatsapp      (subscribe `messages`,
//   `message_template_status_update`, `phone_number_quality_update`, `account_update`)
//
// GET  — the one-time subscription handshake. Meta sends hub.mode=subscribe,
//        hub.verify_token (the value typed into the dashboard) and
//        hub.challenge; we echo the challenge only when the token matches
//        WHATSAPP_VERIFY_TOKEN.
// POST — event notifications. Signed as X-Hub-Signature-256 = HMAC-SHA256 of
//        the RAW body with the App Secret. Verified before parsing. We apply
//        message statuses (sent/delivered/read/failed) to notification_outbox.
//        Inbound owner messages are acknowledged and counted, not acted on (v1).
//
// Meta retries a non-200 for up to 36 hours, so a database failure answers 500
// on purpose: the update arrives again. Status updates are idempotent and only
// move forward, so a retried or reordered delivery is harmless.

import { NextRequest, NextResponse } from 'next/server';
import { verifyMetaSignature, tokensMatch } from '@/lib/notifications/whatsapp/signature';
import { applyStatuses, type MetaStatus } from '@/lib/notifications/whatsapp/outbox';
import { applyAccountEvent } from '@/lib/notifications/whatsapp/accountEvents';
import { logger } from '@/lib/platform/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(req: NextRequest) {
    const q = req.nextUrl.searchParams;
    const mode = q.get('hub.mode');
    const token = q.get('hub.verify_token') ?? '';
    const challenge = q.get('hub.challenge') ?? '';
    const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? '';

    if (!expected) logger.error('[whatsapp-webhook] WHATSAPP_VERIFY_TOKEN is not set');

    if (mode === 'subscribe' && tokensMatch(token, expected) && /^[\w-]{1,128}$/.test(challenge)) {
        return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

interface WebhookBody {
    object?: string;
    entry?: Array<{
        changes?: Array<{
            field?: string;
            value?: { statuses?: MetaStatus[]; messages?: unknown[] } & Record<string, unknown>;
        }>;
    }>;
}

export async function POST(req: NextRequest) {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret) {
        logger.error('[whatsapp-webhook] WHATSAPP_APP_SECRET is not set');
        return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const rawBody = await req.text();
    if (!verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'), secret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let body: WebhookBody;
    try {
        body = JSON.parse(rawBody) as WebhookBody;
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const statuses: MetaStatus[] = [];
    const accountChanges: Array<{ field: string; value: Record<string, unknown> }> = [];
    let inbound = 0;
    for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
            if (change.field !== 'messages') {
                if (change.field && change.value) accountChanges.push({ field: change.field, value: change.value });
                continue;
            }
            if (!change.value) continue;
            if (Array.isArray(change.value.statuses)) statuses.push(...change.value.statuses);
            if (Array.isArray(change.value.messages)) inbound += change.value.messages.length;
        }
    }

    try {
        for (const c of accountChanges) await applyAccountEvent(c.field, c.value, Date.now());
        const changed = statuses.length > 0 ? await applyStatuses(statuses) : 0;
        if (inbound > 0) logger.info('[whatsapp-webhook] inbound messages received (not handled in v1):', inbound);
        logger.debug('[whatsapp-webhook] statuses', statuses.length, 'changed', changed);
    } catch (err) {
        logger.error('[whatsapp-webhook] status update failed:', err instanceof Error ? err.message : 'unknown');
        return NextResponse.json({ error: 'Temporary failure' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
