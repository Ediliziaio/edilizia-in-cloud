DROP POLICY IF EXISTS "branding_insert_admin" ON storage.objects;
CREATE POLICY "branding_insert_admin" ON storage.objects FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'branding' AND (
    public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ));
