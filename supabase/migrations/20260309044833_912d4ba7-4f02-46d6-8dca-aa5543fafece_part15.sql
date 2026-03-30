DROP POLICY IF EXISTS "login_attempts_select_admin" ON public.login_attempts;
CREATE POLICY "login_attempts_select_admin"
  ON public.login_attempts FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT p.id FROM public.profiles p WHERE p.company_id = public.get_my_company_id()
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
