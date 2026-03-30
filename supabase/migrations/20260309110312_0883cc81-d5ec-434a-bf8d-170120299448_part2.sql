DROP POLICY IF EXISTS "Authenticated users can delete quote materials" ON public.storage;
CREATE POLICY "Authenticated users can delete quote materials"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quote-materials');
