DROP POLICY IF EXISTS "campaign_costs_insert" ON public.campaign_costs;
CREATE POLICY "campaign_costs_insert" ON public.campaign_costs FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT get_user_company_id(auth.uid())));
