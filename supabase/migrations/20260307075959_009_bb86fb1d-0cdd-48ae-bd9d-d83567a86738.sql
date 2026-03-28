CREATE POLICY "Users can delete own company messages" ON public.contact_messages
  FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
