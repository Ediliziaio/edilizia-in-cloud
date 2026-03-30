DROP POLICY IF EXISTS "super_admin_insert_assets" ON storage.objects;
CREATE POLICY "super_admin_insert_assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quote-template-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role));
