-- Storage policies for branding bucket
DROP POLICY IF EXISTS "branding_read_all" ON public.storage;
CREATE POLICY "branding_read_all" ON storage.objects FOR SELECT TO public USING (bucket_id = 'branding');
