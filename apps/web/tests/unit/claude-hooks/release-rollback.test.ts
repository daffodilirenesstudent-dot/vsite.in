import { describe, expect, it, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HOOKS_DIR, runHook, tempProject, writeFeature, writeFile } from './helpers';

// Each test drives real git subprocesses; slow on Windows.
vi.setConfig({ testTimeout: 30_000 });

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function repo(): string {
  const root = tempProject();
  git(root, 'init', '-q', '-b', 'master');
  git(root, 'config', 'user.email', 't@example.invalid');
  git(root, 'config', 'user.name', 'test');
  git(root, 'config', 'commit.gpgsign', 'false');
  writeFile(root, 'app.txt', 'v1\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'v1');
  git(root, 'tag', 'release/baseline-20260923');
  return root;
}

function readyRelease(root: string): void {
  writeFeature(root, 'f', {
    phase: 'release',
    status: 'running',
    release_tag: 'release/f-20260924',
    previous_tag: 'release/baseline-20260923',
  });
  for (const f of ['qa-business.md', 'qa-technical.md', 'qa-e2e.md']) {
    writeFile(root, `docs/features/f/${f}`, '# QA\n\nVERDICT: PASS\n');
  }
  writeFile(root, 'docs/features/f/release.md', '# Release\n\nRollback command: `.claude/hooks/rollback.sh release/baseline-20260923`\n');
  writeFile(root, 'app.txt', 'v2\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'v2');
  git(root, 'tag', 'release/f-20260924');
}

const push = (root: string, command = 'git push vsite master --follow-tags') =>
  runHook('release-guard.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }, root);

describe('release-guard hook', () => {
  it('allows a push when every release condition holds', () => {
    const root = repo();
    readyRelease(root);
    const r = push(root);
    expect(r.stderr).toBe('');
    expect(r.code).toBe(0);
  });

  it('ignores commands that are not a push to vsite', () => {
    const root = repo();
    writeFeature(root, 'f', { phase: 'build', status: 'running' });
    expect(push(root, 'git push origin feat/f').code).toBe(0);
    expect(push(root, 'git status').code).toBe(0);
  });

  it('blocks a vsite push while a feature is not in the release phase', () => {
    const root = repo();
    writeFeature(root, 'f', { phase: 'qa', status: 'running' });
    const r = push(root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/release phase/);
  });

  it('blocks when HEAD carries no release tag', () => {
    const root = repo();
    readyRelease(root);
    writeFile(root, 'app.txt', 'v3\n');
    git(root, 'commit', '-qam', 'v3');
    expect(push(root).stderr).toMatch(/release\/\* tag/);
  });

  it('blocks when any QA verdict is not PASS', () => {
    const root = repo();
    readyRelease(root);
    writeFile(root, 'docs/features/f/qa-business.md', 'VERDICT: STOP-FOR-OWNER\n');
    git(root, 'commit', '-qam', 'qa');
    git(root, 'tag', '-f', 'release/f-20260924');
    const r = push(root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/qa-business\.md/);
  });

  it('blocks when release.md has no rollback command', () => {
    const root = repo();
    readyRelease(root);
    writeFile(root, 'docs/features/f/release.md', '# Release\n');
    git(root, 'commit', '-qam', 'rel');
    git(root, 'tag', '-f', 'release/f-20260924');
    expect(push(root).stderr).toMatch(/rollback/i);
  });

  it('blocks when tracked files have uncommitted changes', () => {
    const root = repo();
    readyRelease(root);
    writeFile(root, 'app.txt', 'dirty\n');
    expect(push(root).stderr).toMatch(/uncommitted/);
  });

  it('does not interfere when no feature workflow is active', () => {
    expect(push(repo()).code).toBe(0);
  });
});

describe('rollback-guard hook', () => {
  const guard = (root: string, tag: string) =>
    runHook('rollback-guard.mjs', {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: `bash .claude/hooks/rollback.sh ${tag}` },
    }, root);

  function liveFailure(root: string, critical: string): void {
    readyRelease(root);
    writeFeature(root, 'f', {
      phase: 'live-verify',
      status: 'running',
      release_tag: 'release/f-20260924',
      previous_tag: 'release/baseline-20260923',
      critical_failure: critical,
    });
  }

  it('allows rolling back to the recorded previous tag on a Critical failure', () => {
    const root = repo();
    liveFailure(root, 'QR menu /shop/test-cafe returns 500 (live-verify.md#critical-1)');
    expect(guard(root, 'release/baseline-20260923').code).toBe(0);
  });

  it('blocks a rollback when no Critical failure is recorded', () => {
    const root = repo();
    liveFailure(root, '');
    const r = guard(root, 'release/baseline-20260923');
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/Critical/);
  });

  it('blocks a rollback to a tag other than previous_tag', () => {
    const root = repo();
    liveFailure(root, 'login broken');
    expect(guard(root, 'release/f-20260924').code).toBe(2);
  });

  it('blocks a rollback to a tag that is not an ancestor of HEAD', () => {
    const root = repo();
    liveFailure(root, 'login broken');
    git(root, 'tag', '-d', 'release/baseline-20260923');
    git(root, 'checkout', '-q', '--orphan', 'other');
    git(root, 'commit', '-q', '-m', 'unrelated');
    git(root, 'tag', 'release/baseline-20260923');
    git(root, 'checkout', '-q', 'master');
    expect(guard(root, 'release/baseline-20260923').code).toBe(2);
  });

  it('leaves unrelated commands alone', () => {
    const root = repo();
    const r = runHook('rollback-guard.mjs', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }, root);
    expect(r.code).toBe(0);
  });
});

