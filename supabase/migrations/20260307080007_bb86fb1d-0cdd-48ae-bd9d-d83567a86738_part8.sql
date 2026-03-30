DROP POLICY IF EXISTS "Users can update own company messages" ON public.contact_messages;
CREATE POLICY "Users can update own company messages" ON public.contact_messages
  FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
