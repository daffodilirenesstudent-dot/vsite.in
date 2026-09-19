// Daily ceiling on AI spend for menu extraction.
//
// Every completion's `usage` is priced and added to today's total (UTC day),
// globally and per account. Once the global total reaches
// EXTRACTION_DAILY_BUDGET_USD, extraction refuses new work until the day rolls
// over, so no number of accounts can take the bill past a figure the owner
// chose. EXTRACTION_USER_DAILY_BUDGET_USD caps one account on its own, so a
// single abuser hits their own ceiling long before they can pause everyone.
//
// LIMITATION: the total lives in this process. A restart (every push to master
// redeploys) starts the day at zero again, so this bounds spend per process
// lifetime, not per calendar day. The durable version is a Postgres counter
// claimed before the spend, like `bulk_import_usage`; that needs a migration.
// The OpenAI project's own monthly hard limit remains the absolute ceiling.

import { logger } from '@/lib/platform/logger';

/** USD per 1M tokens, [input, output]. Unknown models are priced as gpt-4o. */
const PRICE_PER_M: Record<string, [number, number]> = {
  'gpt-4o': [2.5, 10],
  'gpt-4o-mini': [0.15, 0.6],
};
const DEFAULT_BUDGET_USD = 25;
/** ≈15 typical scans (~$0.065 each): generous for an owner, small for an abuser. */
const DEFAULT_USER_BUDGET_USD = 1;

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

let day = '';
let spentUsd = 0;
let warned = false;
const spentByUser = new Map<string, number>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function roll(): void {
  const d = today();
  if (d !== day) { day = d; spentUsd = 0; warned = false; spentByUser.clear(); }
}

export function dailyBudgetUsd(): number {
  const n = Number(process.env.EXTRACTION_DAILY_BUDGET_USD);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_BUDGET_USD;
}

export function userDailyBudgetUsd(): number {
  const n = Number(process.env.EXTRACTION_USER_DAILY_BUDGET_USD);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_USER_BUDGET_USD;
}

export function usageCostUsd(model: string, usage: TokenUsage | undefined | null): number {
  if (!usage) return 0;
  const [inP, outP] = PRICE_PER_M[model] ?? PRICE_PER_M['gpt-4o'];
  return ((usage.prompt_tokens ?? 0) * inP + (usage.completion_tokens ?? 0) * outP) / 1_000_000;
}

export function recordAiUsage(model: string, usage: TokenUsage | undefined | null, userKey?: string): void {
  roll();
  const cost = usageCostUsd(model, usage);
  spentUsd += cost;
  if (userKey) spentByUser.set(userKey, (spentByUser.get(userKey) ?? 0) + cost);
  if (!warned && spentUsd >= dailyBudgetUsd()) {
    warned = true;
    logger.error(`[aiSpendGuard] daily extraction budget reached: $${spentUsd.toFixed(2)} of $${dailyBudgetUsd()}`);
  }
}

/** Global budget only, or — with a key — global AND that account's own cap. */
export function aiSpendAllowed(userKey?: string): boolean {
  roll();
  if (spentUsd >= dailyBudgetUsd()) return false;
  return userKey ? (spentByUser.get(userKey) ?? 0) < userDailyBudgetUsd() : true;
}

export function aiSpendToday(): { spentUsd: number; budgetUsd: number } {
  roll();
  return { spentUsd, budgetUsd: dailyBudgetUsd() };
}

/** Test seam. */
export function __resetAiSpend(): void {
  day = '';
  spentUsd = 0;
  warned = false;
  spentByUser.clear();
}
