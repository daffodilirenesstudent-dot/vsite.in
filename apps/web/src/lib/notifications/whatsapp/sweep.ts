import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { logger } from '@/lib/platform/logger';
import { notify, type NotificationType } from '@/lib/notifications/notify';
import { PLAN_PRICES_INR } from '@/lib/platform/productFlags';
import { trialEndsMs } from '@/lib/store/trialRules';
import { enqueue, type EnqueueInput } from './outbox';
import { formatDateIST } from './templates';
import { classifyPlanEvent, classifyTrialEvent, isPaid, sweepWindows, type PlanEvent, type TrialEvent } from './windows';

/**
 * The daily sweep: find every store whose trial or paid plan is at a lifecycle
 * moment, and enqueue its message. Sending is the dispatcher's job.
 *
 * Paid-ness comes from `store_expires_at` alone. The Razorpay status column is
 * the activation replay guard and sits at 'created' for owners who opened the
 * Razorpay modal and walked away — exactly the owners who most need a reminder
 * (AGENTS.md, "is the replay guard, NOT is this customer paid").
 * The trial is the store's own `site_subscriptions.trial_ends_at` (migration
 * 058: one free trial per account, NULL for a store opened without one) — the
 * column the shop page enforces, so a message never disagrees with what
 * customers see.
 *
 * Each newly enqueued message also drops an in-app bell notification. Keys are
 * cycle-scoped (`plan_expiring:<site>:<expires_at>`), so re-running the sweep
 * is a no-op and a renewal naturally starts a fresh set of reminders.
 */

const PAGE = 500;
// Keeps the PostgREST .in() URL well under proxy limits (~100 UUIDs = ~4 KB).
const PROFILE_CHUNK = 100;

/** Pages a window query until a short page. Bounded windows keep this small. */
async function pageAll<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, label: string): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await query(from, from + PAGE - 1);
        if (error) throw new Error(`sweep ${label} query failed: ${error.message}`);
        const rows = (data ?? []) as T[];
        out.push(...rows);
        if (rows.length < PAGE) return out;
    }
}
const PRICE = String(PLAN_PRICES_INR.qr_menu);
const LINK = '/manage/subscription';

interface Candidate extends EnqueueInput {
    bell: { type: NotificationType; title: string; body: string };
}

interface TrialSub {
    site_id: string;
    user_id: string;
    store_expires_at: string | null;
    trial_ends_at: string;
    sites: { name: string | null } | Array<{ name: string | null }> | null;
}

interface PlanSub {
    site_id: string;
    user_id: string;
    store_expires_at: string;
    sites: { name: string | null } | Array<{ name: string | null }> | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const shopName = (name: string | null | undefined) => (name && name.trim()) || 'your store';

function trialCandidate(sub: TrialSub, event: TrialEvent): Candidate {
    const name = shopName(one(sub.sites)?.name);
    const endsOn = formatDateIST(sub.trial_ends_at);
    const base = { key: `${event}:${sub.site_id}`, userId: sub.user_id, siteId: sub.site_id };
    if (event === 'trial_ending') {
        return {
            ...base, event, params: { shopName: name, trialEndsOn: endsOn, priceInr: PRICE },
            bell: { type: 'trial_ending', title: 'Your free trial ends soon', body: `${name}: trial ends on ${endsOn}. Activate your plan to keep your menu live.` },
        };
    }
    return {
        ...base, event, params: { shopName: name, priceInr: PRICE },
        bell: { type: 'trial_expired', title: 'Your free trial has ended', body: `${name} is offline. Activate your plan to bring it back.` },
    };
}

function planCandidate(sub: PlanSub, event: PlanEvent): Candidate {
    const name = shopName(one(sub.sites)?.name);
    const expiresOn = formatDateIST(sub.store_expires_at);
    const base = {
        key: `${event}:${sub.site_id}:${sub.store_expires_at}`,
        userId: sub.user_id, siteId: sub.site_id, event,
        params: { shopName: name, expiresOn, expiresAt: sub.store_expires_at },
    };
    if (event === 'plan_expired') {
        return { ...base, bell: { type: 'plan_expired', title: 'Your plan has expired', body: `${name} is offline. Renew to bring it back.` } };
    }
    const when = event === 'plan_expires_today' ? 'today' : `on ${expiresOn}`;
    return { ...base, bell: { type: 'plan_expiring', title: 'Your plan is about to expire', body: `${name}: plan expires ${when}. Renew to stay live.` } };
}

export async function runSweep(nowMs: number = Date.now()): Promise<{ considered: number; enqueued: number }> {
    const w = sweepWindows(nowMs);

    const [trialSubs, planSubs] = await Promise.all([
        pageAll<TrialSub>((from, to) => supabaseServer
            .from('site_subscriptions')
            .select('site_id, user_id, store_expires_at, trial_ends_at, sites!inner(name)')
            .gt('trial_ends_at', w.trialEnds.gt)
            .lte('trial_ends_at', w.trialEnds.lte)
            .order('site_id', { ascending: true })
            .range(from, to), 'trial'),
        pageAll<PlanSub>((from, to) => supabaseServer
            .from('site_subscriptions')
            .select('site_id, user_id, store_expires_at, sites!inner(name)')
            .gt('store_expires_at', w.planExpires.gt)
            .lte('store_expires_at', w.planExpires.lte)
            .order('site_id', { ascending: true })
            .range(from, to), 'plan'),
    ]);

    const candidates: Candidate[] = [];
    for (const sub of trialSubs) {
        if (isPaid(sub.store_expires_at, nowMs)) continue;
        const event = classifyTrialEvent(trialEndsMs(sub), nowMs);
        if (event) candidates.push(trialCandidate(sub, event));
    }
    for (const sub of planSubs) {
        const event = classifyPlanEvent(Date.parse(sub.store_expires_at), nowMs);
        if (event) candidates.push(planCandidate(sub, event));
    }
    if (candidates.length === 0) return { considered: 0, enqueued: 0 };

    // One query per 100 owners instead of one per store.
    const userIds = Array.from(new Set(candidates.map(c => c.userId)));
    const phones = new Map<string, string | null>();
    for (let i = 0; i < userIds.length; i += PROFILE_CHUNK) {
        const { data: profiles, error: profErr } = await supabaseServer
            .from('profiles')
            .select('id, phone_number')
            .in('id', userIds.slice(i, i + PROFILE_CHUNK));
        if (profErr) throw new Error(`sweep profiles query failed: ${profErr.message}`);
        for (const p of profiles ?? []) {
            const r = p as { id: string; phone_number: string | null };
            phones.set(r.id, r.phone_number);
        }
    }

    let enqueued = 0;
    for (const { bell, ...input } of candidates) {
        try {
            const id = await enqueue({ ...input, phone: phones.get(input.userId) ?? null });
            if (!id) continue; // already handled on an earlier run
            enqueued++;
            notify({ userId: input.userId, siteId: input.siteId, type: bell.type, title: bell.title, body: bell.body, link: LINK });
        } catch (err) {
            logger.error('[whatsapp/sweep] enqueue failed:', input.key, err instanceof Error ? err.message : 'unknown');
        }
    }
    return { considered: candidates.length, enqueued };
}
