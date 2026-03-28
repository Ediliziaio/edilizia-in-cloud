CREATE POLICY "company_upload_template_assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'quote-template-assets' AND
  (storage.foldername(name))[1] = (
    SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);
