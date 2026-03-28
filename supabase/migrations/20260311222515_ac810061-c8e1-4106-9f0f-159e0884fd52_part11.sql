CREATE POLICY "company_access_availability_slots" ON public.user_availability_slots
  FOR ALL USING (
    availability_id IN (
      SELECT a.id FROM public.user_availability a
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE a.company_id = p.company_id
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );
