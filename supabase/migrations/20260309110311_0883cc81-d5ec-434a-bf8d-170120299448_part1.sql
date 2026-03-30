DROP POLICY IF EXISTS "Authenticated users can read quote materials" ON public.storage;
CREATE POLICY "Authenticated users can read quote materials"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quote-materials');
