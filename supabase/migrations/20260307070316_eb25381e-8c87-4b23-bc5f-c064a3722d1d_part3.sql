CREATE POLICY "Auth users can delete campaign attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'campaign-attachments');
