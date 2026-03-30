DROP POLICY IF EXISTS "qp_del" ON storage.objects;
CREATE POLICY "qp_del" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'quote-pdfs' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
