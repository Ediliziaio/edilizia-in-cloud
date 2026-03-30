DROP POLICY IF EXISTS "Company members can delete invoice PDFs" ON public.storage;
CREATE POLICY "Company members can delete invoice PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoices-pdf'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);
