import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';

// Server-side notification creator. Fire-and-forget — never throws into the
// hot path, so a notification insert failure doesn't break payment activation.

export type NotificationType =
  | 'subscription_activated'
  | 'plan_expiring'
  | 'plan_expired'
  | 'trial_ending'
  | 'trial_expired'
  | 'payment_failed'
  | 'razorpay_connected'
  | 'razorpay_revoked'
  | 'order_paid';

export interface NotifyInput {
  userId:  string;
  siteId?: string | null;
  type:    NotificationType;
  title:   string;
  body?:   string;
  link?:   string;
}

export function notify(input: NotifyInput): void {
  supabaseServer
    .from('notifications')
    .insert({
      user_id: input.userId,
      site_id: input.siteId ?? null,
      type:    input.type,
      title:   input.title,
      body:    input.body ?? null,
      link:    input.link ?? null,
    })
    .then(
      ({ error }) => {
        if (error) console.error('[notify] insert failed:', input.type, error);
      },
      // ── This second argument is load-bearing ────────────────────────────
      // `{ error }` above only ever carries a PostgREST error, which arrives
      // in band on a RESOLVED promise. A transport failure — DNS, TCP reset,
      // TLS, Supabase restarting mid-request — REJECTS instead. Nobody awaits
      // this chain (that is the point of it), so with no rejection handler
      // that is an unhandled rejection, and Node has exited on those by
      // default since v15.
      //
      // verify-payment calls notify() un-awaited right after it activates a
      // paid plan, and `.do/app.yaml` runs a single instance — so the blast
      // radius of one dropped connection here is every QR menu on the
      // platform going dark until the container restarts.
      //
      // NOTE: it must be `then`'s second argument, not `.catch()`.
      // PostgrestBuilder only `implements PromiseLike`; it has no `.catch`.
      (err) => {
        console.error('[notify] insert rejected:', input.type, err);
      },
    );
}
