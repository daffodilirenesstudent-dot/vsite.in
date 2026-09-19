import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { TRIAL_DURATION_MS } from '@/lib/platform/productFlags';

// Whether a user may create another store.
//
// Moved verbatim out of `onboarding/complete` so the extract route can ask the
// same question BEFORE it spends on AI. Previously a user already at the limit
// could scan a full menu — paying for every GPT-4o call — and only be refused
// at launch. One definition, two call sites: the limits cannot drift apart.

export const TRIAL_STORE_LIMIT = 2;
export const PAID_STORE_LIMIT = 5;

export type Eligibility =
  | { ok: true }
  | { ok: false; status: 403 | 503; error: string; code: 'PLAN_LIMIT' | 'TRIAL_LIMIT' | 'ELIGIBILITY_UNAVAILABLE' };

export async function checkStoreEligibility(userId: string): Promise<Eligibility> {
  const { data: existingSites, error: existingSitesError } = await supabaseServer
    .from('sites')
    .select('id, created_at, site_subscriptions(store_expires_at)')
    .eq('user_id', userId);

  // Fail CLOSED. The error was previously discarded, so a failed query left
  // `existingSites` null, `totalSites` computed as 0, and both the 5-store
  // and 2-trial-store caps were skipped — a DB blip (or anything that could
  // induce one) granted unlimited stores. Refusing to create a store during
  // an outage is recoverable; silently lifting the limit is not.
  if (existingSitesError) {
    console.error('[storeEligibility] could not read existing sites:', existingSitesError);
    return {
      ok: false, status: 503, code: 'ELIGIBILITY_UNAVAILABLE',
      error: 'Could not verify your existing stores. Please try again in a moment.',
    };
  }

  const nowMs = Date.now();
  const totalSites = existingSites?.length ?? 0;
  const trialSites = (existingSites ?? []).filter(s => {
    const rawSub = (s as unknown as { site_subscriptions: unknown }).site_subscriptions;
    const sub = (Array.isArray(rawSub) ? rawSub[0] : rawSub) as
      | { store_expires_at: string | null } | null | undefined;
    const paidExpiry = sub?.store_expires_at ? new Date(sub.store_expires_at).getTime() : 0;
    if (paidExpiry > nowMs) return false;
    const trialEnd = new Date((s as { created_at: string }).created_at).getTime() + TRIAL_DURATION_MS;
    return trialEnd > nowMs;
  }).length;

  if (totalSites >= PAID_STORE_LIMIT) {
    return {
      ok: false, status: 403, code: 'PLAN_LIMIT',
      error: `You have reached the maximum of ${PAID_STORE_LIMIT} stores on your account.`,
    };
  }
  if (trialSites >= TRIAL_STORE_LIMIT) {
    return {
      ok: false, status: 403, code: 'TRIAL_LIMIT',
      error: `Free trial allows up to ${TRIAL_STORE_LIMIT} stores at once. Activate a plan on an existing store to create more.`,
    };
  }
  return { ok: true };
}
