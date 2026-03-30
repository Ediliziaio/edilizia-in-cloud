DROP POLICY IF EXISTS "Authenticated users can delete marketing attachments" ON storage.objects;
CREATE POLICY "Authenticated users can delete marketing attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'marketing-attachments');
