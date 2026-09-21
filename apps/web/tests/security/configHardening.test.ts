/**
 * Configuration-level defences, asserted against source.
 *
 * Finding 13 (LOW) — `script-src` carried both 'unsafe-inline' and 'unsafe-eval',
 *   which together reduce the CSP to a resource allowlist with no XSS value.
 * Finding 14 (LOW) — two routes forwarded a third party's raw error text to the
 *   caller: Postgres internals from cron/cleanup and ZeptoMail API responses
 *   from qr-card-request.
 * Finding 12 (LOW) — rateLimit.ts documented itself against platforms vsite no
 *   longer runs on, which is how the assumptions in Findings 2 and 7 survived.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB = join(__dirname, '..', '..');
const src = (p: string) => readFileSync(join(WEB, 'src', p), 'utf8');
const nextConfig = readFileSync(join(WEB, 'next.config.mjs'), 'utf8');

describe('Finding 13: Content-Security-Policy', () => {
    const scriptSrc = nextConfig.match(/"script-src[^"]*"/)?.[0] ?? '';

    it('has a script-src directive at all', () => {
        expect(scriptSrc).not.toBe('');
    });

    it("does not allow 'unsafe-eval'", () => {
        expect(scriptSrc).not.toContain('unsafe-eval');
    });

    /**
     * The dev-server carve-out (2026-09-13).
     *
     * Finding 13 removed 'unsafe-eval' and the config told the next reader not
     * to restore it "on the strength of a `npm run dev` console error". That
     * was right about production and wrong about the consequence: `next dev`
     * compiles with devtool 'eval-source-map', so EVERY client module is
     * wrapped in eval(). With the token gone the dev server served HTML that
     * never hydrated — a blank page, not a console warning.
     *
     * So the token comes back for development ONLY. The production header must
     * stay byte-identical to what the assessment signed off, which is what
     * these three assertions together pin down.
     */
    it('gates the dev allowance on NODE_ENV, never shipping it', () => {
        expect(nextConfig).toMatch(/NODE_ENV\s*!==\s*'production'/);
    });

    it("mentions 'unsafe-eval' only inside the development branch", () => {
        // Every occurrence in the file must sit on a line that also names the
        // dev flag. A bare occurrence anywhere else is the regression.
        const codeLines = nextConfig
            .split('\n')
            .filter(l => !l.trimStart().startsWith('//'))
            .filter(l => l.includes('unsafe-eval'));

        expect(codeLines.length, "no 'unsafe-eval' carve-out found").toBeGreaterThan(0);
        for (const line of codeLines) {
            expect(line, `'unsafe-eval' is not gated on this line: ${line.trim()}`)
                .toMatch(/isDev|NODE_ENV/);
        }
    });

    it('keeps the production script-src as its own untouched literal', () => {
        // The dev branch must APPEND to the signed-off policy, not re-spell it.
        // Two hand-maintained copies is how production quietly drifts.
        expect(scriptSrc).toContain("'self'");
        expect(scriptSrc).toContain("'unsafe-inline'");
    });

    it('still keeps the directives that are doing real work', () => {
        expect(nextConfig).toContain("frame-ancestors 'none'");
        expect(nextConfig).toContain("object-src 'none'");
        expect(nextConfig).toContain("base-uri 'self'");
        expect(nextConfig).toContain("form-action 'self'");
    });

    it('keeps HSTS and the anti-sniffing headers', () => {
        expect(nextConfig).toMatch(/Strict-Transport-Security/);
        expect(nextConfig).toMatch(/X-Content-Type-Options/);
    });
});

describe('Finding 14: upstream error text never reaches a client', () => {
    it('cron/cleanup does not return the Postgres message', () => {
        expect(src('app/api/cron/cleanup/route.ts')).not.toMatch(/detail:\s*error\.message/);
    });

    it('qr-card-request does not return the ZeptoMail response body', () => {
        const s = src('app/api/manage/qr-card-request/route.ts');
        expect(s).not.toMatch(/detail:\s*errText/);
        // It must still be logged — dropping it entirely would make a mail
        // outage undiagnosable.
        expect(s).toMatch(/console\.error\([^)]*errText|errText[^)]*\)/);
    });
});

describe('Finding 12: the rate limiter documents the platform it actually runs on', () => {
    const s = src('lib/platform/rateLimit.ts');

    it('no longer instructs the reader about Vercel or Firebase Functions', () => {
        // Every platform-shaped assumption in this codebase that outlived the
        // move to DigitalOcean became a vulnerability (Findings 2, 7, 8). A
        // comment naming the wrong host is how each one survived review.
        expect(s).not.toMatch(/Vercel \/ Firebase Functions/);
        expect(s).not.toMatch(/we trust Vercel's value/);
    });

    it('states that state is per-process and lost on restart', () => {
        expect(s).toMatch(/restart|redeploy/i);
    });
});

/**
 * QA 2026-09-20 — the CSP silently broke the analytics it allowlists.
 *
 * Verified against a PRODUCTION build (`next build && next start`) in a real
 * Chromium, on every page of the funnel. Three directives were narrower than
 * the vendors they were meant to admit, so the browser refused the request and
 * the data never arrived. Nothing failed loudly: the console violation is the
 * only symptom, and analytics degrading is invisible from inside the app.
 *
 *   1. worker-src  — Clarity starts its recorder in a Worker created from a
 *      blob: URL. There was NO worker-src directive at all, so the browser
 *      fell back to script-src, which does not carry blob:. Every page:
 *      "Creating a worker from 'blob:...' violates ... script-src".
 *
 *   2. connect-src — GA4 posts to https://www.google.com/g/collect (regional
 *      consent routing), not only to google-analytics.com. www.google.com was
 *      present in script-src and frame-src for reCAPTCHA, but not connect-src,
 *      so every GA4 event on an authenticated page was dropped.
 *
 *   3. img-src     — Clarity's ID-sync pixel is served from c.bing.com.
 *
 * These are ADDITIVE allowances for vendors already trusted elsewhere in the
 * policy. They do not widen script execution: worker-src is deliberately
 * spelled 'self' blob: rather than inheriting script-src's 'unsafe-inline'.
 */
describe('QA 2026-09-20: the CSP admits the analytics it ships', () => {
    const directive = (name: string) =>
        nextConfig.match(new RegExp(`"${name}[^"]*"`))?.[0] ?? '';

    it('declares worker-src explicitly rather than inheriting script-src', () => {
        // Without its own directive the fallback chain lands on script-src,
        // which has no blob: — and adding blob: THERE would widen script
        // execution. A separate, narrow worker-src is the correct fix.
        expect(directive('worker-src'), 'no worker-src directive').not.toBe('');
    });

    it('allows the blob: worker Clarity records with', () => {
        expect(directive('worker-src')).toContain('blob:');
    });

    it('does not buy worker-src by widening script-src to blob:', () => {
        const scriptSrc = nextConfig.match(/"script-src[^"]*"/)?.[0] ?? '';
        expect(scriptSrc).not.toContain('blob:');
    });

    it('lets GA4 reach www.google.com/g/collect', () => {
        expect(directive('connect-src')).toContain('https://www.google.com');
    });

    it("loads Clarity's c.bing.com sync pixel", () => {
        expect(directive('img-src')).toContain('https://c.bing.com');
    });
});
