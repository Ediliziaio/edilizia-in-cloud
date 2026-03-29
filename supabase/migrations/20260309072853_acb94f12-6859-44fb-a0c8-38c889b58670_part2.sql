-- Company members can read their own branding
CREATE POLICY "company_members_read_branding"
  ON public.company_branding FOR SELECT
  TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
