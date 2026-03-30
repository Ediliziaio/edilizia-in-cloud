-- Storage policies for quote-signed-pdfs
DROP POLICY IF EXISTS "Authenticated users can upload signed pdfs" ON public.storage;
CREATE POLICY "Authenticated users can upload signed pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quote-signed-pdfs');
