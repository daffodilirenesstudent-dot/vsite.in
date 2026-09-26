import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { STORE_LIMIT, decideStoreCreation, type StoreRefusal } from '@/lib/store/trialRules';

// Whether a user may create another store — and whether it gets a trial.
//
// One definition, asked by /api/onboarding/extract (before any AI is spent),
// /api/onboarding/complete (before the store is inserted) and
// /api/onboarding/eligibility (so the app can ask the owner first). The rule
// itself is lib/store/trialRules.ts; the database enforces the same rule on
// insert (migrations 058/059), so this is the early, friendly answer.
//
// "Trial used" is the account's row in trial_claims — not "has a store": a
// deleted trial store still used the trial, and the claim outlives it.

export type Eligibility =
  | { ok: true; trial: boolean }
  | { ok: false; status: 403 | 503; error: string; code: StoreRefusal | 'ELIGIBILITY_UNAVAILABLE' };

interface AccountStanding {
  storeCount: number;
  trialUsed: boolean;
  trialSiteId: string | null;
}

const UNAVAILABLE = {
  ok: false as const, status: 503 as const, code: 'ELIGIBILITY_UNAVAILABLE' as const,
  error: 'Could not verify your existing stores. Please try again in a moment.',
};

async function readStanding(userId: string): Promise<AccountStanding | null> {
  // trial_claims is keyed by user_id, so this list has at most one row.
  const [sites, claims] = await Promise.all([
    supabaseServer.from('sites').select('id').eq('user_id', userId),
    supabaseServer.from('trial_claims').select('site_id').eq('user_id', userId),
  ]);
  // Fail CLOSED. A failed read once left the counts at 0 and lifted every
  // limit; refusing to create a store during an outage is recoverable.
  if (sites.error || claims.error) {
    console.error('[storeEligibility] could not read the account:', sites.error ?? claims.error);
    return null;
  }
  const claim = (claims.data?.[0] ?? null) as { site_id?: string | null } | null;
  return {
    storeCount: sites.data?.length ?? 0,
    trialUsed: claim !== null,
    trialSiteId: claim?.site_id ?? null,
  };
}

export async function checkStoreEligibility(userId: string, opts: { paidConsent: boolean }): Promise<Eligibility> {
  const standing = await readStanding(userId);
  if (!standing) return UNAVAILABLE;
  const decision = decideStoreCreation({ storeCount: standing.storeCount, trialUsed: standing.trialUsed, paidConsent: opts.paidConsent });
  if (!decision.ok) return { ok: false, status: 403, code: decision.code, error: decision.error };
  return { ok: true, trial: decision.trial };
}

/** Where the account stands, for the app to show before anything is built. */
export async function readStoreEligibility(userId: string): Promise<
  | { ok: true; storeCount: number; storeLimit: number; canCreate: boolean; trialAvailable: boolean; trialStoreName: string | null }
  | typeof UNAVAILABLE
> {
  const standing = await readStanding(userId);
  if (!standing) return UNAVAILABLE;
  let trialStoreName: string | null = null;
  if (standing.trialSiteId) {
    const { data } = await supabaseServer.from('sites').select('name').eq('id', standing.trialSiteId).maybeSingle();
    trialStoreName = (data as { name: string | null } | null)?.name ?? null;
  }
  return {
    ok: true,
    storeCount: standing.storeCount,
    storeLimit: STORE_LIMIT,
    canCreate: standing.storeCount < STORE_LIMIT,
    trialAvailable: !standing.trialUsed,
    trialStoreName,
  };
}
