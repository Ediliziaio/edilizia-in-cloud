DROP POLICY IF EXISTS "Authenticated users can delete prima nota attachments" ON public.storage;
CREATE POLICY "Authenticated users can delete prima nota attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'prima-nota-attachments');
