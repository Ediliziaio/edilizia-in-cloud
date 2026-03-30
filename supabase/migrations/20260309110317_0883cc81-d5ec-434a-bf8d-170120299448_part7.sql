DROP POLICY IF EXISTS "Authenticated users can update quote pdfs" ON storage.objects;
CREATE POLICY "Authenticated users can update quote pdfs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'quote-pdfs');
