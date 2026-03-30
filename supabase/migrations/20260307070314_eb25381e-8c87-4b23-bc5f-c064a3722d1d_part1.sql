DROP POLICY IF EXISTS "Auth users can upload campaign attachments" ON storage.objects;
CREATE POLICY "Auth users can upload campaign attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'campaign-attachments');
