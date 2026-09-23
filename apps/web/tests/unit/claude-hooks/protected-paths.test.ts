import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { runHook, tempProject, writeFeature } from './helpers';

const HOOK = 'protected-paths.mjs';

function edit(root: string, rel: string) {
  return runHook(HOOK, { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: join(root, rel) } }, root);
}

describe('protected-paths hook', () => {
  it('always blocks writes to the owner-owned business context', () => {
    const root = tempProject();
    const r = edit(root, '.claude/docs/business-context.md');
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/owner/i);
  });

  it('always blocks writes to critical-flows.md', () => {
    const root = tempProject();
    expect(edit(root, '.claude/docs/critical-flows.md').code).toBe(2);
  });

  it('allows sensitive paths when no feature workflow is active', () => {
    const root = tempProject();
    expect(edit(root, 'apps/web/supabase/migrations/001.sql').code).toBe(0);
  });

  it('blocks a migration edit during an active feature without approval', () => {
    const root = tempProject();
    writeFeature(root, 'menu-tags', { phase: 'build', status: 'running' }, { approved_sensitive_paths: [] });
    const r = edit(root, 'apps/web/supabase/migrations/001.sql');
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/approved_sensitive_paths/);
  });

  it.each([
    'apps/web/.env.local',
    'apps/web/src/lib/payments/razorpay.ts',
    'apps/web/src/lib/auth/firebase.ts',
    'apps/web/src/app/api/auth/session/route.ts',
    'apps/web/src/app/api/subscription/verify-payment/route.ts',
    'apps/web/src/lib/platform/productFlags.ts',
    'apps/web/src/middleware.ts',
    'apps/web/.do/app.yaml',
  ])('blocks %s during an active feature', (rel) => {
    const root = tempProject();
    writeFeature(root, 'f', { phase: 'build', status: 'running' }, { approved_sensitive_paths: [] });
    expect(edit(root, rel).code).toBe(2);
  });

  it('allows a sensitive path the signed contract approves', () => {
    const root = tempProject();
    writeFeature(root, 'f', { phase: 'build', status: 'running' }, {
      approved_sensitive_paths: ['apps/web/supabase/migrations/'],
    });
    expect(edit(root, 'apps/web/supabase/migrations/001.sql').code).toBe(0);
  });

  it('allows ordinary source files during an active feature', () => {
    const root = tempProject();
    writeFeature(root, 'f', { phase: 'build', status: 'running' }, { approved_sensitive_paths: [] });
    expect(edit(root, 'apps/web/src/components/MenuCard.tsx').code).toBe(0);
  });

  it('ignores features that are done', () => {
    const root = tempProject();
    writeFeature(root, 'f', { phase: 'live-verify', status: 'done' }, { approved_sensitive_paths: [] });
    expect(edit(root, 'apps/web/supabase/migrations/001.sql').code).toBe(0);
  });

  it('checks notebook paths too', () => {
    const root = tempProject();
    const r = runHook(HOOK, {
      hook_event_name: 'PreToolUse',
      tool_name: 'NotebookEdit',
      tool_input: { notebook_path: join(root, '.claude/docs/business-context.md') },
    }, root);
    expect(r.code).toBe(2);
  });
});
