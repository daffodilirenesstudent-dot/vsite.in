// GET /api/cron/cleanup
// Called by Vercel Cron every 5 minutes (configured in vercel.json).
// Deletes expired idempotency keys, stale rate-limit buckets, and old sent emails.
// Keeps the three hardening tables lean without any manual maintenance.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase-server';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.get('Authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabaseServer.rpc('cleanup_hardening_tables');
  if (error) {
    console.error('[cron/cleanup]', error);
    return NextResponse.json({ error: 'Cleanup failed', detail: error.message }, { status: 500 });
  }

  // Fire-and-forget: purge acknowledged bill_requests older than 7 days.
  // Acknowledged rows are inert (never re-surfaced in the UI) but accumulate
  // indefinitely without this. Errors are non-fatal — logged only.
  supabaseServer
    .from('bill_requests')
    .delete()
    .eq('status', 'acknowledged')
    .lt('requested_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .then(({ error: brErr }) => {
      if (brErr) console.error('[cron/cleanup] bill_requests purge:', brErr);
    });

  return NextResponse.json({ ok: true, cleanedAt: new Date().toISOString() });
}
