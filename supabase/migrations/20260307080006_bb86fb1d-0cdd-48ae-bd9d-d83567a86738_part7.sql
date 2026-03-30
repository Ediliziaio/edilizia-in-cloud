DROP POLICY IF EXISTS "Users can insert own company messages" ON public.contact_messages;
CREATE POLICY "Users can insert own company messages" ON public.contact_messages
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
