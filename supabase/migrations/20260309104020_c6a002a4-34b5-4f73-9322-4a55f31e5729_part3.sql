CREATE POLICY "qm_ins" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quote-materials' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
