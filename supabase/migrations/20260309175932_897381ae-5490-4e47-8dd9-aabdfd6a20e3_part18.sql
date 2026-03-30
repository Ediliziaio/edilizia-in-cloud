DROP POLICY IF EXISTS "contact_attributions_service_all" ON public.contact_attributions;
CREATE POLICY "contact_attributions_service_all" ON public.contact_attributions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
