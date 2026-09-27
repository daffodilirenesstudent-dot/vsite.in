-- 060_close_public_write_paths.sql — security audit 2026-09-27 (H1, H2, M1).
--
-- Removes access that only an attacker was using. Every legitimate caller of
-- these tables is a server route on the service-role key, which bypasses RLS
-- and grants — except BulkImportModal, which reads the owner's own counter from
-- the browser and keeps that ability below. Verified: no browser code reads or
-- writes bill_requests/table_checkouts; every product-images upload uses the
-- Firebase-JWT client (role `authenticated`) into `<site id>/…` or `<slug>/…`.
-- Guarded by tests/security/dbWritePaths.test.ts.
--
-- Verify afterwards — each must return zero rows:
--   SELECT policyname FROM pg_policies WHERE schemaname IN ('public','storage')
--     AND cmd <> 'SELECT' AND roles && ARRAY['public','anon','authenticated']::name[]
--     AND (coalesce(qual,'') = 'true' OR coalesce(with_check,'') = 'true');
--   SELECT table_name FROM information_schema.role_table_grants WHERE grantee = 'anon'
--     AND privilege_type = 'INSERT' AND table_name IN ('orders','order_items','transactions');
--   SELECT policyname FROM pg_policies WHERE schemaname = 'storage'
--     AND cmd IN ('INSERT','UPDATE','DELETE','ALL') AND roles && ARRAY['public','anon']::name[];
--
-- Rollback (re-opens the holes; only if something legitimate breaks):
--   CREATE POLICY "service role full access" ON public.bill_requests FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY "service role full access" ON public.table_checkouts FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY service_role_all ON public.bulk_import_usage FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY anon_read ON public.bulk_import_usage FOR SELECT USING (true);
--   GRANT ALL ON public.bill_requests, public.table_checkouts, public.bulk_import_usage TO anon, authenticated;
--   GRANT INSERT ON public.orders, public.order_items, public.transactions TO anon;
--   CREATE POLICY "Anon Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images');
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id = 'product-images';

BEGIN;

-- ── H1 ──────────────────────────────────────────────────────────────────────
-- These policies were named for the service role but had no TO clause, so they
-- applied to PUBLIC: anyone with the anon key could read, rewrite and delete
-- the rows. The service role never needed them — it bypasses RLS.
DROP POLICY IF EXISTS "service role full access" ON public.bill_requests;
DROP POLICY IF EXISTS "service role full access" ON public.table_checkouts;
DROP POLICY IF EXISTS service_role_all ON public.bulk_import_usage;
DROP POLICY IF EXISTS anon_read ON public.bulk_import_usage;

REVOKE ALL ON public.bill_requests, public.table_checkouts, public.bulk_import_usage FROM anon, authenticated;

-- BulkImportModal shows the owner today's count, read from the browser.
GRANT SELECT ON public.bulk_import_usage TO authenticated;
DROP POLICY IF EXISTS bulk_import_usage_read_own ON public.bulk_import_usage;
CREATE POLICY bulk_import_usage_read_own ON public.bulk_import_usage
    FOR SELECT TO authenticated
    USING (user_id = ((SELECT auth.jwt()) ->> 'sub'));

-- ── M1 ──────────────────────────────────────────────────────────────────────
-- vsite takes no orders by any method. Ordering, when it returns, goes through
-- the service-role RPC process_order_v2; nothing needs a browser INSERT here.
REVOKE INSERT ON public.orders, public.order_items, public.transactions FROM anon;

-- ── H2 ──────────────────────────────────────────────────────────────────────
-- Uploads come from the dashboard with the owner's Firebase JWT, always into
-- `<site id>/…` or `<slug>/…`, always JPEG or WebP (imageCompress.ts).
DROP POLICY IF EXISTS "Anon Upload" ON storage.objects;
DROP POLICY IF EXISTS product_images_owner_insert ON storage.objects;
CREATE POLICY product_images_owner_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'product-images'
        AND EXISTS (
            SELECT 1 FROM public.sites s
            WHERE s.user_id = ((SELECT auth.jwt()) ->> 'sub')
              AND (storage.foldername(name))[1] IN (s.id::text, s.slug)
        )
    );

UPDATE storage.buckets
   SET file_size_limit = 10485760,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
 WHERE id = 'product-images';

COMMIT;
