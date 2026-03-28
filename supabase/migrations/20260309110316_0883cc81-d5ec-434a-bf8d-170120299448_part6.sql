CREATE POLICY "Authenticated users can delete quote pdfs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quote-pdfs');
