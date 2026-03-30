DROP POLICY IF EXISTS "branding_update_admin" ON public.storage;
CREATE POLICY "branding_update_admin" ON storage.objects FOR UPDATE TO authenticated 
  USING (bucket_id = 'branding' AND (
    public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ));
