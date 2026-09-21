/**
 * QA 2026-09-20 — Settings polled a frozen endpoint forever.
 *
 * `/manage/settings` called GET /api/manage/payments/razorpay/status on mount,
 * then every 20s while the tab was visible, and again on every tab focus.
 * Razorpay Connect is an ORDERING feature, so that route is behind
 * `frozenResponse()` and answers 403 FEATURE_FROZEN every time.
 *
 * Observed live: 403 on each settings visit, repeating on the poller. Nothing
 * was broken for the user, but it produced a permanent stream of console
 * errors and Sentry noise — the kind that trains you to ignore the error
 * channel, which is how a real fault gets missed.
 *
 * The gate belongs on the CLIENT: while frozen there is nothing to poll for,
 * so the request must not be made at all. The route keeps its own 403 — this
 * does not replace that defence, it stops knocking on a door we locked.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ORDERING_FROZEN } from '@/lib/platform/productFlags';

const settings = readFileSync(
    join(__dirname, '..', '..', 'src', 'app', 'manage', 'settings', 'page.tsx'),
    'utf8',
);

describe('Settings does not poll a frozen payments endpoint', () => {
    it('still reaches for razorpay status somewhere (the feature is frozen, not deleted)', () => {
        // If this ever fails the feature was removed rather than frozen, and
        // this whole file should go with it.
        expect(settings).toContain('/api/manage/payments/razorpay/status');
    });

    it('imports the freeze flag rather than hardcoding the decision', () => {
        expect(settings).toMatch(/import\s*\{[^}]*ORDERING_FROZEN[^}]*\}\s*from\s*'@\/lib\/platform\/productFlags'/);
    });

    it('guards the status fetch behind the freeze flag', () => {
        // The guard must sit before the request: an early return inside the
        // loader, or the effect refusing to start the poller.
        const loader = settings.slice(
            settings.indexOf('const loadRzpStatus'),
            settings.indexOf('/api/manage/payments/razorpay/status'),
        );
        expect(loader, 'no ORDERING_FROZEN guard before the fetch').toMatch(/ORDERING_FROZEN/);
    });

    it('does not start the 20s interval while frozen', () => {
        const effect = settings.slice(
            settings.indexOf('loadRzpStatus(siteId);'),
            settings.indexOf('}, [siteId]);'),
        );
        expect(effect, 'poller is not gated on the freeze').toMatch(/ORDERING_FROZEN/);
    });

    it('is asserting against the freeze actually being on', () => {
        // Documents why the guard matters today; flips meaning on unfreeze.
        expect(ORDERING_FROZEN).toBe(true);
    });
});
