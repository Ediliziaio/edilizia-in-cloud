DROP POLICY IF EXISTS "Authenticated users can read own company signed pdfs" ON public.storage;
CREATE POLICY "Authenticated users can read own company signed pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quote-signed-pdfs');
