CREATE POLICY "icmsg_sel" ON public.internal_chat_messages FOR SELECT TO authenticated USING (company_id = public.get_my_company_id());
