CREATE POLICY "icmsg_del" ON public.internal_chat_messages FOR DELETE TO authenticated USING (company_id = public.get_my_company_id() AND sender_id = auth.uid());
