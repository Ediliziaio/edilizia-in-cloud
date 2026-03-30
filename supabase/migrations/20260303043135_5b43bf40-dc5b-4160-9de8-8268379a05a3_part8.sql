DROP POLICY IF EXISTS "call_logs_delete" ON public.call_logs;
CREATE POLICY "call_logs_delete" ON public.call_logs FOR DELETE TO authenticated
  USING (company_id = (SELECT get_user_company_id(auth.uid())) AND has_role(auth.uid(), 'company_admin'::app_role));
