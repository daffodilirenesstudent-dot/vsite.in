import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';
import { logger } from '@/lib/platform/logger';
import { notify, type NotificationType } from '@/lib/notifications/notify';
import { PLAN_PRICES_INR, TRIAL_DURATION_MS } from '@/lib/platform/productFlags';
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
 * The trial is TRIAL_DURATION_MS from `sites.created_at`, the same rule the
 * shop page enforces, so a message can never disagree with what customers see.
 *
 * Each newly enqueued message also drops an in-app bell notification. Keys are
 * cycle-scoped (`plan_expiring:<site>:<expires_at>`), so re-running the sweep
 * is a no-op and a renewal naturally starts a fresh set of reminders.
 */

const QUERY_CAP = 1000;
const PRICE = String(PLAN_PRICES_INR.qr_menu);
const LINK = '/manage/subscription';

interface Candidate extends EnqueueInput {
    bell: { type: NotificationType; title: string; body: string };
}

type SubEmbed = { store_expires_at: string | null };

interface TrialSite {
    id: string;
    user_id: string;
    name: string | null;
    created_at: string;
    site_subscriptions: SubEmbed | SubEmbed[] | null;
}

interface PlanSub {
    site_id: string;
    user_id: string;
    store_expires_at: string;
    sites: { name: string | null } | Array<{ name: string | null }> | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const shopName = (name: string | null | undefined) => (name && name.trim()) || 'your store';

function trialCandidate(site: TrialSite, event: TrialEvent): Candidate {
    const name = shopName(site.name);
    const endsOn = formatDateIST(Date.parse(site.created_at) + TRIAL_DURATION_MS);
    const base = { key: `${event}:${site.id}`, userId: site.user_id, siteId: site.id };
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
    const w = sweepWindows(nowMs, TRIAL_DURATION_MS);

    const [trialRes, planRes] = await Promise.all([
        supabaseServer
            .from('sites')
            .select('id, user_id, name, created_at, site_subscriptions(store_expires_at)')
            .gt('created_at', w.trialCreated.gt)
            .lte('created_at', w.trialCreated.lte)
            .limit(QUERY_CAP),
        supabaseServer
            .from('site_subscriptions')
            .select('site_id, user_id, store_expires_at, sites!inner(name)')
            .gt('store_expires_at', w.planExpires.gt)
            .lte('store_expires_at', w.planExpires.lte)
            .limit(QUERY_CAP),
    ]);
    if (trialRes.error) throw new Error(`sweep trial query failed: ${trialRes.error.message}`);
    if (planRes.error) throw new Error(`sweep plan query failed: ${planRes.error.message}`);

    const trialSites = (trialRes.data ?? []) as unknown as TrialSite[];
    const planSubs = (planRes.data ?? []) as unknown as PlanSub[];
    if (trialSites.length >= QUERY_CAP || planSubs.length >= QUERY_CAP) {
        logger.warn('[whatsapp/sweep] query cap reached — some stores wait for the next run');
    }

    const candidates: Candidate[] = [];
    for (const site of trialSites) {
        if (isPaid(one(site.site_subscriptions)?.store_expires_at, nowMs)) continue;
        const event = classifyTrialEvent(Date.parse(site.created_at), nowMs, TRIAL_DURATION_MS);
        if (event) candidates.push(trialCandidate(site, event));
    }
    for (const sub of planSubs) {
        const event = classifyPlanEvent(Date.parse(sub.store_expires_at), nowMs);
        if (event) candidates.push(planCandidate(sub, event));
    }
    if (candidates.length === 0) return { considered: 0, enqueued: 0 };

    // One query for every owner's number instead of one per store.
    const userIds = Array.from(new Set(candidates.map(c => c.userId)));
    const { data: profiles, error: profErr } = await supabaseServer
        .from('profiles')
        .select('id, phone_number')
        .in('id', userIds);
    if (profErr) throw new Error(`sweep profiles query failed: ${profErr.message}`);
    const phones = new Map((profiles ?? []).map(p => {
        const r = p as { id: string; phone_number: string | null };
        return [r.id, r.phone_number] as const;
    }));

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
