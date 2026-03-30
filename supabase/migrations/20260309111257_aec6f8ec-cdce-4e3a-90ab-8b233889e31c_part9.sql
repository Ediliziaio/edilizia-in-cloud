DROP POLICY IF EXISTS "qp_upd" ON storage.objects;
CREATE POLICY "qp_upd" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'quote-pdfs' AND (storage.foldername(name))[1] = ((auth.jwt() -> 'raw_app_meta_data' ->> 'company_id')));
