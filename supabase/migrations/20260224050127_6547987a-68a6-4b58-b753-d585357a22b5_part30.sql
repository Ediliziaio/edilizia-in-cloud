CREATE POLICY "Admins can manage own company webhook subs"
  ON public.integration_webhook_subscriptions FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));
