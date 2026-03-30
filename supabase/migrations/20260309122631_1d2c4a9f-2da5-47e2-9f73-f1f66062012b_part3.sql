DROP POLICY IF EXISTS "super_admin_delete_assets" ON public.storage;
CREATE POLICY "super_admin_delete_assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quote-template-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role));
