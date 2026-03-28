CREATE POLICY "Authenticated users can delete marketing attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'marketing-attachments');
