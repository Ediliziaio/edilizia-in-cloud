DROP POLICY IF EXISTS "Service role can insert xml" ON storage.objects;
CREATE POLICY "Service role can insert xml" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'fatture-xml');
