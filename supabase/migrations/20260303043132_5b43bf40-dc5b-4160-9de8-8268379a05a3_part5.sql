CREATE POLICY "call_logs_select" ON public.call_logs FOR SELECT TO authenticated
  USING (company_id = (SELECT get_user_company_id(auth.uid())) AND check_staff_visibility(auth.uid(), user_id));
