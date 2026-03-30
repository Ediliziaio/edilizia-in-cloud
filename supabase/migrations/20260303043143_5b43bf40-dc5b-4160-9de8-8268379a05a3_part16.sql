DROP POLICY IF EXISTS "campaign_costs_update" ON public.campaign_costs;
CREATE POLICY "campaign_costs_update" ON public.campaign_costs FOR UPDATE TO authenticated
  USING (company_id = (SELECT get_user_company_id(auth.uid())));
