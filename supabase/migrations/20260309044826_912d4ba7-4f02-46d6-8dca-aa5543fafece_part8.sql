CREATE POLICY "user_sessions_select_admin"
  ON public.user_sessions FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
