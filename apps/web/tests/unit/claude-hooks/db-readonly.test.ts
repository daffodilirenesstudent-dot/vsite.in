import { describe, expect, it } from 'vitest';
import { runHook, tempProject, writeFeature } from './helpers';

const HOOK = 'db-readonly.mjs';
const SQL_TOOL = 'mcp__plugin_supabase_supabase__execute_sql';

function activeRoot(): string {
  const root = tempProject();
  writeFeature(root, 'f', { phase: 'qa', status: 'running' });
  return root;
}

function sql(root: string, query: string) {
  return runHook(HOOK, { hook_event_name: 'PreToolUse', tool_name: SQL_TOOL, tool_input: { query } }, root);
}

describe('db-readonly hook', () => {
  it.each([
    'select count(*) from sites',
    "SELECT pg_size_pretty(pg_database_size(current_database()))",
    'with s as (select id from sites where active) select count(*) from s',
    'explain select * from menu_items limit 1',
    '-- usage\nselect count(*), max(updated_at) from menu_items;',
  ])('allows read-only query: %s', (q) => {
    expect(sql(activeRoot(), q).code).toBe(0);
  });

  it.each([
    'delete from menu_items',
    'update sites set name = 1',
    'insert into sites values (1)',
    'drop table sites',
    'select 1; delete from sites',
    'with d as (delete from sites returning id) select * from d',
    'select process_order_v2(1)',
    'truncate menu_items',
  ])('blocks write or side-effecting query: %s', (q) => {
    const r = sql(activeRoot(), q);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/read-only/i);
  });

  it.each([
    'mcp__plugin_supabase_supabase__apply_migration',
    'mcp__plugin_supabase_supabase__reset_branch',
    'mcp__plugin_supabase_supabase__delete_branch',
    'mcp__plugin_supabase_supabase__merge_branch',
    'mcp__plugin_supabase_supabase__deploy_edge_function',
  ])('denies %s during an active feature', (tool) => {
    const root = activeRoot();
    expect(runHook(HOOK, { hook_event_name: 'PreToolUse', tool_name: tool, tool_input: {} }, root).code).toBe(2);
  });

  it('allows listing tables', () => {
    const root = activeRoot();
    const r = runHook(HOOK, { hook_event_name: 'PreToolUse', tool_name: 'mcp__plugin_supabase_supabase__list_tables', tool_input: {} }, root);
    expect(r.code).toBe(0);
  });

  it('does nothing when no feature workflow is active', () => {
    expect(sql(tempProject(), 'delete from menu_items').code).toBe(0);
  });
});
