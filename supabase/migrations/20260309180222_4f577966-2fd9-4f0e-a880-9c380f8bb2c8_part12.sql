DROP POLICY IF EXISTS "form_views_service_all" ON public.form_views;
CREATE POLICY "form_views_service_all" ON public.form_views
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
