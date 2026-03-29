CREATE POLICY "Authenticated users can delete prima nota attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'prima-nota-attachments');
