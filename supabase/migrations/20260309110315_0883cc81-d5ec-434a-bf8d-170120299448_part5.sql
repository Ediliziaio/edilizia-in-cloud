CREATE POLICY "Authenticated users can read quote pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quote-pdfs');
