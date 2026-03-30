-- Add company-scoped UPDATE policies (missing from the first migration)
DROP POLICY IF EXISTS "qm_upd" ON storage.objects;
CREATE POLICY "qm_upd" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'quote-materials' AND (storage.foldername(name))[1] = ((auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')));
