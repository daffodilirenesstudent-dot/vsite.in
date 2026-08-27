// Date-range filter — shared resolver for /insights, /transactions, and the UI.
//
// PATTERN: every endpoint and every UI component reads/writes the same `range`
// query param. Resolution happens server-side (so the SAME range key produces
// the same boundaries regardless of which device asks). Boundaries are
// computed in the SITE'S timezone (not server, not user) — same restaurant
// at 11pm Friday in Mumbai is still "today" even if the server is in Virginia.
//
// PRESETS (copied from Stripe/Shopify/Square dashboards):
//   today          — site-tz day start → now
//   yesterday      — site-tz prior day start → site-tz prior day end
//   last7d         — rolling 7 days ending today (today included)
//   last4w         — rolling 28 days ending today
//   month_to_date  — first of this calendar month → now
//   last_month     — first of prior calendar month → last day of prior month
//   custom         — explicit start/end ISO strings in querystring
//
// For each resolved range we also emit a "prior period" of equal length, so
// the UI can show "↑15% vs prior 7d" style comparisons without a second API.

export type RangePreset =
    | 'today'
    | 'yesterday'
    | 'last7d'
    | 'last4w'
    | 'month_to_date'
    | 'last_month'
    | 'custom';

export interface ResolvedRange {
    key:        RangePreset;
    label:      string;          // 'Today', 'Last 7 days', etc.
    start:      Date;            // inclusive lower bound (UTC instant)
    end:        Date;            // exclusive upper bound (UTC instant)
    timezone:   string;          // the site tz used for the boundary math
    /** Period of the SAME length immediately preceding `start`. For deltas. */
    priorStart: Date;
    priorEnd:   Date;
    /** Bucket granularity recommended for charts at this range. */
    bucket:     'hour' | 'day' | 'week' | 'month';
}

const VALID_PRESETS: RangePreset[] = [
    'today','yesterday','last7d','last4w','month_to_date','last_month','custom',
];

export function isPreset(v: unknown): v is RangePreset {
    return typeof v === 'string' && (VALID_PRESETS as string[]).includes(v);
}

/**
 * Start of the local day in `tz`, returned as a UTC Date instant.
 * Lifted from /api/manage/orders/route.ts — keep behaviour identical.
 */
function localDayStart(now: Date, tz: string): Date {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(now);
        const y = parts.find(p => p.type === 'year')!.value;
        const m = parts.find(p => p.type === 'month')!.value;
        const d = parts.find(p => p.type === 'day')!.value;
        const midnightUtc = new Date(`${y}-${m}-${d}T00:00:00Z`);
        const localHour = parseInt(
            new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(midnightUtc),
            10,
        );
        return new Date(midnightUtc.getTime() - localHour * 3_600_000);
    } catch {
        const d = new Date(now);
        d.setUTCHours(0, 0, 0, 0);
        return d;
    }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Add `days` of 24h each (DST-naïve — fine for ranges that don't cross DST in business timezones). */
function addDays(d: Date, days: number): Date { return new Date(d.getTime() + days * MS_PER_DAY); }

/** Start of the calendar month in `tz`, as UTC Date. */
function localMonthStart(now: Date, tz: string): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit',
    }).formatToParts(now);
    const y = parts.find(p => p.type === 'year')!.value;
    const m = parts.find(p => p.type === 'month')!.value;
    const midnightUtc = new Date(`${y}-${m}-01T00:00:00Z`);
    const localHour = parseInt(
        new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(midnightUtc),
        10,
    );
    return new Date(midnightUtc.getTime() - localHour * 3_600_000);
}

function bucketFor(start: Date, end: Date): ResolvedRange['bucket'] {
    const days = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
    if (days <= 1)  return 'hour';
    if (days <= 35) return 'day';
    if (days <= 120) return 'week';
    return 'month';
}

/**
 * Resolve a preset (and optional custom dates) into start/end/prior-period.
 * `now` defaults to `new Date()` so the result is deterministic in tests.
 */
export function resolveRange(
    preset: RangePreset,
    timezone: string,
    opts: { now?: Date; customStart?: string; customEnd?: string } = {},
): ResolvedRange {
    const now      = opts.now ?? new Date();
    const todayStart = localDayStart(now, timezone);
    const tomorrowStart = addDays(todayStart, 1);

    let start: Date, end: Date, label: string;

    switch (preset) {
        case 'today':
            start = todayStart;
            end   = now;             // up to "now" — sliding upper bound
            label = 'Today';
            break;

        case 'yesterday':
            start = addDays(todayStart, -1);
            end   = todayStart;
            label = 'Yesterday';
            break;

        case 'last7d':
            // Rolling 7 days INCLUSIVE of today — boundary is `now`, not end-of-today.
            start = addDays(todayStart, -6);
            end   = now;
            label = 'Last 7 days';
            break;

        case 'last4w':
            start = addDays(todayStart, -27);
            end   = now;
            label = 'Last 4 weeks';
            break;

        case 'month_to_date':
            start = localMonthStart(now, timezone);
            end   = now;
            label = 'Month to date';
            break;

        case 'last_month': {
            const thisMonthStart = localMonthStart(now, timezone);
            // Last month = (this month's start - 1 day) → snap back to its month start.
            const someTimeLastMonth = addDays(thisMonthStart, -1);
            start = localMonthStart(someTimeLastMonth, timezone);
            end   = thisMonthStart;
            label = 'Last month';
            break;
        }

        case 'custom': {
            const cs = opts.customStart ? new Date(opts.customStart) : null;
            const ce = opts.customEnd   ? new Date(opts.customEnd)   : null;
            if (!cs || !ce || isNaN(cs.getTime()) || isNaN(ce.getTime()) || ce <= cs) {
                // Garbage input → fall back to today rather than 500.
                start = todayStart; end = now; label = 'Today (invalid custom range)';
            } else {
                start = cs;
                end   = ce > tomorrowStart ? tomorrowStart : ce; // can't query the future
                label = 'Custom range';
            }
            break;
        }
    }

    // Prior period of identical length — for "vs prior X" deltas.
    const lengthMs = end.getTime() - start.getTime();
    const priorEnd   = start;
    const priorStart = new Date(start.getTime() - lengthMs);

    return {
        key:      preset,
        label,
        start, end, timezone,
        priorStart, priorEnd,
        bucket:   bucketFor(start, end),
    };
}

/**
 * Read range params off a URL's searchParams. Tolerates missing/garbage values
 * by returning the default ('today').
 */
export function rangeFromSearchParams(
    sp: URLSearchParams,
    timezone: string,
): ResolvedRange {
    const presetRaw = sp.get('range') ?? 'today';
    const preset    = isPreset(presetRaw) ? presetRaw : 'today';
    return resolveRange(preset, timezone, {
        customStart: sp.get('start') ?? undefined,
        customEnd:   sp.get('end') ?? undefined,
    });
}

/** Preset chips for the UI — single source of truth so dashboard + transactions match. */
export const PRESETS: { key: RangePreset; label: string }[] = [
    { key: 'today',         label: 'Today' },
    { key: 'yesterday',     label: 'Yesterday' },
    { key: 'last7d',        label: 'Last 7 days' },
    { key: 'last4w',        label: 'Last 4 weeks' },
    { key: 'month_to_date', label: 'This month' },
    { key: 'last_month',    label: 'Last month' },
];
