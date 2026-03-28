CREATE POLICY "Authenticated users can read prima nota attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'prima-nota-attachments');
