DROP POLICY IF EXISTS "form_submissions_service_all" ON public.form_submissions;
CREATE POLICY "form_submissions_service_all" ON public.form_submissions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
