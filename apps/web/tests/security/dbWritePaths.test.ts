/**
 * Database write paths reachable with the public anon key
 * (security audit 2026-09-27: H1, H2, M1, M4).
 *
 * The browser talks to Postgres directly, so RLS policies and grants — not API
 * routes — are the boundary. The live project was found with:
 *   H1  "service role full access" policies on bill_requests, table_checkouts
 *       and bulk_import_usage that had no TO clause, so they applied to PUBLIC:
 *       anyone could read, rewrite and delete those rows. bulk_import_usage is
 *       the OpenAI spend cap for bulk import.
 *   H2  storage policy "Anon Upload": anyone could upload any file of any size
 *       to product-images.
 *   M1  INSERT on orders/order_items/transactions granted to anon: the ordering
 *       freeze held in the API only, and forged revenue reached dashboards.
 *   M4  table-wide UPDATE (and INSERT) on sites for owners, so GST status,
 *       slug, qr_secret and consent could be rewritten from the browser.
 *
 * Supabase's security advisor flags none of these. These tests pin the fixing
 * migrations; the live-DB assertions they carry must return zero rows.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { detailsUpdate } from '@/lib/you/storeDetails';

const MIGRATIONS = join(__dirname, '..', '..', 'supabase', 'migrations');
const files = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
const read = (prefix: string) => {
    const f = files.find(n => n.startsWith(prefix));
    return f ? readFileSync(join(MIGRATIONS, f), 'utf8') : '';
};
const flat = (sql: string) => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ');

describe('060: close the public write paths', () => {
    const sql = flat(read('060_'));

    it('exists', () => {
        expect(sql).not.toBe('');
    });

    it.each([
        ['"service role full access"', 'bill_requests'],
        ['"service role full access"', 'table_checkouts'],
        ['service_role_all', 'bulk_import_usage'],
        ['anon_read', 'bulk_import_usage'],
    ])('H1: drops %s on %s', (policy, table) => {
        expect(sql).toContain(`DROP POLICY IF EXISTS ${policy} ON public.${table}`);
    });

    it('H1: takes every client grant off the three tables', () => {
        expect(sql).toMatch(
            /REVOKE ALL ON public\.bill_requests, public\.table_checkouts, public\.bulk_import_usage FROM anon, authenticated/,
        );
    });

    it("H1: an owner can still read their own bulk-import counter (BulkImportModal)", () => {
        expect(sql).toMatch(/GRANT SELECT ON public\.bulk_import_usage TO authenticated/);
        expect(sql).toMatch(
            /CREATE POLICY \w+ ON public\.bulk_import_usage FOR SELECT TO authenticated USING \(user_id = \(\(SELECT auth\.jwt\(\)\) ->> 'sub'\)\)/,
        );
    });

    it('M1: anon can no longer insert orders, order items or transactions', () => {
        expect(sql).toMatch(/REVOKE INSERT ON public\.orders, public\.order_items, public\.transactions FROM anon/);
    });

    it('H2: removes anonymous uploads', () => {
        expect(sql).toContain('DROP POLICY IF EXISTS "Anon Upload" ON storage.objects');
    });

    it("H2: uploads are an owner's, into a folder named for a store they own", () => {
        expect(sql).toMatch(/CREATE POLICY \w+ ON storage\.objects FOR INSERT TO authenticated/);
        expect(sql).toMatch(/bucket_id = 'product-images'/);
        expect(sql).toMatch(/s\.user_id = \(\(SELECT auth\.jwt\(\)\) ->> 'sub'\)/);
        expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\] IN \(s\.id::text, s\.slug\)/);
    });

    it('H2: the bucket takes only images, up to 10 MB', () => {
        expect(sql).toMatch(/file_size_limit = 10485760/);
        expect(sql).toMatch(/allowed_mime_types = ARRAY\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
    });
});

describe('061: owners write only the display fields of their store', () => {
    const sql = flat(read('061_'));
    const granted = (sql.match(/GRANT UPDATE \(([^)]*)\) ON public\.sites TO authenticated/)?.[1] ?? '')
        .split(',').map(c => c.trim()).filter(Boolean).sort();

    it('exists', () => {
        expect(sql).not.toBe('');
    });

    it('revokes table-wide INSERT and UPDATE on sites from browser roles', () => {
        expect(sql).toMatch(/REVOKE INSERT, UPDATE ON public\.sites FROM anon, authenticated/);
    });

    it('grants back exactly the columns the dashboard saves', () => {
        expect(granted).toEqual(['business_type', 'contact_number', 'location', 'name', 'pincode', 'timing']);
    });

    it('covers every field the You → Store form writes (a new field must be granted, or saving breaks)', () => {
        const form = {
            name: 'x', phone: '', location: '', pincode: '', businessType: '',
            timing: { open247: true, opensAt: '', closesAt: '' },
        } as unknown as Parameters<typeof detailsUpdate>[0];
        for (const col of Object.keys(detailsUpdate(form, null))) {
            expect(granted).toContain(col);
        }
    });

    it.each(['gst_status', 'gstin', 'gst_verified_at', 'slug', 'qr_secret', 'is_live', 'paid_store_consent_at', 'user_id'])(
        'does not let the browser write %s',
        col => {
            expect(granted).not.toContain(col);
        },
    );
});

describe('no later migration reopens what 060/061 closed', () => {
    it('every migration after 061 keeps the write paths shut', () => {
        for (const name of files.filter(f => f > '061_')) {
            const sql = flat(readFileSync(join(MIGRATIONS, name), 'utf8'));
            expect(sql, name).not.toMatch(/GRANT INSERT[^;]*ON public\.(orders|order_items|transactions)[^;]*TO anon/);
            expect(sql, name).not.toMatch(/"Anon Upload"/);
            expect(sql, name).not.toMatch(/GRANT (ALL|UPDATE|INSERT) ON (TABLE )?public\.sites TO (anon|authenticated)/);
        }
    });
});