describe('rollback.sh', () => {
  it('adds a forward commit whose tree equals the previous tag, tags it and pushes without force', () => {
    const root = repo();
    readyRelease(root);
    const remote = mkdtempSync(join(tmpdir(), 'vsite-remote-'));
    git(remote, 'init', '-q', '--bare');
    git(root, 'remote', 'add', 'vsite', remote);
    git(root, 'push', '-q', 'vsite', 'master');
    const releasedHead = git(root, 'rev-parse', 'HEAD');

    const res = spawnSync('bash', [join(HOOKS_DIR, 'rollback.sh'), 'release/baseline-20260923', 'f'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ROLLBACK_DATE: '20260924' },
    });
    expect(res.stderr + res.stdout).not.toMatch(/fatal|error/i);
    expect(res.status).toBe(0);

    expect(git(root, 'rev-parse', 'HEAD^')).toBe(releasedHead);
    // Code is exactly the previous release; only the workflow's own records differ.
    expect(git(root, 'diff', '--name-only', 'release/baseline-20260923', 'HEAD', '--', '.', ':!docs/features')).toBe('');
    expect(git(root, 'show', 'HEAD:app.txt')).toBe('v1');
    expect(git(remote, 'rev-parse', 'master')).toBe(git(root, 'rev-parse', 'HEAD'));
    expect(git(root, 'tag', '-l', 'release/rollback-f-20260924')).toBe('release/rollback-f-20260924');
    rmSync(remote, { recursive: true, force: true });
  });

  it('keeps the uncommitted critical_failure record in docs/features', () => {
    const root = repo();
    readyRelease(root);
    const remote = mkdtempSync(join(tmpdir(), 'vsite-remote-'));
    git(remote, 'init', '-q', '--bare');
    git(root, 'remote', 'add', 'vsite', remote);
    writeFile(root, 'docs/features/f/state.md', '---\nslug: f\ncritical_failure: login 500\n---\n');

    const res = spawnSync('bash', [join(HOOKS_DIR, 'rollback.sh'), 'release/baseline-20260923', 'f'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ROLLBACK_DATE: '20260924' },
    });
    expect(res.status).toBe(0);
    expect(git(root, 'show', 'HEAD:docs/features/f/state.md')).toMatch(/critical_failure: login 500/);
    expect(git(root, 'status', '--porcelain', '--untracked-files=no')).toBe('');
    rmSync(remote, { recursive: true, force: true });
  });

  it('refuses to run with uncommitted changes', () => {
    const root = repo();
    readyRelease(root);
    writeFile(root, 'app.txt', 'dirty\n');
    const res = spawnSync('bash', [join(HOOKS_DIR, 'rollback.sh'), 'release/baseline-20260923', 'f'], { cwd: root, encoding: 'utf8' });
    expect(res.status).not.toBe(0);
  });
});
