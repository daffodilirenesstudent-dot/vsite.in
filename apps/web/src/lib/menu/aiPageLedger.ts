// AI page ledger — the durable counter behind `@/lib/menu/aiPageLimits`.
//
// Thin typed wrappers over the RPCs of migration 057. The check-and-charge is
// one conditional UPDATE inside `reserve_ai_pages`, so concurrent requests can
// never together pass the limit, and a restart or redeploy changes nothing:
// no counter lives in this process.
//
// Never throws on a database error. Callers get `reason: 'unavailable'` and
// must refuse the scan (fail closed): no reservation means no AI spend.

import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { ONBOARDING_PAGE_LIMIT, resolveBulkAllowance, type BulkAllowance } from '@/lib/menu/aiPageLimits';
import { logger } from '@/lib/platform/logger';

export type Reservation =
  | { ok: true; bucketId: string; used: number; limit: number }
  | { ok: false; reason: 'limit' | 'not_owner' | 'unavailable'; used: number; limit: number };

export type Usage = { ok: true; used: number; left: number; limit: number } | { ok: false };

/** A query that throws (network, client bug; sync or async) reads the same as one that returned an error. */
async function settle<T>(query: () => PromiseLike<{ data: T; error: unknown }>): Promise<{ data: T | null; error: unknown }> {
  try {
    return (await query()) ?? { data: null, error: 'empty response' };
  } catch (err) {
    return { data: null, error: err ?? 'threw' };
  }
}

interface ReserveRow { ok: boolean; reason: string; bucket_id: string | null; pages_used: number | null; page_limit: number | null }

async function reserve(args: {
  userId: string; kind: 'onboarding' | 'bulk_trial' | 'bulk_paid'; siteId: string | null;
  periodKey: string; periodEndsAt: string | null; limit: number; pages: number;
}): Promise<Reservation> {
  const { data, error } = await settle(() => supabaseServer.rpc('reserve_ai_pages', {
    p_user_id: args.userId,
    p_kind: args.kind,
    p_site_id: args.siteId,
    p_period_key: args.periodKey,
    p_period_ends_at: args.periodEndsAt,
    p_limit: args.limit,
    p_pages: args.pages,
  }));
  const row = (Array.isArray(data) ? data[0] : data) as ReserveRow | null | undefined;
  if (error || !row) {
    logger.error('[aiPageLedger] reserve failed:', error ?? 'no row');
    return { ok: false, reason: 'unavailable', used: 0, limit: args.limit };
  }
  const used = row.pages_used ?? 0;
  if (row.ok && row.bucket_id) return { ok: true, bucketId: row.bucket_id, used, limit: args.limit };
  return { ok: false, reason: row.reason === 'not_owner' ? 'not_owner' : 'limit', used, limit: args.limit };
}

/** Draw `pages` from the user's open onboarding bucket (15 per store). */
export function reserveOnboardingPages(userId: string, pages: number): Promise<Reservation> {
  return reserve({ userId, kind: 'onboarding', siteId: null, periodKey: '', periodEndsAt: null, limit: ONBOARDING_PAGE_LIMIT, pages });
}

/** Draw `pages` from a store's bulk bucket for its current period. */
export async function reserveBulkPages(userId: string, siteId: string, allowance: BulkAllowance, pages: number): Promise<Reservation> {
  if (!allowance.kind) return { ok: false, reason: 'limit', used: 0, limit: 0 };
  return reserve({
    userId, kind: allowance.kind, siteId, periodKey: allowance.periodKey,
    periodEndsAt: allowance.periodEndsAt, limit: allowance.limit, pages,
  });
}

/** Give back pages the AI could not read. Best effort: a failure leaves them counted (the safe direction). */
export async function refundPages(bucketId: string, pages: number): Promise<void> {
  if (pages <= 0) return;
  const { error } = await settle(() => supabaseServer.rpc('refund_ai_pages', { p_bucket_id: bucketId, p_pages: pages }));
  if (error) logger.error('[aiPageLedger] refund failed:', error);
}

/** Tie the user's open onboarding bucket to the store just created. Best effort. */
export async function bindOnboardingPages(userId: string, siteId: string): Promise<void> {
  const { error } = await settle(() => supabaseServer.rpc('bind_onboarding_pages', { p_user_id: userId, p_site_id: siteId }));
  if (error) logger.error('[aiPageLedger] bind failed:', error);
}

async function readUsed(filter: (q: ReturnType<typeof usageQuery>) => ReturnType<typeof usageQuery>): Promise<number | null> {
  const { data, error } = await settle(() => filter(usageQuery()).maybeSingle());
  if (error) {
    logger.error('[aiPageLedger] read failed:', error);
    return null;
  }
  return (data as { pages_used: number } | null)?.pages_used ?? 0;
}

function usageQuery() {
  return supabaseServer.from('ai_page_usage').select('pages_used');
}

/** Pages used and left in the user's open onboarding bucket. Read-only pre-check; the reserve is the gate. */
export async function readOnboardingUsage(userId: string): Promise<Usage> {
  const used = await readUsed(q => q.eq('kind', 'onboarding').eq('user_id', userId).is('site_id', null));
  if (used === null) return { ok: false };
  return { ok: true, used, left: Math.max(0, ONBOARDING_PAGE_LIMIT - used), limit: ONBOARDING_PAGE_LIMIT };
}

/**
 * The bulk allowance of a store the caller owns. `not_found` covers both a
 * missing store and someone else's, so the answer leaks nothing (AC11).
 */
export async function loadStoreAllowance(userId: string, siteId: string): Promise<
  { ok: true; allowance: BulkAllowance } | { ok: false; reason: 'not_found' | 'unavailable' }
> {
  const { data, error } = await settle(() => supabaseServer
    .from('sites')
    .select('id, site_subscriptions(store_expires_at, trial_ends_at)')
    .eq('id', siteId)
    .eq('user_id', userId)
    .maybeSingle());
  if (error) {
    logger.error('[aiPageLedger] store read failed:', error);
    return { ok: false, reason: 'unavailable' };
  }
  if (!data) return { ok: false, reason: 'not_found' };
  const site = data as { site_subscriptions: unknown };
  const rawSub = Array.isArray(site.site_subscriptions) ? site.site_subscriptions[0] : site.site_subscriptions;
  const sub = rawSub as { store_expires_at: string | null; trial_ends_at?: string | null } | null | undefined;
  return {
    ok: true,
    allowance: resolveBulkAllowance({ trialEndsAt: sub?.trial_ends_at ?? null, storeExpiresAt: sub?.store_expires_at ?? null, now: Date.now() }),
  };
}

/** Pages used and left in a store's bulk bucket for its current period. */
export async function readBulkUsage(siteId: string, allowance: BulkAllowance): Promise<Usage> {
  if (!allowance.kind) return { ok: true, used: 0, left: 0, limit: 0 };
  const kind = allowance.kind;
  const used = await readUsed(q => q.eq('site_id', siteId).eq('kind', kind).eq('period_key', allowance.periodKey));
  if (used === null) return { ok: false };
  return { ok: true, used, left: Math.max(0, allowance.limit - used), limit: allowance.limit };
}
