-- RLS policies for invoices-pdf bucket
DROP POLICY IF EXISTS "Company members can read invoice PDFs" ON storage.objects;
CREATE POLICY "Company members can read invoice PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices-pdf'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);
