-- Storage policies for quote-pdfs
DROP POLICY IF EXISTS "qp_sel" ON public.storage;
CREATE POLICY "qp_sel" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quote-pdfs' AND (storage.foldername(name))[1] = public.get_my_company_id()::text);
