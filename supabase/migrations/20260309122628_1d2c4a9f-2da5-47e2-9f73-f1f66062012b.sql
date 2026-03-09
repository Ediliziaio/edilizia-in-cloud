
-- Super admin policy for quote_templates
CREATE POLICY "super_admin_manage_all_templates"
ON public.quote_templates FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin storage policies for quote-template-assets bucket
CREATE POLICY "super_admin_select_assets"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quote-template-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super_admin_insert_assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quote-template-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super_admin_delete_assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quote-template-assets' AND public.has_role(auth.uid(), 'super_admin'::app_role));
