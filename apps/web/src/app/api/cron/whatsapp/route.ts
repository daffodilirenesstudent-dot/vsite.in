// GET|POST /api/cron/whatsapp[?task=sweep|dispatch]
//
// The WhatsApp notification job. Scheduled by Supabase pg_cron + pg_net (see
// supabase/migrations/063_whatsapp_cron.sql), not by App Platform: `.do/app.yaml`
// jobs are PRE_DEPLOY and run once per deploy, never on a clock.
//
//   (no task)       — daily, 10:00 IST: sweep for due trial/plan messages, then send.
//   ?task=dispatch  — every 10 minutes: send queued rows and due retries only.
//                     Retries back off in minutes, so a daily-only dispatcher
//                     would turn a 5-minute Meta blip into a one-day delay.
//
// Auth: shared `authorizeCron` (Bearer CRON_SECRET), fails closed.
// The response carries counts only — never phone numbers or message content.

import { NextRequest, NextResponse } from 'next/server';
import { authorizeCron } from '@/lib/platform/cronAuth';
import { runSweep } from '@/lib/notifications/whatsapp/sweep';
import { dispatchDue } from '@/lib/notifications/whatsapp/outbox';
import { logger } from '@/lib/platform/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

async function handle(req: NextRequest) {
    if (!authorizeCron(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const task = req.nextUrl.searchParams.get('task');

    try {
        const sweep = task === 'dispatch' ? { considered: 0, enqueued: 0 } : await runSweep();
        const dispatch = task === 'sweep'
            ? { configured: true, attempted: 0, sent: 0, failed: 0, dead: 0, skipped: 0, paused: 0, reclaimed: 0 }
            : await dispatchDue({ deadlineMs: 45_000 });
        const summary = { ...sweep, ...dispatch };
        logger.info('[cron/whatsapp]', task ?? 'all', JSON.stringify(summary));
        if (!dispatch.configured) logger.warn('[cron/whatsapp] WhatsApp is not configured — rows stay queued');
        return NextResponse.json({ success: true, ...summary });
    } catch (err) {
        console.error('[cron/whatsapp] failed:', err instanceof Error ? err.message : 'unknown');
        return NextResponse.json({ error: 'WhatsApp job failed', code: 'WHATSAPP_CRON_FAILED' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
