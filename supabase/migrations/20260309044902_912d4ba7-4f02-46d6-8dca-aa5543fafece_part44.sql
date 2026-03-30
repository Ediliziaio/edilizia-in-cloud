DROP POLICY IF EXISTS "team_members_update" ON public.team_members;
CREATE POLICY "team_members_update"
  ON public.team_members FOR UPDATE TO authenticated
  USING (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)))
  );
