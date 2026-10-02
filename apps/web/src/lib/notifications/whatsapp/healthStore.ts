import 'server-only';
import { supabaseServer } from '@/lib/platform/db/supabase-server';

/**
 * `notification_health` (migration 064): circuit breakers, heartbeats and
 * alert de-dup stamps. No personal data. Callers decide what a DB failure
 * means — the outbox fails OPEN (keeps sending) when this throws.
 */

const TABLE = 'notification_health';
const iso = (ms: number) => new Date(ms).toISOString();

interface HealthRow { key: string; open_until: string | null; updated_at: string }

async function get(key: string): Promise<HealthRow | null> {
    const { data, error } = await supabaseServer.from(TABLE).select('key, open_until, updated_at').eq('key', key).maybeSingle();
    if (error) throw new Error(`health read failed: ${error.message}`);
    return (data as HealthRow | null) ?? null;
}

async function put(row: Record<string, unknown>): Promise<void> {
    const { error } = await supabaseServer.from(TABLE).upsert(row, { onConflict: 'key' });
    if (error) throw new Error(`health write failed: ${error.message}`);
}

export async function readBreakers(): Promise<Map<string, number>> {
    const { data, error } = await supabaseServer.from(TABLE).select('key, open_until, updated_at');
    if (error) throw new Error(`health read failed: ${error.message}`);
    const out = new Map<string, number>();
    for (const r of (data ?? []) as HealthRow[]) {
        if (!r.open_until || !(r.key === 'system' || r.key.startsWith('template:'))) continue;
        const t = Date.parse(r.open_until);
        if (Number.isFinite(t)) out.set(r.key, t);
    }
    return out;
}

export async function openBreaker(
    key: string,
    o: { code: number | null; reason: string; untilMs: number; nowMs: number },
): Promise<{ newlyOpened: boolean; openUntil: string }> {
    const prev = await get(key);
    const prevUntil = prev?.open_until ? Date.parse(prev.open_until) : 0;
    const newlyOpened = !(prevUntil > o.nowMs);
    const untilMs = Math.max(o.untilMs, newlyOpened ? 0 : prevUntil);
    await put({
        key, open_until: iso(untilMs), reason: o.reason.slice(0, 200), code: o.code,
        ...(newlyOpened ? { opened_at: iso(o.nowMs) } : {}), updated_at: iso(o.nowMs),
    });
    return { newlyOpened, openUntil: iso(untilMs) };
}

export async function closeBreaker(key: string, nowMs: number): Promise<void> {
    const { error } = await supabaseServer.from(TABLE).update({ open_until: null, updated_at: iso(nowMs) }).eq('key', key);
    if (error) throw new Error(`health write failed: ${error.message}`);
}

export async function beat(key: string, nowMs: number): Promise<void> {
    await put({ key, updated_at: iso(nowMs) });
}

export async function lastBeat(key: string): Promise<number | null> {
    const row = await get(key);
    const t = row ? Date.parse(row.updated_at) : NaN;
    return Number.isFinite(t) ? t : null;
}

export async function claimAlert(kind: string, everyMs: number, nowMs: number): Promise<boolean> {
    const key = `alert:${kind}`;
    const last = await lastBeat(key);
    if (last !== null && nowMs - last < everyMs) return false;
    await beat(key, nowMs);
    return true;
}
