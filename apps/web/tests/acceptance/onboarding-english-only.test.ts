/**
 * Onboarding is English only — owner decision, 2026-09-23
 * ("only english in the onboarding no tamil"; recorded in
 * docs/features/ai-page-limits/contract.md).
 *
 * Tamil stays where diners read it (the customer QR menu); the owner-facing
 * signup flow, like the dashboard (store-details.test.ts), is English.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ONBOARDING = join(__dirname, '..', '..', 'src', 'app', 'onboarding');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/CLAUDE\.md$/.test(name) ? [p] : [];
  });
}

describe('onboarding is English only', () => {
  it('no onboarding source file contains Tamil script', () => {
    for (const f of sourceFiles(ONBOARDING)) {
      expect(readFileSync(f, 'utf8'), `Tamil script in ${f}`).not.toMatch(/[஀-௿]/);
    }
  });

  it('no onboarding screen renders a Tamil-language line', () => {
    for (const f of sourceFiles(ONBOARDING)) {
      expect(readFileSync(f, 'utf8'), `lang="ta" in ${f}`).not.toMatch(/lang="ta"/);
    }
  });

  it('scan messages carry English text only', () => {
    const src = readFileSync(join(ONBOARDING, 'scanMessages.ts'), 'utf8');
    expect(src).not.toMatch(/\bta\??:/);
  });
});
