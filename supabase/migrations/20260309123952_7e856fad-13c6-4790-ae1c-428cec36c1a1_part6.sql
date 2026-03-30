DROP POLICY IF EXISTS "super_admin_manage_wl_assets" ON storage.objects;
CREATE POLICY "super_admin_manage_wl_assets"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'white-label-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  bucket_id = 'white-label-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role)
);
