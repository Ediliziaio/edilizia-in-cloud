CREATE POLICY "lead_forms_service_all" ON public.lead_forms
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
