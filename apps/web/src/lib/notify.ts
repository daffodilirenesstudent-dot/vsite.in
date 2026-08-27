import 'server-only';
import { supabaseServer } from './supabase-server';

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
    .then(({ error }) => {
      if (error) console.error('[notify] insert failed:', input.type, error);
    });
}
