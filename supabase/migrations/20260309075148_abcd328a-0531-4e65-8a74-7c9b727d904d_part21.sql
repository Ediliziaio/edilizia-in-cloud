CREATE POLICY "icmsg_upd" ON public.internal_chat_messages FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id() AND sender_id = auth.uid());
