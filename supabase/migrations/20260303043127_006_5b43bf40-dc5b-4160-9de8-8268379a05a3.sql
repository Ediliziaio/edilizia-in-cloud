CREATE POLICY "call_logs_insert" ON public.call_logs FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT get_user_company_id(auth.uid())));
