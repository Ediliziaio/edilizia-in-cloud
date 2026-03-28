CREATE POLICY "campaign_costs_select" ON public.campaign_costs FOR SELECT TO authenticated
  USING (company_id = (SELECT get_user_company_id(auth.uid())));
