// AI page allowance rules — pure and client-safe.
//
// A "page" is one photo or one page of a PDF, read by the AI. Each store gets:
//   • onboarding: 15 pages, once (bound to the store at /onboarding/complete)
//   • bulk upload in trial: 2 pages for the whole trial, never reset
//   • bulk upload once paid: 5 pages per billing month, reset on the payment date
//   • bulk upload after an unpaid trial: 0
//
// The counter itself lives in Postgres (`ai_page_usage`, migration 057, used
// through `@/lib/menu/aiPageLedger`). This file only decides which bucket a
// store is in and how that reads to the owner. It runs in the browser too, so
// it must not import anything server-side.
//
// Paid / trial / expired precedence mirrors PlanContext: a store with
// `store_expires_at` in the future is paid, else a store younger than the
// trial is in trial, else it is expired.


export const ONBOARDING_PAGE_LIMIT = 15;
export const TRIAL_BULK_PAGE_LIMIT = 2;
export const PAID_BULK_PAGE_LIMIT = 5;

/** One billing month. Mirrors the literal `verify-payment` adds per payment. */
export const BILLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export type BulkState = 'trial' | 'paid' | 'expired';

export interface BulkAllowance {
  state: BulkState;
  /** Ledger bucket kind; null when nothing may be reserved. */
  kind: 'bulk_trial' | 'bulk_paid' | null;
  limit: number;
  /** Stable key for the ledger row: 'trial', 'paid:<period end ISO>', or ''. */
  periodKey: string;
  periodEndsAt: string | null;
  /** When the allowance refills (paid only). */
  resetsAt: string | null;
}

/**
 * Which bulk-upload bucket a store is in right now.
 *
 * A paid period is the 30-day slice of time ending at `store_expires_at` that
 * contains `now`. A monthly payment puts the period end on the payment
 * anniversary; an early renewal (expiry pushed 30 days out mid-period) yields
 * the same slice, so paying early cannot be used to reset pages.
 */
export function resolveBulkAllowance(input: {
  /** The store's own trial end (site_subscriptions.trial_ends_at) — null when it never had one. */
  trialEndsAt: string | null;
  storeExpiresAt: string | null;
  now: number;
}): BulkAllowance {
  const { now } = input;
  const expiresMs = input.storeExpiresAt ? new Date(input.storeExpiresAt).getTime() : 0;

  if (expiresMs > now) {
    const k = Math.ceil((expiresMs - now) / BILLING_PERIOD_MS) - 1;
    const periodEnd = new Date(expiresMs - k * BILLING_PERIOD_MS).toISOString();
    return {
      state: 'paid', kind: 'bulk_paid', limit: PAID_BULK_PAGE_LIMIT,
      periodKey: `paid:${periodEnd}`, periodEndsAt: periodEnd, resetsAt: periodEnd,
    };
  }

  // A store created after the account's trial was used has no trial window,
  // so no trial pages: its first payment opens the paid allowance.
  const trialEndMs = input.trialEndsAt ? new Date(input.trialEndsAt).getTime() : NaN;
  if (Number.isFinite(trialEndMs) && trialEndMs > now) {
    return {
      state: 'trial', kind: 'bulk_trial', limit: TRIAL_BULK_PAGE_LIMIT,
      periodKey: 'trial', periodEndsAt: new Date(trialEndMs).toISOString(), resetsAt: null,
    };
  }

  return { state: 'expired', kind: null, limit: 0, periodKey: '', periodEndsAt: null, resetsAt: null };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = 330 * 60 * 1000;

/** "12 Oct", in India time. Hand-rolled so every browser prints the same month name. */
export function formatResetDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const plural = (n: number) => `${n} page${n === 1 ? '' : 's'}`;

/** Can a PDF of `pages` pages go into a scan with `left` pages available? */
export function planBulkPdf(pages: number, left: number): { ok: true } | { ok: false; message: string } {
  if (pages <= left) return { ok: true };
  return {
    ok: false,
    message: `This PDF has ${plural(pages)}. You have ${plural(left)} left. Upload a photo of just the page you need.`,
  };
}

export interface BulkAllowanceView {
  label: string;
  chip: string;
  sub: string;
  canUpload: boolean;
  exhausted: null | { title: string; body: string; cta: { label: string; href: string } | null };
  handAddLabel: string;
}

const PAY = { label: 'Pay ₹299', href: '/manage/subscription' };

/** What the bulk-upload modal shows for an allowance. English only (owner decision). */
export function bulkAllowanceView(a: { state: BulkState; limit: number; left: number; resetsAt: string | null }): BulkAllowanceView {
  const handAddLabel = 'Add items by hand instead';
  const chip = `${a.left} of ${a.limit} left`;

  if (a.state === 'expired') {
    return {
      label: 'AI upload', chip, sub: '', canUpload: false, handAddLabel,
      exhausted: { title: 'Your trial has ended', body: `Pay ₹299 to use AI upload. It gives you ${PAID_BULK_PAGE_LIMIT} pages every month.`, cta: PAY },
    };
  }

  if (a.state === 'trial') {
    return {
      label: 'Free trial pages', chip, handAddLabel,
      sub: a.left > 0 ? `For the whole trial. Pay ₹299 to get ${PAID_BULK_PAGE_LIMIT} pages every month.` : 'All trial pages used.',
      canUpload: a.left > 0,
      exhausted: a.left > 0 ? null : {
        title: 'Trial pages used',
        body: `Pay ₹299 to get ${PAID_BULK_PAGE_LIMIT} pages every month. You can still add items by hand for free.`,
        cta: PAY,
      },
    };
  }

  const date = a.resetsAt ? formatResetDate(a.resetsAt) : '';
  return {
    label: 'Pages this month', chip, handAddLabel,
    sub: date ? `Resets on ${date}` : '',
    canUpload: a.left > 0,
    exhausted: a.left > 0 ? null : {
      title: 'Monthly pages used',
      body: `You get ${PAID_BULK_PAGE_LIMIT} new pages on ${date}. Until then, add items by hand.`,
      cta: null,
    },
  };
}
