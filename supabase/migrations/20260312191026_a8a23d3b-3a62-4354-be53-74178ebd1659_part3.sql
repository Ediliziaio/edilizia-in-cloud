DROP POLICY IF EXISTS "Service role can insert docs" ON storage.objects;
CREATE POLICY "Service role can insert docs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documenti-fiscali');
