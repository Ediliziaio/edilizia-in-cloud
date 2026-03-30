DROP POLICY IF EXISTS "branding_delete_admin" ON storage.objects;
CREATE POLICY "branding_delete_admin" ON storage.objects FOR DELETE TO authenticated 
  USING (bucket_id = 'branding' AND (
    public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ));
