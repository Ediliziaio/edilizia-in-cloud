DROP POLICY IF EXISTS "qp_ins" ON storage.objects;
CREATE POLICY "qp_ins" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quote-pdfs' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
