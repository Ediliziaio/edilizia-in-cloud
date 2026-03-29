CREATE POLICY "el_config_company_isolation" ON ai_elevenlabs_config
  FOR ALL USING (company_id = public.get_my_company_id());
