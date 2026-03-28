-- Company admins can insert/update their own branding
CREATE POLICY "company_admin_manage_branding"
  ON public.company_branding FOR ALL
  TO authenticated
  USING (
    (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
     AND public.has_role(auth.uid(), 'company_admin'::app_role))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
     AND public.has_role(auth.uid(), 'company_admin'::app_role))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
