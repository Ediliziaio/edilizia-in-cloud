-- Storage policies
CREATE POLICY "Authenticated users can upload marketing attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'marketing-attachments');
