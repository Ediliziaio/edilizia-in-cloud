-- Storage policies for branding bucket
CREATE POLICY "branding_read_all" ON storage.objects FOR SELECT TO public USING (bucket_id = 'branding');
