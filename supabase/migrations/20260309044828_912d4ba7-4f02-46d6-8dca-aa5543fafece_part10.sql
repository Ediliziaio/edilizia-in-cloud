DROP POLICY IF EXISTS "user_sessions_update_admin" ON public.user_sessions;
CREATE POLICY "user_sessions_update_admin"
  ON public.user_sessions FOR UPDATE TO authenticated
  USING (
    (company_id = public.get_my_company_id()
      AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR user_id = auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
