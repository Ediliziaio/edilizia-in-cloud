DROP POLICY IF EXISTS "company_delete_template_assets" ON storage.objects;
CREATE POLICY "company_delete_template_assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'quote-template-assets' AND
  (storage.foldername(name))[1] = (
    SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);
