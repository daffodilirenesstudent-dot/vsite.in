import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/platform/logger';

/**
 * Every QR-poster failure is reported, never swallowed.
 *
 * The poster failed on phones twice (2026-09-27, 2026-10-03) and both times the
 * page caught the error with a bare `catch {}`: nothing in Sentry, nothing in a
 * log, only an owner's screenshot. With a stage tag and Sentry's
 * replay-on-error, the next failure arrives with its cause, its browser and a
 * replay of the session.
 *
 * Reports at most once per stage per page load, so a failing thumbnail loop
 * cannot spend the free plan's event budget.
 */

export type PosterStage =
    | 'preview' | 'thumbnail' | 'pdf' | 'status' | 'qr-download'   // what the owner tried
    | 'art' | 'fonts' | 'qr' | 'export';                            // which part failed

const reported = new Set<PosterStage>();

/** An <img> onerror rejects with an Event; make it an Error that names the file. */
export function toError(e: unknown): Error {
    if (e instanceof Error) return e;
    if (e && typeof e === 'object' && 'type' in e) {
        const src = (e as { target?: { src?: unknown } }).target?.src;
        return new Error(`${String((e as { type: unknown }).type)} event${typeof src === 'string' ? ` loading ${src}` : ''}`);
    }
    return new Error(String(e));
}

export function reportPosterIssue(stage: PosterStage, error: unknown, extra: Record<string, string | number | boolean> = {}): void {
    const err = toError(error);
    logger.warn('[qr-poster]', stage, err.message);
    if (reported.has(stage)) return;
    reported.add(stage);
    Sentry.captureException(err, { tags: { area: 'qr-poster', stage }, extra });
}
