CREATE POLICY "company_access_availability" ON public.user_availability
  FOR ALL USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );
