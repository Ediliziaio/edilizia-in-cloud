-- RLS via campaign join
CREATE POLICY "campaign_contacts_company" ON public.ai_campaign_contacts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_campaigns_v2 c
      WHERE c.id = ai_campaign_contacts.campaign_id
        AND c.company_id = public.get_my_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_campaigns_v2 c
      WHERE c.id = ai_campaign_contacts.campaign_id
        AND c.company_id = public.get_my_company_id()
    )
  );
