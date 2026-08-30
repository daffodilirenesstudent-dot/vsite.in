/**
 * The billing promise, in one place.
 *
 * vsite's billing model is unusual enough that describing it loosely produces
 * claims that are simply false. It is NOT a subscription in the autopay sense:
 * `/api/subscription/create-subscription` uses the Razorpay **Orders** API, so
 * there is no card mandate and no stored payment instrument. The owner pays for
 * one 30-day period at a time, by hand, each time.
 *
 * Two consequences that copy keeps getting wrong:
 *
 *   1. There is nothing to cancel. Not renewing IS the cancellation — no
 *      recurring charge exists to stop. Earlier copy on /terms, /pricing and
 *      the footer promised a "cancel from your dashboard" control; no such
 *      control exists anywhere in /manage, and none needs to.
 *   2. Expiry is a hard stop, not a grace period. `PlanContext.canGoLive` and
 *      the public shop page both read `store_expires_at > now`, so the menu
 *      stops serving the moment the period ends.
 *
 * Anything that describes payment to a customer should read from here. When the
 * billing model changes, this file is the list of copy that changes with it.
 *
 * CLIENT-SAFE: no server-only imports.
 */

import { PLAN_PRICES_INR, TRIAL_DURATION_MS } from '@/lib/platform/productFlags';

/**
 * Review date for /terms and /privacy.
 *
 * Both pages read this rather than carrying their own hardcoded month, which is
 * how they ended up four months stale while claiming to be current.
 */
export const POLICY_LAST_UPDATED = 'August 2026';

/** Length of one paid period. Mirrors the 30-day window verify-payment writes. */
export const BILLING_CYCLE_DAYS = 30;

/** Free trial length, derived so it can never drift from the enforced value. */
export const TRIAL_DAYS = Math.round(TRIAL_DURATION_MS / (24 * 60 * 60 * 1000));

/** The one sellable price. */
export const PLAN_PRICE_INR = PLAN_PRICES_INR.qr_menu;

/** Days before expiry that the reminder email goes out — see /api/cron/expiry-reminder. */
export const REMINDER_DAYS_BEFORE = 3;

/**
 * Why there is no cancel button.
 *
 * Written as a positive instruction rather than an apology: the owner is being
 * told how to stop, not told that a feature is missing.
 */
export const HOW_TO_STOP =
    `There is no card on file and no automatic charge, so there is nothing to cancel. ` +
    `To stop using vsite, simply do not renew — when your ${BILLING_CYCLE_DAYS}-day period ends, ` +
    `your menu goes offline and you are never billed again.`;

/** The refund position, stated once. */
export const NO_REFUND_POLICY =
    `Payments are non-refundable. Each payment buys one ${BILLING_CYCLE_DAYS}-day period of ` +
    `service in advance, and we do not refund a period once it has started — including if you ` +
    `stop using vsite partway through it. You keep full access until the day it ends.`;

/** Short form for checkout and pricing, where the long form will not fit. */
export const NO_REFUND_SHORT = `Payments are non-refundable · No auto-renewal`;

/**
 * What actually happens across one period.
 *
 * A real sequence with real dates attached, which is why /terms renders it as a
 * numbered timeline rather than prose: the reader's actual question is "what
 * happens to my menu and when", and the answer is ordered.
 */
export const BILLING_CYCLE_STEPS = [
    {
        day: 'Day 0',
        title: `You pay ₹${PLAN_PRICE_INR}`,
        body: `Your menu goes live immediately for ${BILLING_CYCLE_DAYS} days. Pay by UPI, card or netbanking through Razorpay. No card is stored.`,
    },
    {
        day: `Day ${BILLING_CYCLE_DAYS - REMINDER_DAYS_BEFORE}`,
        title: 'We email you a reminder',
        body: `${REMINDER_DAYS_BEFORE} days before the period ends, we email the addresses on your account so the date never arrives as a surprise.`,
    },
    {
        day: `Day ${BILLING_CYCLE_DAYS}`,
        title: 'The period ends',
        body: 'Nothing is charged automatically. Pay again to continue, or do nothing to stop.',
    },
    {
        day: 'If unpaid',
        title: 'Your menu goes offline',
        body: 'Customers scanning your QR code see an "unavailable" page instead of your menu. Your account, menu and photos are kept — paying again brings everything straight back.',
    },
] as const;
