/**
 * Product freeze flags — single source of truth for which plans are live.
 *
 * vsite currently sells ONE product: the Smart QR Menu (`qr_menu`, ₹299/mo)
 * on a 7-day free trial. The two QR-ordering products are frozen, not deleted:
 *
 *   qr_order  — QR ordering without payment  (₹499)
 *   pay_eat   — QR ordering with payment     (₹699)
 *
 * ─── TO UNFREEZE ─────────────────────────────────────────────────────────
 * Flip ORDERING_FROZEN to false and redeploy. Nothing else needs changing:
 * every gate in the app reads from this module.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * This module is CLIENT-SAFE. It must never import `@/lib/supabase-server`
 * (which is `server-only`) or `next/server`, because PlanContext — a client
 * component — imports it. The 403 helper for route handlers therefore lives
 * separately in `@/lib/frozenResponse`.
 */

/**
 * The `: boolean` annotation is deliberate and required. Without it TypeScript
 * narrows the type to the literal `true`, which makes the body of every
 * `if (ORDERING_FROZEN) return frozenResponse();` guard provably unreachable —
 * lint and `strict` would then flag ~20 route handlers as dead code, and
 * SELLABLE_PLANS below would type as the true-branch only.
 *
 * Deliberately a hardcoded constant rather than an env var: a missing
 * NEXT_PUBLIC_* on a fresh deployment would silently UNFREEZE the products.
 * A constant fails closed.
 */
export const ORDERING_FROZEN: boolean = true;

/**
 * Per-store AI page allowance (onboarding 15 per store; bulk upload 2 for the
 * whole trial, 5 per billing month once paid). See `@/lib/menu/aiPageLimits`.
 *
 * OFF: onboarding and bulk upload behave exactly as before the feature.
 * Same `: boolean` reasoning and constant-not-env reasoning as ORDERING_FROZEN.
 */
export const AI_PAGE_LIMITS: boolean = false;

/** 7-day free trial, measured from `sites.created_at`. */
export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/** Canonical plan slugs. `base` and `pro` are legacy aliases still present in prod rows. */
export type Plan = 'qr_menu' | 'base' | 'qr_order' | 'pro' | 'pay_eat';

/** Monthly price in INR. Kept for all plans so unfreezing needs no price archaeology. */
export const PLAN_PRICES_INR: Record<string, number> = {
    qr_menu: 299,
    qr_order: 499,
    pay_eat: 699,
};

/** Plans a user is allowed to purchase right now. */
export const SELLABLE_PLANS: readonly string[] = ORDERING_FROZEN
    ? ['qr_menu']
    : Object.keys(PLAN_PRICES_INR);

/** The ordering products, by every slug they appear under in production. */
const ORDERING_PLANS = new Set<string>(['qr_order', 'pay_eat', 'pro']);

/** True if the stored plan is one of the frozen ordering products. */
export function isOrderingPlan(stored: string | null | undefined): boolean {
    return ORDERING_PLANS.has(stored ?? '');
}

/**
 * Resolves a stored `site_subscriptions.store_plan` into the plan the app
 * should actually behave as.
 *
 * While frozen, EVERY store reads as `qr_menu` regardless of what it paid for.
 * This is the single normalization point that collapses the three products
 * into one — both the dashboard (via PlanContext) and the public menu
 * (via shop/[slug]) run everything through it.
 *
 * Note this deliberately does not mutate the database: the stored plan stays
 * intact so an ordering customer's real subscription is still visible on the
 * billing screen, and so unfreezing restores them automatically.
 */
export function normalizePlan(stored: string | null | undefined): Plan {
    const plan = (stored ?? 'qr_menu') as Plan;
    if (ORDERING_FROZEN && isOrderingPlan(plan)) return 'qr_menu';
    return plan;
}

/** True when a purchase request for this plan should be refused. */
export function isPlanSellable(plan: string): boolean {
    return SELLABLE_PLANS.includes(plan);
}
