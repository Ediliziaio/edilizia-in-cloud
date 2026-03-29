CREATE POLICY "Company members can upload invoice PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices-pdf'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);
