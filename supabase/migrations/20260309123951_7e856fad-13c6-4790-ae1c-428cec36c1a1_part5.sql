DROP POLICY IF EXISTS "company_members_upload_wl_assets" ON storage.objects;
CREATE POLICY "company_members_upload_wl_assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'white-label-assets' AND
  (storage.foldername(name))[1] = (
    SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);
