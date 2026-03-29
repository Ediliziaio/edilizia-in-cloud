-- RLS policies: authenticated users can CRUD on their own company
CREATE POLICY "Users can view own company messages" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
