DROP POLICY IF EXISTS "Auth users can read campaign attachments" ON public.storage;
CREATE POLICY "Auth users can read campaign attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'campaign-attachments');
