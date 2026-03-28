CREATE POLICY "wa_company_isolation" ON ai_whatsapp_numbers
  USING (company_id = public.get_my_company_id());
