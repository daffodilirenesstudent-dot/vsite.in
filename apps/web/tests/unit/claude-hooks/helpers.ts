import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

// `.claude/` is gitignored, so it exists only in the main checkout. Resolve it
// through git's common dir so these tests also pass inside a feature worktree.
const gitCommonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
  cwd: __dirname,
  encoding: 'utf8',
}).trim();
export const HOOKS_DIR = join(dirname(gitCommonDir), '.claude', 'hooks');

export interface HookResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runHook(
  name: string,
  input: Record<string, unknown>,
  projectDir: string,
): HookResult {
  const res = spawnSync('node', [join(HOOKS_DIR, name)], {
    input: JSON.stringify({ cwd: projectDir, session_id: 'test-session', ...input }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, VSITE_HOOK_NO_TOAST: '1' },
    encoding: 'utf8',
  });
  return { code: res.status ?? -1, stdout: res.stdout, stderr: res.stderr };
}

export function tempProject(): string {
  return mkdtempSync(join(tmpdir(), 'vsite-hooks-'));
}

export function writeFile(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

export interface StateFields {
  phase: string;
  status: string;
  design_version?: string;
  previous_tag?: string;
  release_tag?: string;
  critical_failure?: string;
}

export function writeFeature(
  root: string,
  slug: string,
  state: StateFields,
  contract?: { approved_sensitive_paths: string[] },
): string {
  const dir = `docs/features/${slug}`;
  const fm = Object.entries({ slug, design_version: '1', ...state })
    .map(([k, v]) => `${k}: ${v ?? ''}`)
    .join('\n');
  writeFile(root, `${dir}/state.md`, `---\n${fm}\n---\n\n## Log\n`);
  if (contract) {
    writeFile(
      root,
      `${dir}/contract.md`,
      `---\nslug: ${slug}\napproved_sensitive_paths: [${contract.approved_sensitive_paths.join(', ')}]\n---\n`,
    );
  }
  return join(root, dir);
}
