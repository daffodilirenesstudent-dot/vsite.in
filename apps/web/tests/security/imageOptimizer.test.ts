/**
 * Image optimizer exposure (security audit 2026-09-27, C2).
 *
 * next@14.2.35 carries published advisories against the Image Optimization API:
 * unauthenticated RCE via AVIF input (GHSA-2xp9-vwfh-vxw4), DoS
 * (GHSA-h64f-5h5j-jqjh, GHSA-9g9p-9gw9-jx7f) and unbounded disk cache
 * (GHSA-3x4c-7xq6-9pq8) — all fixed in 15.5.24. `remotePatterns` points the
 * optimizer at our own Supabase bucket, and any signed-up owner can put a file
 * there, so the "trusted origin" is attacker-writable.
 *
 * Until Next is on a fixed release, the optimizer stays off. This test lets go
 * by itself once the installed Next reaches 15.5.24.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB = join(__dirname, '..', '..');
const nextConfig = readFileSync(join(WEB, 'next.config.mjs'), 'utf8');
const nextVersion: string = JSON.parse(
    readFileSync(join(WEB, 'node_modules', 'next', 'package.json'), 'utf8'),
).version;

function atLeast(version: string, min: [number, number, number]): boolean {
    const [a, b, c] = version.split(/[.-]/).map(Number);
    return a !== min[0] ? a > min[0] : b !== min[1] ? b > min[1] : c >= min[2];
}

describe('C2: the Next image optimizer is not reachable on a vulnerable Next', () => {
    const patched = atLeast(nextVersion, [15, 5, 24]);

    it(`next@${nextVersion} is patched, or the optimizer is disabled`, () => {
        if (patched) return;
        const images = nextConfig.match(/images:\s*\{[\s\S]*?\n {4}\},/)?.[0] ?? '';
        expect(images).toMatch(/unoptimized:\s*true/);
    });
});
