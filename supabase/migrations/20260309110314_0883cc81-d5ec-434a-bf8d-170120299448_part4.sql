-- Storage RLS policies for quote-pdfs bucket
CREATE POLICY "Authenticated users can upload quote pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quote-pdfs');
