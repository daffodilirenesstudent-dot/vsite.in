/**
 * A small in-memory stand-in for the supabase-js query builder.
 *
 * Supports exactly the subset the WhatsApp outbox and sweep use: select (with
 * one level of embedded relation), insert, upsert(merge or ignoreDuplicates), update,
 * the eq/in/is/gt/gte/lt/lte filters, order, limit, range, maybeSingle and single.
 * Filters apply to update just as they do to select, which is what makes the
 * conditional "claim" UPDATE testable: two claims on one row, one wins.
 *
 * Unique constraints are declared per table so `upsert(..., { onConflict,
 * ignoreDuplicates: true })` behaves like `INSERT ... ON CONFLICT DO NOTHING`.
 */

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export interface FakeDb {
    tables: Record<string, Row[]>;
    unique: Record<string, string[]>;
    /** Relation name → how to resolve it from a parent row. */
    relations: Record<string, { table: string; local: string; foreign: string; many?: boolean }>;
    failNext?: { table: string; op: 'select' | 'insert' | 'update' | 'upsert' };
}

let seq = 0;

export function createFakeDb(init: Partial<FakeDb> = {}): FakeDb {
    return { tables: {}, unique: {}, relations: {}, ...init };
}

function cmp(a: unknown, b: unknown): number {
    const x = typeof a === 'string' && !Number.isNaN(Date.parse(a)) && typeof b === 'string' ? Date.parse(a) : a;
    const y = typeof b === 'string' && !Number.isNaN(Date.parse(b)) && typeof a === 'string' ? Date.parse(b) : b;
    return (x as number) < (y as number) ? -1 : (x as number) > (y as number) ? 1 : 0;
}

function project(db: FakeDb, row: Row, columns: string): Row {
    if (!columns || columns.trim() === '*') return { ...row };
    const out: Row = {};
    // Split on commas that are not inside parentheses.
    const parts: string[] = [];
    let depth = 0, cur = '';
    for (const ch of columns) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    for (const p of parts) {
        const m = p.match(/^([a-z_]+)(?:!inner)?\((.*)\)$/s);
        if (m) {
            const rel = db.relations[m[1]];
            if (!rel) throw new Error(`fakeSupabase: unknown relation ${m[1]}`);
            const matches = (db.tables[rel.table] ?? []).filter(r => r[rel.foreign] === row[rel.local]);
            const projected = matches.map(r => project(db, r, m[2]));
            out[m[1]] = rel.many ? projected : (projected[0] ?? null);
        } else {
            out[p] = row[p];
        }
    }
    return out;
}

export function fakeClient(db: FakeDb) {
    return {
        from(table: string) {
            db.tables[table] ??= [];
            const filters: Filter[] = [];
            let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
            let payload: Row | Row[] | null = null;
            let columns = '*';
            let returning = false;
            let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
            let limitN: number | null = null;
            let rangeN: [number, number] | null = null;
            let orderBy: { col: string; asc: boolean } | null = null;
            let single: 'maybe' | 'one' | null = null;
            let innerRel: string | null = null;

            const run = (): { data: unknown; error: { message: string; code?: string } | null } => {
                if (db.failNext && db.failNext.table === table && db.failNext.op === op) {
                    db.failNext = undefined;
                    return { data: null, error: { message: 'injected failure' } };
                }
                const rows = db.tables[table];
                const match = (r: Row) => filters.every(f => f(r));

                if (op === 'insert' || op === 'upsert') {
                    const list = Array.isArray(payload) ? payload : [payload as Row];
                    const inserted: Row[] = [];
                    for (const p of list) {
                        const uniq = db.unique[table] ?? [];
                        const clash = uniq.find(col => p[col] !== undefined && rows.some(r => r[col] === p[col]));
                        if (clash) {
                            if (op === 'upsert' && upsertOpts.ignoreDuplicates) continue;
                            if (op === 'upsert') {
                                const existing = rows.find(r => r[clash] === p[clash]) as Row;
                                Object.assign(existing, p);
                                inserted.push(existing);
                                continue;
                            }
                            return { data: null, error: { message: 'duplicate key', code: '23505' } };
                        }
                        const row = { id: `row-${++seq}`, created_at: new Date().toISOString(), ...p };
                        rows.push(row);
                        inserted.push(row);
                    }
                    const data = returning ? inserted.map(r => project(db, r, columns)) : null;
                    if (single) return { data: (data as Row[] | null)?.[0] ?? null, error: null };
                    return { data, error: null };
                }

                if (op === 'update') {
                    const hit = rows.filter(match);
                    for (const r of hit) Object.assign(r, payload);
                    const data = returning ? hit.map(r => project(db, r, columns)) : null;
                    if (single) return { data: (data as Row[] | null)?.[0] ?? null, error: null };
                    return { data, error: null };
                }

                if (op === 'delete') {
                    db.tables[table] = rows.filter(r => !match(r));
                    return { data: null, error: null };
                }

                let out = rows.filter(match).map(r => project(db, r, columns));
                if (innerRel) out = out.filter(r => r[innerRel as string] !== null && !(Array.isArray(r[innerRel as string]) && (r[innerRel as string] as unknown[]).length === 0));
                if (orderBy) {
                    const { col, asc } = orderBy;
                    out.sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]));
                }
                if (limitN !== null) out = out.slice(0, limitN);
                if (rangeN) out = out.slice(rangeN[0], rangeN[1] + 1);
                if (single === 'maybe') return { data: out[0] ?? null, error: null };
                if (single === 'one') {
                    return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'not single', code: 'PGRST116' } };
                }
                return { data: out, error: null };
            };

            const b = {
                select(cols = '*') {
                    columns = cols;
                    const inner = cols.match(/([a-z_]+)!inner\(/);
                    if (inner) innerRel = inner[1];
                    if (op !== 'select') returning = true;
                    return b;
                },
                insert(p: Row | Row[]) { op = 'insert'; payload = p; return b; },
                upsert(p: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { op = 'upsert'; payload = p; upsertOpts = o; return b; },
                update(p: Row) { op = 'update'; payload = p; return b; },
                delete() { op = 'delete'; return b; },
                eq(c: string, v: unknown) { filters.push(r => r[c] === v); return b; },
                neq(c: string, v: unknown) { filters.push(r => r[c] !== v); return b; },
                in(c: string, v: unknown[]) { filters.push(r => v.includes(r[c])); return b; },
                is(c: string, v: unknown) { filters.push(r => (r[c] ?? null) === v); return b; },
                gt(c: string, v: unknown) { filters.push(r => r[c] != null && cmp(r[c], v) > 0); return b; },
                gte(c: string, v: unknown) { filters.push(r => r[c] != null && cmp(r[c], v) >= 0); return b; },
                lt(c: string, v: unknown) { filters.push(r => r[c] != null && cmp(r[c], v) < 0); return b; },
                lte(c: string, v: unknown) { filters.push(r => r[c] != null && cmp(r[c], v) <= 0); return b; },
                order(col: string, o: { ascending?: boolean } = {}) { orderBy = { col, asc: o.ascending !== false }; return b; },
                limit(n: number) { limitN = n; return b; },
                range(from: number, to: number) { rangeN = [from, to]; return b; },
                maybeSingle() { single = 'maybe'; return b; },
                single() { single = 'one'; return b; },
                then<T>(onF: (v: ReturnType<typeof run>) => T, onR?: (e: unknown) => T) {
                    try { return Promise.resolve(run()).then(onF, onR); }
                    catch (e) { return onR ? Promise.resolve(onR(e)) : Promise.reject(e); }
                },
            };
            return b;
        },
    };
}
