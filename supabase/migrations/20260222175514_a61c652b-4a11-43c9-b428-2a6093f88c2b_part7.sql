DROP POLICY IF EXISTS "Authenticated users can view marketing attachments" ON storage.objects;
CREATE POLICY "Authenticated users can view marketing attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'marketing-attachments');
