-- Storage policies for quote-materials
DROP POLICY IF EXISTS "qm_sel" ON storage.objects;
CREATE POLICY "qm_sel" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quote-materials' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
