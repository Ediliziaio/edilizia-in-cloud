CREATE POLICY "teams_insert"
  ON public.teams FOR INSERT TO authenticated
  WITH CHECK (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );
