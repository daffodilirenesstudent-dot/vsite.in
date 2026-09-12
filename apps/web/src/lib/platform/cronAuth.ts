import crypto from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * The single authentication gate for every `/api/cron/*` route.
 *
 * ─── WHY THIS IS SHARED ──────────────────────────────────────────────────────
 * The three cron routes used to each carry their own `isAuthorized`, and the
 * three copies disagreed in ways that were individually easy to miss and
 * collectively a hole (2026-09 assessment, Findings 2 and 5):
 *
 *   process-emails   — correct: failed closed, compared the bearer.
 *   cleanup          — `if (!secret) return true`. A missing env var turned OFF
 *                      authentication on a route that bulk-deletes rows.
 *   expiry-reminder  — `if (req.headers.get('x-vercel-cron')) return true`.
 *
 * That last one is the instructive one. It was not careless: on Vercel the edge
 * strips a client-supplied `x-vercel-cron` before the function sees it, so
 * presence really did imply the platform scheduler. vsite left Vercel. On
 * DigitalOcean App Platform the header is forwarded like any other, so
 * `curl -H 'x-vercel-cron: 1'` authenticated as the scheduler and could fire
 * paid email sends and subscription writes at will.
 *
 * The lesson is not "never trust headers" — it is that a defence which depends
 * on the hosting platform silently stops working when the platform changes, and
 * nothing fails loudly when it does. So: one implementation, one secret, no
 * platform-conditional branches. If a scheduler cannot set an Authorization
 * header, it is the wrong scheduler.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Fails CLOSED. A missing or empty `CRON_SECRET` rejects everything — a cron job
 * that stops running is a visible, recoverable outage; a cron endpoint open to
 * the internet is neither.
 */
export function authorizeCron(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.error('[cronAuth] CRON_SECRET is not set — rejecting every cron request');
        return false;
    }
    return timingSafeEqualStr(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

/**
 * Constant-time string comparison that tolerates unequal lengths.
 *
 * `crypto.timingSafeEqual` throws when its two buffers differ in length, which
 * would turn a wrong-length guess into a 500 and leak the secret's length
 * through the status code. Comparing lengths first leaks only that, and the
 * digest below removes even that: hashing both sides to a fixed 32 bytes makes
 * every comparison the same width regardless of input.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
    const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
    const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
    return crypto.timingSafeEqual(ha, hb);
}
