-- Allow anon to read published forms (for form-render edge function)
CREATE POLICY "lead_forms_anon_select" ON public.lead_forms
  FOR SELECT TO anon
  USING (is_published = true);
