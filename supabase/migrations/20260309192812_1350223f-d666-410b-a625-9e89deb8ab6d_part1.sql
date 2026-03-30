-- RLS policies for the bucket
DROP POLICY IF EXISTS "Authenticated users can upload prima nota attachments" ON public.storage;
CREATE POLICY "Authenticated users can upload prima nota attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'prima-nota-attachments');
