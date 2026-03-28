CREATE POLICY "campaign_costs_delete" ON public.campaign_costs FOR DELETE TO authenticated
  USING (company_id = (SELECT get_user_company_id(auth.uid())) AND has_role(auth.uid(), 'company_admin'::app_role));
