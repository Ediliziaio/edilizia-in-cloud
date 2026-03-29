CREATE POLICY "team_members_select"
  ON public.team_members FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
