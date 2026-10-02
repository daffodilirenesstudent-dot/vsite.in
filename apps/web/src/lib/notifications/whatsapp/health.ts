/**
 * Which Meta errors are about one message and which are about the whole
 * account. Pure. Codes verified against Meta's Cloud API error-code reference
 * on 2026-10-02 (spec: docs/superpowers/specs/2026-10-02-whatsapp-hardening-design.md).
 *
 *   message  — this row can never succeed: dead
 *   retry    — this row may succeed later: back off
 *   throttle — the account is sending too fast: pause everything briefly
 *   template — this template is broken/paused: pause that template, alert
 *   system   — the account cannot send at all: pause everything, alert
 *
 * Unknown codes are `retry` (bounded by MAX_ATTEMPTS), never silently dead.
 */

export type ErrorClass = 'message' | 'retry' | 'throttle' | 'template' | 'system';

const SYSTEM = new Set([0, 3, 10, 190, 200, 368, 131005, 131031, 131042, 131045, 131048, 133010]);
const TEMPLATE = new Set([132000, 132001, 132005, 132007, 132012, 132015, 132016]);
const THROTTLE = new Set([4, 80007, 130429, 131057]);
const MESSAGE = new Set([100, 130472, 131008, 131009, 131021, 131026, 131047, 131051, 131052, 131053]);

export function classifyMetaError(code: number | null, httpStatus: number): ErrorClass {
	if (code !== null) {
		if (SYSTEM.has(code)) return 'system';
		if (TEMPLATE.has(code)) return 'template';
		if (THROTTLE.has(code)) return 'throttle';
		if (MESSAGE.has(code)) return 'message';
		return 'retry';
	}
	if (httpStatus === 401 || httpStatus === 403) return 'system';
	if (httpStatus === 429) return 'throttle';
	return 'retry';
}

const MIN = 60_000;
export const BREAKER_MS = { system: 15 * MIN, template: 60 * MIN, throttle: 2 * MIN };

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
