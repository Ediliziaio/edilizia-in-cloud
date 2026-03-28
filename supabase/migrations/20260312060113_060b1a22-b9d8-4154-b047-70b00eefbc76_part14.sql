CREATE POLICY "Users can view own company sms usage"
  ON public.phone_number_sms_usage FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());
