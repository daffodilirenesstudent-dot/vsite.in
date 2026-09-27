import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { safeInternalPath } from '@/lib/auth/postAuthDestination';

/**
 * Open redirect (security audit 2026-09-27, M3).
 *
 * `/auth/refresh?to=` and `/login?redirectTo=` each hand-rolled a
 * "starts with / but not //" check and then called window.location.replace().
 * Browsers strip TAB/CR/LF from a URL before parsing it and read `/\` as `//`,
 * so `/\evil.example` and `/<TAB>/evil.example` both passed the check and both
 * navigate off-site. /auth/refresh is outside the middleware matcher and fires
 * for any visitor with a persisted Firebase session: one link, instant redirect.
 */

const ORIGIN = 'https://vsite.in';

// Every payload is a string the browser resolves to another origin.
const OFF_SITE = [
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '/\t\\evil.example',
    '\t//evil.example',
];

describe('the payloads really do leave the site', () => {
    it.each(OFF_SITE)('%j resolves to evil.example in a browser', payload => {
        expect(new URL(payload, ORIGIN).hostname).toBe('evil.example');
    });
});

describe('safeInternalPath refuses every off-site payload', () => {
    it.each(OFF_SITE)('%j', payload => {
        expect(safeInternalPath(payload)).toBeNull();
    });

    it('still accepts ordinary in-app paths unchanged', () => {
        expect(safeInternalPath('/manage/dashboard')).toBe('/manage/dashboard');
        expect(safeInternalPath('/manage/qr?tab=posters#top')).toBe('/manage/qr?tab=posters#top');
        // An encoded tab is literal path text, not whitespace: it stays on-site.
        expect(safeInternalPath('/%09/evil.example')).toBe('/%09/evil.example');
    });
});

describe('every client-side redirect goes through safeInternalPath', () => {
    const pages = ['src/app/auth/refresh/page.tsx', 'src/app/login/page.tsx'];

    it.each(pages)('%s uses the shared validator', file => {
        const src = readFileSync(path.join(__dirname, '../../', file), 'utf8');
        expect(src).toContain('safeInternalPath(');
        // The hand-rolled prefix check is what let the bypasses through.
        expect(src).not.toMatch(/startsWith\('\/'\)\s*&&\s*!\w+\.startsWith\('\/\/'\)/);
    });
});
