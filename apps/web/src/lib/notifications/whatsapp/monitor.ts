/**
 * The one Sentry Cron Monitor (free plan allows one). pg_cron calls dispatch
 * every 10 minutes; if a check-in is missed by 5 minutes, Sentry emails.
 * The daily run is covered by the watchdog's heartbeat check instead.
 */
export const DISPATCH_MONITOR = {
    slug: 'whatsapp-dispatch',
    config: { schedule: { type: 'crontab', value: '*/10 * * * *' }, checkinMargin: 5, maxRuntime: 2, timezone: 'Etc/UTC' },
} as const;
