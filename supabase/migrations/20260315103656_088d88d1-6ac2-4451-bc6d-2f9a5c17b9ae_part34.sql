DROP POLICY IF EXISTS "camp_v2_company_isolation" ON public.ai_campaigns_v2;
CREATE POLICY "camp_v2_company_isolation" ON ai_campaigns_v2
  FOR ALL USING (company_id = public.get_my_company_id());
