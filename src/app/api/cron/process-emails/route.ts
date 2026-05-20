// GET /api/cron/process-emails
// Called by Vercel Cron every 2 minutes (configured in vercel.json).
// Processes up to 20 pending emails per run with exponential-backoff retry.
//
// Retry schedule (attempts → next_retry_at delay):
//   0 → immediate, 1 → 2 min, 2 → 4 min, 3 → 8 min, 4 → 16 min
//   After 5 attempts the row is marked 'failed' and stops retrying.
//   Admin can see failed emails in Supabase and replay manually.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';
import { sendEmailDirect } from '@/lib/orderEmail';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';

const BATCH_SIZE      = 20;   // fetch up to 20 per cron tick
const CONCURRENCY     = 5;    // process at most 5 in parallel — prevents DB conn exhaustion
const MAX_ATTEMPTS    = 5;

// Vercel Cron authenticates with CRON_SECRET in the Authorization header.
// Fail CLOSED when secret is missing — never allow open access in production.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/process-emails] CRON_SECRET is not set — rejecting request');
    return false;
  }
  const header = req.headers.get('Authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch a batch of pending emails that are due for retry
  const { data: emails, error: fetchErr } = await supabaseServer
    .from('email_queue')
    .select('id, to_email, subject, htmlbody, attempts')
    .eq('status', 'pending')
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchErr) {
    console.error('[cron/process-emails] fetch:', fetchErr);
    return NextResponse.json({ error: 'Failed to read email queue' }, { status: 500 });
  }

  if (!emails || emails.length === 0) {
    return NextResponse.json({ processed: 0, message: 'Queue empty' });
  }

  let sent = 0;
  let failed = 0;

  // Process in capped-concurrency windows to avoid exhausting DB connections.
  // With CONCURRENCY=5 and BATCH_SIZE=20 we do at most 4 rounds, each with
  // 5 parallel sends + 5 parallel DB updates = 10 connections max at once.
  async function processOne(email: NonNullable<typeof emails>[number]) {
    const attempt = (email.attempts as number) + 1;
    try {
      await sendEmailDirect({
        to:           email.to_email,
        customerName: '',  // name already embedded in htmlbody
        subject:      email.subject,
        htmlbody:     email.htmlbody,
      });
      await supabaseServer
        .from('email_queue')
        .update({ status: 'sent', attempts: attempt })
        .eq('id', email.id);
      sent++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/process-emails] email ${email.id} attempt ${attempt}:`, errMsg);

      if (attempt >= MAX_ATTEMPTS) {
        await supabaseServer
          .from('email_queue')
          .update({ status: 'failed', attempts: attempt, last_error: errMsg })
          .eq('id', email.id);
        failed++;
      } else {
        const backoffMs   = Math.pow(2, attempt) * 60_000;
        const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
        await supabaseServer
          .from('email_queue')
          .update({ attempts: attempt, last_error: errMsg, next_retry_at: nextRetryAt })
          .eq('id', email.id);
      }
    }
  }

  // Chunk the batch and run each chunk in parallel, chunks sequentially.
  for (let i = 0; i < emails.length; i += CONCURRENCY) {
    await Promise.allSettled(emails.slice(i, i + CONCURRENCY).map(processOne));
  }

  return NextResponse.json({ processed: emails.length, sent, failed });
}
