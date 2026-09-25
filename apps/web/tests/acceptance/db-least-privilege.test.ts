import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Least privilege at the database edge (2026-09-21).
 *
 * The anon key ships in every page's browser bundle, so anything `anon` can
 * read, anyone can read. Two holes, one class:
 *
 *   055 — server-only RPCs were EXECUTE-able by PUBLIC. Applied to the live
 *         database on 2026-09-20 but never committed, so a rebuild from the repo
 *         would have silently reopened it. This file is that migration.
 *   056 — `sites_public_read` limits ROWS (is_live = true) but RLS never limits
 *         COLUMNS. anon could read every column of every live store: qr_secret
 *         (forges signed table QRs), the raw GST lookup response, the owner's
 *         billing emails, the KOT device id. Realtime also broadcast the whole
 *         row to every public menu viewer on each owner edit.
 *
 * The fix grants SELECT column-by-column. The guard below is what keeps it from
 * breaking the app later: every column browser code reads from `sites` must be
 * in the grant, or the query fails with "permission denied" at runtime.
 */

const WEB = resolve(__dirname, '../..');
const MIGRATIONS = join(WEB, 'supabase/migrations');
const SRC = join(WEB, 'src');

function migration(prefix: string): string {
    const file = readdirSync(MIGRATIONS).find((f) => f.startsWith(prefix));
    expect(file, `supabase/migrations/${prefix}*.sql must exist`).toBeDefined();
    return readFileSync(join(MIGRATIONS, file as string), 'utf8');
}

function grantedSiteColumns(): Set<string> {
    const sql = migration('056_');
    const m = sql.match(/GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+public\.sites\s+TO\s+anon\s*,\s*authenticated/i);
    expect(m, '056 must GRANT SELECT (<columns>) ON public.sites TO anon, authenticated').not.toBeNull();
    return new Set((m as RegExpMatchArray)[1].split(',').map((c) => c.trim()).filter(Boolean));
}

function sourceFiles(dir: string): string[] {
    const SOURCE = /\.(tsx?|jsx?)$/;
    return readdirSync(dir).flatMap((e) => {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) return sourceFiles(p);
        return SOURCE.test(p) ? [p] : [];
    });
}

/** Files that talk to Postgres with the anon key (browser + public server pages). */
const anonClientFiles = sourceFiles(SRC)
    .map((p) => ({ path: relative(SRC, p).split(sep).join('/'), text: readFileSync(p, 'utf8') }))
    .filter((f) => /from ['"]@\/lib\/platform\/db\/supabase['"]/.test(f.text));

/**
 * Every `.from('sites')` query chain in those files, up to its end — or up to
 * the next `.from(`, since a Promise.all can hold several queries in one
 * statement and their filters are not this chain's.
 */
function sitesChains(): Array<{ path: string; chain: string }> {
    return anonClientFiles.flatMap((f) =>
        Array.from(f.text.matchAll(/\.from\(\s*['"]sites['"]\s*\)([\s\S]*?)(?:;|\n\s*\n|\.from\()/g))
            .map((m) => ({ path: f.path, chain: m[1] })),
    );
}

describe('055: server-only RPCs are not callable with the public key', () => {
    const FUNCTIONS = [
        'insights_top_items', 'insights_revenue_series', 'create_order_atomic',
        'cleanup_hardening_tables', 'check_rate_limit', 'delete_site', 'match_default_image',
    ];

    it.each(FUNCTIONS)('revokes EXECUTE on %s from PUBLIC, anon and authenticated', (fn) => {
        const sql = migration('055_');
        expect(sql).toMatch(new RegExp(
            `REVOKE EXECUTE ON FUNCTION public\\.${fn}\\([\\s\\S]*?\\)\\s*FROM PUBLIC, anon, authenticated;`,
        ));
    });
});

describe('056: the public key reads only the sites columns the app needs', () => {
    it('removes table-wide SELECT before granting columns', () => {
        expect(migration('056_')).toMatch(/REVOKE\s+SELECT\s+ON\s+public\.sites\s+FROM\s+anon\s*,\s*authenticated/i);
    });

    it.each([
        'qr_secret', 'gst_api_response', 'notification_emails', 'kot_station_device_id',
        'gstin', 'gst_legal_name', 'gst_owner_name', 'gst_trade_name', 'gst_address',
    ])('never grants %s to the public key', (col) => {
        expect(grantedSiteColumns().has(col)).toBe(false);
    });

    it('grants every column that browser code selects or filters on — else it breaks at runtime', () => {
        const granted = grantedSiteColumns();
        const missing: string[] = [];
        for (const { path, chain } of sitesChains()) {
            const sel = chain.match(/\.select\(\s*['"`]([^'"`]*)['"`]/);
            // An embedded relation — site_subscriptions(a, b, c) — is another
            // table's columns. Drop it whole before splitting: splitting first
            // left its middle columns looking like sites columns once an embed
            // named three.
            const own = sel ? sel[1].replace(/\w+\s*\([^)]*\)/g, '') : '';
            const cols = [
                ...own.split(','),
                ...Array.from(chain.matchAll(/\.(?:eq|neq|in|is|order|gt|lt|gte|lte)\(\s*['"](\w+)['"]/g), (m) => m[1]),
            ]
                .map((c) => c.trim())
                // an embedded relation like `site_subscriptions(store_plan` is another table
                .filter((c) => c && !c.includes('(') && !c.endsWith(')'));
            for (const c of cols) if (!granted.has(c)) missing.push(`${c}  (${path})`);
        }
        expect(missing).toEqual([]);
    });

    it('has no browser `select(*)` on sites — a wildcard fails once any column is revoked', () => {
        const stars = sitesChains().filter(({ chain }) => /\.select\(\s*['"`]\s*\*\s*['"`]/.test(chain));
        expect(stars.map((s) => s.path)).toEqual([]);
    });

    it('grants the columns other tables\' RLS policies read through sites', () => {
        // Policies on products, orders, banners … subquery sites as the caller.
        const granted = grantedSiteColumns();
        for (const c of ['id', 'user_id', 'is_live', 'is_open']) expect(granted.has(c)).toBe(true);
    });
});

describe('repo matches the live database', () => {
    it('keeps the migration that was applied live on 2026-09-20', () => {
        expect(existsSync(MIGRATIONS)).toBe(true);
        expect(migration('055_')).toContain('QA 2026-09-20');
    });
});
