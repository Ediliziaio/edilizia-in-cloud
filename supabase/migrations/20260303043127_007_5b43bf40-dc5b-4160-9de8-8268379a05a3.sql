CREATE POLICY "call_logs_update" ON public.call_logs FOR UPDATE TO authenticated
  USING (company_id = (SELECT get_user_company_id(auth.uid())) AND check_staff_visibility(auth.uid(), user_id));
