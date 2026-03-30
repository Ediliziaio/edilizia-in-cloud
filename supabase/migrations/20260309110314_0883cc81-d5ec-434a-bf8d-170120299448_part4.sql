-- Storage RLS policies for quote-pdfs bucket
DROP POLICY IF EXISTS "Authenticated users can upload quote pdfs" ON storage.objects;
CREATE POLICY "Authenticated users can upload quote pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quote-pdfs');
