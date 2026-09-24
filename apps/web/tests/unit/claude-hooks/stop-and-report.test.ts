import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { runHook, tempProject, writeFeature, writeFile } from './helpers';

describe('no-silent-stop hook', () => {
  const HOOK = 'no-silent-stop.mjs';
  const stop = (root: string) => runHook(HOOK, { hook_event_name: 'Stop' }, root);

  it('allows stopping when no feature is active', () => {
    expect(stop(tempProject()).code).toBe(0);
  });

  it.each(['build', 'qa', 'release', 'live-verify'])('blocks a silent stop mid-%s', (phase) => {
    const root = tempProject();
    writeFeature(root, 'f', { phase, status: 'running' });
    const r = stop(root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/STOPPED/);
  });

  it.each(['intake', 'design', 'approval'])('allows stopping in interactive phase %s', (phase) => {
    const root = tempProject();
    writeFeature(root, 'f', { phase, status: 'running' });
    expect(stop(root).code).toBe(0);
  });

  it('allows stopping while awaiting the owner or after a recorded STOP', () => {
    const a = tempProject();
    writeFeature(a, 'f', { phase: 'release', status: 'awaiting_user' });
    expect(stop(a).code).toBe(0);
    const b = tempProject();
    writeFeature(b, 'f', { phase: 'build', status: 'stopped' });
    expect(stop(b).code).toBe(0);
  });

  it('gives up after 3 consecutive blocks to avoid a loop', () => {
    const root = tempProject();
    writeFeature(root, 'f', { phase: 'build', status: 'running' });
    expect(stop(root).code).toBe(2);
    expect(stop(root).code).toBe(2);
    expect(stop(root).code).toBe(2);
    expect(stop(root).code).toBe(0);
    expect(stop(root).code).toBe(2);
  });

  it('never blocks a subagent', () => {
    const root = tempProject();
    writeFeature(root, 'f', { phase: 'build', status: 'running' });
    expect(runHook(HOOK, { hook_event_name: 'Stop', agent_id: 'a1', agent_type: 'Explore' }, root).code).toBe(0);
  });
});

describe('report-check hook', () => {
  const HOOK = 'report-check.mjs';
  const done = (root: string, agent: string) =>
    runHook(HOOK, { hook_event_name: 'SubagentStop', agent_type: agent, agent_id: 'x' }, root);

  it('blocks a QA agent that wrote no report', () => {
    const root = tempProject();
    writeFeature(root, 'f', { phase: 'qa', status: 'running' });
    const r = done(root, 'business-qa');
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/qa-business\.md/);
  });

  it('blocks a report with no VERDICT line', () => {
    const root = tempProject();
    const dir = writeFeature(root, 'f', { phase: 'qa', status: 'running' });
    writeFile(root, 'docs/features/f/qa-technical.md', '# Technical QA\nlooks good');
    expect(done(root, 'technical-qa').code).toBe(2);
    expect(dir).toBe(join(root, 'docs/features/f'));
  });

  it('accepts a report with a valid verdict', () => {
    const root = tempProject();
    writeFeature(root, 'f', { phase: 'qa', status: 'running' });
    writeFile(root, 'docs/features/f/qa-technical.md', '# Technical QA\n\nVERDICT: FAIL\n');
    expect(done(root, 'technical-qa').code).toBe(0);
  });

  it('expects the versioned architecture file from feature-architect', () => {
    const root = tempProject();
    writeFeature(root, 'f', { phase: 'design', status: 'running', design_version: '2' });
    writeFile(root, 'docs/features/f/architecture-v1.md', 'VERDICT: READY');
    expect(done(root, 'feature-architect').code).toBe(2);
    writeFile(root, 'docs/features/f/architecture-v2.md', 'VERDICT: READY');
    expect(done(root, 'feature-architect').code).toBe(0);
  });

  it('maps product-tester to qa-e2e in QA and live-verify after release', () => {
    const qa = tempProject();
    writeFeature(qa, 'f', { phase: 'qa', status: 'running' });
    writeFile(qa, 'docs/features/f/qa-e2e.md', 'VERDICT: PASS');
    expect(done(qa, 'product-tester').code).toBe(0);
    const live = tempProject();
    writeFeature(live, 'f', { phase: 'live-verify', status: 'running' });
    expect(done(live, 'product-tester').code).toBe(2);
  });

  it('ignores agents outside the workflow', () => {
    expect(done(tempProject(), 'product-tester').code).toBe(0);
  });
});

describe('resume-hint hook', () => {
  it('lists unfinished features on session start', () => {
    const root = tempProject();
    writeFeature(root, 'menu-tags', { phase: 'qa', status: 'stopped' });
    writeFeature(root, 'old', { phase: 'live-verify', status: 'done' });
    const r = runHook('resume-hint.mjs', { hook_event_name: 'SessionStart' }, root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/menu-tags/);
    expect(r.stdout).toMatch(/qa/);
    expect(r.stdout).not.toMatch(/\bold\b/);
  });

  it('prints nothing when there is no unfinished feature', () => {
    const r = runHook('resume-hint.mjs', { hook_event_name: 'SessionStart' }, tempProject());
    expect(r.stdout.trim()).toBe('');
  });
});
