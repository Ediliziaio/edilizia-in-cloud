DROP POLICY IF EXISTS "qm_del" ON public.storage;
CREATE POLICY "qm_del" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'quote-materials' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
