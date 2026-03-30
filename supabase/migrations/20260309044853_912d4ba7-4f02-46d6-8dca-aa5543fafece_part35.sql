DROP POLICY IF EXISTS "teams_update" ON public.teams;
CREATE POLICY "teams_update"
  ON public.teams FOR UPDATE TO authenticated
  USING (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );
