DROP POLICY IF EXISTS "icmsg_ins" ON public.internal_chat_messages;
CREATE POLICY "icmsg_ins" ON public.internal_chat_messages FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id() AND sender_id = auth.uid());
