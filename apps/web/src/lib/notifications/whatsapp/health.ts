/**
 * Which Meta errors are about one message and which are about the whole
 * account. Pure. Codes verified against Meta's Cloud API error-code reference
 * on 2026-10-02 (spec: docs/superpowers/specs/2026-10-02-whatsapp-hardening-design.md).
 *
 *   message  — this row can never succeed: dead
 *   retry    — this row may succeed later: back off
 *   defer    — Meta asked us to wait a day for this recipient (131049, the
 *              per-user marketing cap): one retry after DEFER_MS, no breaker
 *   throttle — the account is sending too fast: pause everything briefly
 *   template — this template is broken/paused: pause that template, alert
 *   system   — the account cannot send at all: pause everything, alert
 *
 * Unknown codes are `retry` (bounded by MAX_ATTEMPTS), never silently dead.
 *
 * 2026-10-03, verified against the same reference: 131049 "wait at least 24
 * hours before resending"; 131050 "this recipient has chosen to stop receiving
 * marketing messages … do not retry".
 */

export type ErrorClass = 'message' | 'retry' | 'defer' | 'throttle' | 'template' | 'system';

const SYSTEM = new Set([0, 3, 10, 190, 200, 368, 131005, 131031, 131042, 131045, 131048, 133010]);
const TEMPLATE = new Set([132000, 132001, 132005, 132007, 132012, 132015, 132016]);
const THROTTLE = new Set([4, 80007, 130429, 131057]);
const MESSAGE = new Set([100, 130472, 131008, 131009, 131021, 131026, 131047, 131050, 131051, 131052, 131053]);
const DEFER = new Set([131049]);

export function classifyMetaError(code: number | null, httpStatus: number): ErrorClass {
	if (code !== null) {
		if (SYSTEM.has(code)) return 'system';
		if (TEMPLATE.has(code)) return 'template';
		if (THROTTLE.has(code)) return 'throttle';
		if (MESSAGE.has(code)) return 'message';
		if (DEFER.has(code)) return 'defer';
		return 'retry';
	}
	if (httpStatus === 401 || httpStatus === 403) return 'system';
	if (httpStatus === 429) return 'throttle';
	return 'retry';
}

const MIN = 60_000;
export const BREAKER_MS = { system: 15 * MIN, template: 60 * MIN, throttle: 2 * MIN };
/** How long a `defer` row waits: Meta's "at least 24 hours" for 131049. */
export const DEFER_MS = 24 * 60 * MIN;

export function breakerKeyFor(cls: ErrorClass, template: string): string | null {
	if (cls === 'system' || cls === 'throttle') return 'system';
	if (cls === 'template') return `template:${template}`;
	return null;
}

/** `breakers` maps key → open_until (ms). Expired entries are closed. */
export function isOpen(breakers: Map<string, number>, key: string, nowMs: number): boolean {
	const until = breakers.get(key);
	return until !== undefined && until > nowMs;
}
