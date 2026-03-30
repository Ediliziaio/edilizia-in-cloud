-- Super admin storage policies for quote-template-assets bucket
DROP POLICY IF EXISTS "super_admin_select_assets" ON public.storage;
CREATE POLICY "super_admin_select_assets"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quote-template-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role));
