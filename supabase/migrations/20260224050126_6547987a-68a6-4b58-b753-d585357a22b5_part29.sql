CREATE POLICY "Users can view own company webhook subs"
  ON public.integration_webhook_subscriptions FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
