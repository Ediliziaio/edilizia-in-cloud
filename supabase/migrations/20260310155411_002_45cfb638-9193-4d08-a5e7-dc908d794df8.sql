CREATE POLICY "Authenticated users can read own company signed pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quote-signed-pdfs');
