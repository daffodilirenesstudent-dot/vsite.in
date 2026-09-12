// /api/cron/expiry-reminder
//
// Daily job: finds site_subscriptions whose store_expires_at falls inside the
// next ~3 days AND haven't already had a reminder sent for the current cycle,
// then sends a "your plan ends on {date}" email to each store's
// notification_emails list.
//
// Designed to be invoked once every 24h. Safe to run more often — the
// expiry_reminder_sent_at flag dedupes per billing cycle, and is cleared on
// every plan activation/renewal in verify-payment + the razorpay webhook.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`, via the shared `authorizeCron`.
// This route previously ALSO accepted any request carrying an `x-vercel-cron`
// header, which on DigitalOcean (where vsite actually runs) meant no auth at
// all. See @/lib/platform/cronAuth for the full account.
//
// Wire-up: the DigitalOcean job in `.do/app.yaml` curls this URL with the bearer
// header. Any scheduler that can set a header works; nothing platform-specific
// is honoured.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { sendExpiryReminderEmail } from '@/lib/notifications/email/planEmails';
import { authorizeCron } from '@/lib/platform/cronAuth';
import { logger } from '@/lib/platform/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Reminder window: subscriptions expiring within REMINDER_DAYS from now.
// 3 full days + a small slack so a job that runs at the same wall-clock time
// each day doesn't miss anything to off-by-a-few-minutes drift.
const REMINDER_DAYS = 3;
const WINDOW_SLACK_HOURS = 6;

interface ExpiringRow {
  site_id: string;
  user_id: string;
  store_plan: string;
  store_expires_at: string;
  sites: { name: string; notification_emails: string[] | null } | null;
}

async function runReminderSweep() {
  const nowMs = Date.now();
  const windowEnd = new Date(nowMs + (REMINDER_DAYS * 24 + WINDOW_SLACK_HOURS) * 60 * 60_000).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  // Select active subscriptions ending inside the reminder window that haven't
  // been reminded for this billing cycle. Joining sites in the same query
  // avoids an N+1 lookup per row.
  const { data, error } = await supabaseServer
    .from('site_subscriptions')
    .select('site_id, user_id, store_plan, store_expires_at, sites!inner(name, notification_emails)')
    .eq('razorpay_status', 'active')
    .is('expiry_reminder_sent_at', null)
    .gt('store_expires_at', nowIso)
    .lt('store_expires_at', windowEnd);

  if (error) {
    console.error('[cron/expiry-reminder] query failed:', error);
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as unknown as ExpiringRow[];
  if (rows.length === 0) return { ok: true, scanned: 0, sent: 0 };

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const site = row.sites;
    const recipients = (site?.notification_emails ?? []).map(s => s.trim()).filter(Boolean);
    if (!site || recipients.length === 0) {
      // No emails configured for this store — mark sent so we don't keep
      // re-scanning the same row every day until renewal.
      await supabaseServer
        .from('site_subscriptions')
        .update({ expiry_reminder_sent_at: new Date().toISOString() })
        .eq('site_id', row.site_id);
      skipped++;
      continue;
    }

    const daysLeft = Math.max(1, Math.ceil((new Date(row.store_expires_at).getTime() - nowMs) / (24 * 60 * 60_000)));
    const result = await sendExpiryReminderEmail({
      recipients: recipients.map(address => ({ address, name: site.name })),
      shopName: site.name,
      plan: row.store_plan,
      expiresAt: row.store_expires_at,
      daysLeft,
    });

    if (result.ok) {
      await supabaseServer
        .from('site_subscriptions')
        .update({ expiry_reminder_sent_at: new Date().toISOString() })
        .eq('site_id', row.site_id);
      sent++;
    } else {
      // Don't mark sent on failure — let the next sweep retry.
      failures.push(`${row.site_id}: ${result.error ?? 'unknown'}`);
    }
  }

  return { ok: true, scanned: rows.length, sent, skipped, failures };
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runReminderSweep();

  // The sweep's numbers go to the log, not the response body. `scanned` is a
  // live count of subscriptions expiring in the next three days and `failures`
  // carries site ids — a churn dashboard for anyone who reaches this route.
  // The caller is a scheduler; it needs to know the job ran, nothing more.
  logger.info('[cron/expiry-reminder]', JSON.stringify(result));
  return NextResponse.json({ ok: result.ok });
}

// Some cron services prefer POST; accept both for flexibility.
export async function POST(req: NextRequest) {
  return GET(req);
}
