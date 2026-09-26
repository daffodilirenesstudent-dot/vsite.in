import { PLAN_PRICES_INR, TRIAL_DURATION_MS } from '@/lib/platform/productFlags';
import { formatPrice } from '@/lib/platform/currency';
import { trialEndsMs as trialEndOf } from '@/lib/store/trialRules';

/**
 * Where a store's plan stands, as one pure rule. The You page's store card and
 * the Plan & bills screen both read it, so they can never disagree.
 *
 * Payment is offered only when nothing is running — no trial, no paid plan.
 * That is today's rule on the subscription page ("Available after trial",
 * "Renew from here once it ends"), kept exactly: the redesign changes how the
 * plan looks, not when an owner can pay.
 *
 * The trial is the store's own `trial_ends_at` (one free trial per account,
 * 2026-09-25) — never `created_at + 7 days`, which an owner can rewrite. A
 * store that never had one ('unpaid') is not live until it is paid for.
 */

export type PlanState = 'trial' | 'active' | 'endingSoon' | 'trialEnded' | 'expired' | 'unpaid';

export interface PlanStatus {
    state: PlanState;
    /** When the trial or plan ends — or ended. */
    endsAt: Date;
    /** Whole days left, rounded up; 0 once it has ended. */
    daysLeft: number;
    /** Share of the current trial or 30-day period used, 0–1. */
    progress: number;
    canPay: boolean;
    price: number;
    /** The pay button's label, or null when there is nothing to pay for. */
    cta: string | null;
}

interface SiteLike {
    created_at: string;
    site_subscriptions?: { store_expires_at?: string | null; trial_ends_at?: string | null } | null;
}

const DAY_MS = 86_400_000;
const PAID_PERIOD_MS = 30 * DAY_MS;
/** A paid plan this close to its end is shown as ending soon. */
export const ENDING_SOON_DAYS = 5;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function planStatus(site: SiteLike, now: number = Date.now()): PlanStatus {
    const price = PLAN_PRICES_INR.qr_menu;
    const expiresMs = site.site_subscriptions?.store_expires_at
        ? new Date(site.site_subscriptions.store_expires_at).getTime()
        : 0;
    const trialEndsMs = trialEndOf(site.site_subscriptions);

    if (expiresMs > now) {
        const daysLeft = Math.ceil((expiresMs - now) / DAY_MS);
        return {
            state: daysLeft <= ENDING_SOON_DAYS ? 'endingSoon' : 'active',
            endsAt: new Date(expiresMs),
            daysLeft,
            progress: clamp01(1 - (expiresMs - now) / PAID_PERIOD_MS),
            canPay: false,
            price,
            cta: null,
        };
    }

    if (trialEndsMs > now) {
        return {
            state: 'trial',
            endsAt: new Date(trialEndsMs),
            daysLeft: Math.ceil((trialEndsMs - now) / DAY_MS),
            progress: clamp01(1 - (trialEndsMs - now) / TRIAL_DURATION_MS),
            canPay: false,
            price,
            cta: null,
        };
    }

    if (expiresMs > 0) {
        return { state: 'expired', endsAt: new Date(expiresMs), daysLeft: 0, progress: 1, canPay: true, price, cta: `Renew — ${formatPrice(price, 'INR')}` };
    }

    if (trialEndsMs > 0) {
        return { state: 'trialEnded', endsAt: new Date(trialEndsMs), daysLeft: 0, progress: 1, canPay: true, price, cta: `Activate — ${formatPrice(price, 'INR')}/month` };
    }

    // Never had a trial, never paid: built, waiting for its first payment.
    return { state: 'unpaid', endsAt: new Date(now), daysLeft: 0, progress: 0, canPay: true, price, cta: `Pay ${formatPrice(price, 'INR')} to go live` };
}

/** "30 Sep" — the short date the owner reads on the card. */
export function shortDate(d: Date): string {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "25 Oct 2026" — for bills and the pay sheet. */
export function longDate(d: Date): string {
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The one-line status a pill shows, and its tone. */
export function planPill(s: PlanStatus): { text: string; tone: 'good' | 'warn' | 'bad' } {
    const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
    switch (s.state) {
        case 'trial':      return { text: `Free trial · ${days(s.daysLeft)} left`, tone: 'warn' };
        case 'active':     return { text: `Active · paid till ${shortDate(s.endsAt)}`, tone: 'good' };
        case 'endingSoon': return { text: `Plan ends in ${days(s.daysLeft)}`, tone: 'warn' };
        case 'trialEnded': return { text: `Free trial ended ${shortDate(s.endsAt)}`, tone: 'bad' };
        case 'expired':    return { text: `Plan ended ${shortDate(s.endsAt)}`, tone: 'bad' };
        case 'unpaid':     return { text: 'Not live yet · pay to go live', tone: 'warn' };
    }
}

/** The quiet line under the status: what happens next, in the owner's terms. */
export function planNextStep(s: PlanStatus): string {
    switch (s.state) {
        case 'trial':      return `You can activate when your trial ends on ${shortDate(s.endsAt)}.`;
        case 'active':     return `You can renew from here once it ends on ${shortDate(s.endsAt)}.`;
        case 'endingSoon': return `Renew from here once it ends on ${shortDate(s.endsAt)}.`;
        case 'trialEnded': return 'Activate to keep your menu live for customers.';
        case 'expired':    return 'Renew to keep your menu live for customers.';
        case 'unpaid':     return 'This store has no free trial. Pay once and its menu goes live for customers.';
    }
}
