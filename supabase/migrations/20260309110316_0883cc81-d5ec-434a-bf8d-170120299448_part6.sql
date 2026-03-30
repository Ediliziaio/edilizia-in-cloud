DROP POLICY IF EXISTS "Authenticated users can delete quote pdfs" ON public.storage;
CREATE POLICY "Authenticated users can delete quote pdfs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quote-pdfs');
