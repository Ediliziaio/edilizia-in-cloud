DROP POLICY IF EXISTS "Authenticated users can update quote materials" ON storage.objects;
CREATE POLICY "Authenticated users can update quote materials"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'quote-materials');
