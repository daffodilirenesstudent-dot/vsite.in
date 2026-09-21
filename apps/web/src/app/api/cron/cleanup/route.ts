// GET|POST /api/cron/cleanup
// Deletes expired idempotency keys, stale rate-limit buckets, and old sent emails.
// Keeps the three hardening tables lean without any manual maintenance.
//
// Auth: shared `authorizeCron` — see @/lib/platform/cronAuth. This route used to
// fail OPEN (`if (!secret) return true`), which left a bulk-delete reachable by
// anyone whenever CRON_SECRET was absent (2026-09 assessment, Finding 5).
//
// POST is exported because `.do/app.yaml` invokes this job with `curl -X POST`.
// Only GET existed, so the job had been silently 405-ing.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { authorizeCron } from '@/lib/platform/cronAuth';

export const dynamic    = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabaseServer.rpc('cleanup_hardening_tables');
  if (error) {
    // The Postgres message names functions, columns and constraints. It goes to
    // the log; the caller gets a code it can act on and nothing it can map.
    console.error('[cron/cleanup] rpc failed:', error);
    return NextResponse.json({ error: 'Cleanup failed', code: 'CLEANUP_FAILED' }, { status: 500 });
  }

  // Fire-and-forget: purge acknowledged bill_requests older than 7 days.
  // Acknowledged rows are inert (never re-surfaced in the UI) but accumulate
  // indefinitely without this. Errors are non-fatal — logged only.
  supabaseServer
    .from('bill_requests')
    .delete()
    .eq('status', 'acknowledged')
    .lt('requested_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .then(
      ({ error: brErr }) => {
        if (brErr) console.error('[cron/cleanup] bill_requests purge:', brErr);
      },
      // Nothing awaits this, so a transport-level rejection (as opposed to the
      // PostgREST error above) would be unhandled and would exit the process.
      // Must be then's second argument — PostgrestBuilder has no .catch().
      (brErr) => console.error('[cron/cleanup] bill_requests purge rejected:', brErr),
    );

  return NextResponse.json({ ok: true, cleanedAt: new Date().toISOString() });
}

/** `.do/app.yaml` calls this job with `-X POST`. Same work, same gate. */
export async function POST(req: NextRequest) {
  return GET(req);
}
